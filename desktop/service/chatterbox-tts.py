"""Project KO's Chatterbox read-aloud worker.

The service keeps one of these alive and speaks one JSON line at a time:

    {"voice": "chatterbox", "text": "..."}   ->   {"audio": "<base64 wav>"}

Chatterbox runs on the GPU when there is one, and its weights come from the
folder the installer filled. The environment is set *before* anything heavy is
imported: huggingface_hub reads its cache and token paths once, at import, and
an inherited HF_HOME/HF_HUB_CACHE (this machine exports one, quoted) would
otherwise send it looking for a token on another drive.
"""
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else None
LOG = os.path.join(root, 'worker.log') if root else None


def log(text):
    """The service ignores this process's stderr, so failures are written down."""
    if not LOG:
        return
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 200_000:
            os.replace(LOG, LOG + '.1')
        with open(LOG, 'a', encoding='utf-8') as handle:
            handle.write(text.rstrip() + '\n')
    except Exception:
        pass


if root:
    hf = os.path.join(root, 'models', 'hf')
    os.environ['HF_HOME'] = hf
    os.environ['HF_HUB_CACHE'] = os.path.join(hf, 'hub')
    os.environ['HF_TOKEN_PATH'] = os.path.join(hf, 'token')
    os.environ['TORCH_HOME'] = os.path.join(root, 'models', 'torch')
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    # Once the weights are here, no request needs to leave the machine - and an
    # offline cache read never asks for a token at all.
    if os.path.isdir(os.path.join(hf, 'hub')):
        os.environ['HF_HUB_OFFLINE'] = '1'

import base64
import contextlib
import io
import json
import traceback
import wave

import numpy as np
import torch
import torchaudio

log('--- start ' + ' '.join([sys.executable, str(root)]))
log('HF ' + os.path.join(root or '', 'models', 'hf') if root else 'HF default')

try:
    with contextlib.redirect_stdout(sys.stderr):
        from chatterbox.tts import ChatterboxTTS
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        log('device ' + device)
        model = ChatterboxTTS.from_pretrained(device=device)
        log('model ready ' + str(getattr(model, 'sr', '?')))
except BaseException:
    log('startup failed\n' + traceback.format_exc())
    raise

# A reference clip the owner supplied turns the default voice into theirs.
reference = None
if root:
    for name in ('voice.wav', 'voice.flac', 'voice.mp3'):
        candidate = os.path.join(root, 'voices', name)
        if os.path.isfile(candidate):
            reference = candidate
            break
    log('voice clip ' + str(reference))

for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request.get('text')
        if not isinstance(text, str) or not 0 < len(text) <= 2000:
            raise ValueError()
        with contextlib.redirect_stdout(sys.stderr):
            if reference:
                wav = model.generate(text, audio_prompt_path=reference)
            else:
                wav = model.generate(text)
            samples = wav.squeeze(0).detach().cpu().numpy()
            audio = io.BytesIO()
            with wave.open(audio, 'wb') as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(model.sr)
                handle.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        print(json.dumps({'audio': base64.b64encode(audio.getvalue()).decode()}), flush=True)
    except Exception:
        log('speech failed\n' + traceback.format_exc())
        print(json.dumps({'error': 'Speech generation failed.'}), flush=True)

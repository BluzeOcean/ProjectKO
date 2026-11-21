"""Project KO's Chatterbox read-aloud worker.

The service keeps one of these alive and speaks one JSON line at a time:

    {"voice": "default", "text": "..."}   ->   {"audio": "<base64 wav>"}

Chatterbox runs on the GPU when there is one, and its weights come from the
folder the installer filled, so nothing here reaches the network.
"""
import base64
import contextlib
import io
import json
import os
import sys
import traceback
import wave

import numpy as np
import torch
import torchaudio

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


log('--- start ' + ' '.join([sys.executable, str(root)]))
if root:
    # The weights live with the engine: an inherited HF_HUB_CACHE would send the
    # loader looking on another drive.
    os.environ['HF_HOME'] = os.path.join(root, 'models', 'hf')
    os.environ['HF_HUB_CACHE'] = os.path.join(root, 'models', 'hf', 'hub')
    os.environ['TORCH_HOME'] = os.path.join(root, 'models', 'torch')

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

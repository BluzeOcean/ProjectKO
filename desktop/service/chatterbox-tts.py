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

import librosa
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
# The model reads the first ten seconds for the decoder and the first six for its
# token prompt, then averages the speaker embedding over everything it is given -
# so a long recording dilutes the voice instead of improving it. Keep the window
# short and make it speech.
REFERENCE_WINDOW = 15

import soundfile as sf


def usable_window(path):
    """Return (file to hand the model, description of what was used)."""
    audio, rate = librosa.load(path, sr=None, mono=True)
    seconds = len(audio) / rate if rate else 0
    if seconds <= REFERENCE_WINDOW * 1.5:
        return path, f'{seconds:.1f}s'
    width = int(REFERENCE_WINDOW * rate)
    envelope = np.concatenate([[0.0], np.cumsum(np.abs(audio))])
    energy = envelope[width:] - envelope[:-width]
    start = int(np.argmax(energy))
    trimmed = os.path.join(root, 'voices', 'clip-used.wav')
    sf.write(trimmed, audio[start:start + width], rate, subtype='PCM_16')
    return trimmed, f'{seconds:.1f}s -> {REFERENCE_WINDOW}s at {start / rate:.1f}s'


reference = None
if root:
    for name in ('voice.wav', 'voice.flac', 'voice.mp3', 'voice.m4a'):
        candidate = os.path.join(root, 'voices', name)
        if os.path.isfile(candidate):
            reference = candidate
            break
    if reference:
        try:
            reference, used = usable_window(reference)
            log('voice clip ' + used)
        except Exception:
            log('voice clip unreadable, using the built-in voice\n' + traceback.format_exc())
            reference = None
    else:
        log('voice clip None')

if reference:
    try:
        with contextlib.redirect_stdout(sys.stderr):
            model.prepare_conditionals(reference)
        log('conditionals ready')
    except Exception:
        log('conditionals failed\n' + traceback.format_exc())
        reference = None

for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request.get('text')
        if not isinstance(text, str) or not 0 < len(text) <= 2000:
            raise ValueError()
        with contextlib.redirect_stdout(sys.stderr):
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

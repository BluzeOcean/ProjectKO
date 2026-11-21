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
import time
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

# A recording turns the built-in voice into that speaker. The model reads the
# first ten seconds for the decoder and the first six for its token prompt, then
# averages the speaker embedding over everything it is given - so a long
# recording dilutes the voice instead of improving it. Keep the window short and
# make it speech.
REFERENCE_WINDOW = 15
TRIMMED = os.path.join(root, 'trimmed') if root else None

import soundfile as sf


def usable_window(path):
    """Return (file to hand the model, description of what was used)."""
    audio, rate = librosa.load(path, sr=None, mono=True)
    seconds = len(audio) / rate if rate else 0
    if seconds <= REFERENCE_WINDOW * 1.5:
        return path, f'{seconds:.1f}s'
    os.makedirs(TRIMMED, exist_ok=True)
    trimmed = os.path.join(TRIMMED, os.path.splitext(os.path.basename(path))[0] + '.wav')
    if os.path.isfile(trimmed) and os.path.getmtime(trimmed) >= os.path.getmtime(path):
        return trimmed, f'{seconds:.1f}s (trimmed earlier)'
    width = int(REFERENCE_WINDOW * rate)
    envelope = np.concatenate([[0.0], np.cumsum(np.abs(audio))])
    energy = envelope[width:] - envelope[:-width]
    start = int(np.argmax(energy))
    sf.write(trimmed, audio[start:start + width], rate, subtype='PCM_16')
    return trimmed, f'{seconds:.1f}s -> {REFERENCE_WINDOW}s at {start / rate:.1f}s'


# The voice that ships with the weights is what an empty reference means, and it
# is kept as it came so switching back never re-reads the weights file.
builtin = model.conds
voices = {}


def use_voice(reference):
    """Make the requested recording the voice to speak with."""
    if not reference:
        model.conds = builtin
        return 'builtin'
    if reference not in voices:
        used, note = usable_window(reference)
        with contextlib.redirect_stdout(sys.stderr):
            model.prepare_conditionals(used)
        voices[reference] = model.conds
        log('voice ready ' + os.path.basename(reference) + ' ' + note)
    else:
        model.conds = voices[reference]
    return os.path.basename(reference)

# Generation runs at roughly two thirds of real time on this class of card, so
# the app asks for the next segment while the current one is playing. The times
# below are what tells us whether that lead is holding.
for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request.get('text')
        if not isinstance(text, str) or not 0 < len(text) <= 2000:
            raise ValueError()
        reference = request.get('voice') or ''
        voice = use_voice(reference)
        started = time.time()
        with contextlib.redirect_stdout(sys.stderr):
            wav = model.generate(text)
        # generate() can rebuild the emotion conditioning; keep what it settled on.
        if reference:
            voices[reference] = model.conds
        samples = wav.squeeze(0).detach().cpu().numpy()
        audio = io.BytesIO()
        with wave.open(audio, 'wb') as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(model.sr)
            handle.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        log('spoke %.2fs for %.2fs of audio (%.0f chars, ratio %.2f, %s)' % (
            time.time() - started, len(samples) / model.sr, len(text),
            (time.time() - started) / max(len(samples) / model.sr, 0.01), voice))
        print(json.dumps({'audio': base64.b64encode(audio.getvalue()).decode(), 'voice': voice, 'chars': len(text)}), flush=True)
    except Exception:
        log('speech failed\n' + traceback.format_exc())
        print(json.dumps({'error': 'Speech generation failed.'}), flush=True)

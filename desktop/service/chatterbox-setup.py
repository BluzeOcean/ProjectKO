"""Install Project KO's Chatterbox read-aloud engine.

Run once, and again only if the install is damaged: the engine, its Python
environment and its model weights live together under one folder so the app can
tell "not installed" from "ready" by looking at a single marker file.

    python chatterbox-setup.py [install-root]

Progress is one JSON object per line on stdout; everything pip says goes to
stderr, which the app keeps as the install log. Weights are downloaded into the
same folder (HF_HOME), so uninstalling is deleting one directory.
"""
import json
import os
import subprocess
import sys
import venv
from pathlib import Path

TORCH_INDEX = 'https://download.pytorch.org/whl/cu128'
CUDA_INDEX = {  # the CUDA build that matches each torch line chatterbox pins
    '2.6': 'https://download.pytorch.org/whl/cu124',
    '2.7': 'https://download.pytorch.org/whl/cu126',
    '2.8': 'https://download.pytorch.org/whl/cu128',
}
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'ProjectKO' / 'voice' / 'chatterbox'
VENV = ROOT / 'venv'
MODELS = ROOT / 'models'
PY = VENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
MARKER = ROOT / 'ready.json'


def say(phase, percent, message):
    print(json.dumps({'phase': phase, 'percent': percent, 'message': message}), flush=True)


def env():
    """Everything the downloader reads, pointed inside the install folder.

    This machine already exports HF_HUB_CACHE (and quotes it), which outranks
    HF_HOME, so the inherited values are dropped rather than overridden: the
    weights belong to this install, on this drive, or uninstalling leaves a
    gigabyte behind on another one.
    """
    values = dict(os.environ)
    for key in ('HF_HOME', 'HF_HUB_CACHE', 'HUGGINGFACE_HUB_CACHE', 'TRANSFORMERS_CACHE', 'TORCH_HOME', 'HF_XET_CACHE'):
        values.pop(key, None)
    values.update({
        'HF_HOME': str(MODELS / 'hf'),
        'HF_HUB_CACHE': str(MODELS / 'hf' / 'hub'),
        'TORCH_HOME': str(MODELS / 'torch'),
        'HF_HUB_DISABLE_TELEMETRY': '1',
        'PYTHONIOENCODING': 'utf-8',
    })
    return values


def run(args, phase_from, phase_to, label):
    """Run a command, echo its output to stderr, and creep a percent as it works."""
    percent = phase_from
    say('install', percent, label)
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', env=env())
    for line in process.stdout:
        text = line.rstrip()
        if not text:
            continue
        print(text, file=sys.stderr, flush=True)
        if percent < phase_to and ('Downloading' in text or 'Installing' in text or 'Collecting' in text or 'Using cached' in text):
            percent = min(phase_to, percent + max(1, (phase_to - percent) // 3))
            say('install', percent, text[:160])
    if process.wait() != 0:
        raise SystemExit('step failed: ' + ' '.join(str(part) for part in args[:4]))


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    MODELS.mkdir(parents=True, exist_ok=True)
    if MARKER.exists():
        MARKER.unlink()

    if not PY.exists():
        say('install', 3, 'Creating the Python environment')
        venv.EnvBuilder(with_pip=True, clear=True).create(str(VENV))
    else:
        say('install', 3, 'Python environment already present')

    run([str(PY), '-m', 'pip', 'install', '--upgrade', 'pip', '--progress-bar', 'off'], 5, 8, 'Updating pip')
    # Chatterbox pins its own torch and pip would fetch the CPU wheel from PyPI.
    # Install it first, then swap in the CUDA build of the same version, or the
    # engine silently speaks on the processor.
    run([str(PY), '-m', 'pip', 'install', '--progress-bar', 'off', 'chatterbox-tts==0.1.7'], 8, 45, 'Installing Chatterbox (about 300 MB)')
    probe = subprocess.run([str(PY), '-c', 'import torch; print(torch.__version__.split("+")[0])'], capture_output=True, text=True, env=env())
    version = (probe.stdout or '').strip() or '2.6.0'
    index = CUDA_INDEX.get(version.rsplit('.', 1)[0], TORCH_INDEX)
    tag = 'cu' + index.rsplit('/cu', 1)[-1]
    run([str(PY), '-m', 'pip', 'install', '--progress-bar', 'off', '--index-url', index, f'torch=={version}+{tag}', f'torchaudio=={version}+{tag}'], 45, 78, f'Swapping PyTorch {version} for its CUDA build (about 2.5 GB)')

    say('model', 82, 'Downloading the Chatterbox voice (about 2 GB, once)')
    probe = (
        'import torch, pathlib;'
        'from chatterbox.tts import ChatterboxTTS;'
        'device = "cuda" if torch.cuda.is_available() else "cpu";'
        'print("device", device);'
        'model = ChatterboxTTS.from_pretrained(device=device);'
        'print("sample_rate", model.sr)'
    )
    process = subprocess.Popen([str(PY), '-c', probe], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', env=env())
    for line in process.stdout:
        text = line.rstrip()
        if not text:
            continue
        print(text, file=sys.stderr, flush=True)
        if 'Downloading' in text or '%' in text:
            say('model', 85, text[:160])
    if process.wait() != 0:
        raise SystemExit('the voice could not be loaded')

    MARKER.write_text(json.dumps({'engine': 'chatterbox', 'version': '0.1.7', 'python': str(PY), 'models': str(MODELS)}), encoding='utf-8')
    say('ready', 100, 'Chatterbox is ready')


if __name__ == '__main__':
    try:
        main()
    except SystemExit as error:
        say('failed', 0, str(error))
        raise

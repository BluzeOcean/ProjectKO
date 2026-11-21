import base64, contextlib, io, json, os, sys, wave
from pathlib import Path
import numpy as np
import onnxruntime as rt
from kokoro_onnx import Kokoro
root = Path(sys.argv[1])
with contextlib.redirect_stdout(sys.stderr):
    # Kokoro is a small model and speech is a burst of work: it scales with the
    # cores it is given, up to a point. Four threads took 6.97 s to speak 3.18 s
    # on a 24-core machine; sixteen took 2.44 s. Cap at 16 so the rest of the app
    # keeps its cores, and keep inter-op at 1 because the graph is a chain.
    workers = max(1, min(os.cpu_count() or 4, 16))
    options = rt.SessionOptions(); options.intra_op_num_threads = workers; options.inter_op_num_threads = 1
    session = rt.InferenceSession(str(root / 'kokoro-v1.0.int8.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    engine = Kokoro.from_session(session, str(root / 'voices-v1.0.bin'))
for line in sys.stdin:
    try:
        request = json.loads(line)
        voice = request['voice']
        if voice not in ('am_michael', 'bf_emma') or not isinstance(request['text'], str) or not 0 < len(request['text']) <= 2000: raise ValueError()
        with contextlib.redirect_stdout(sys.stderr):
            samples, rate = engine.create(request['text'], voice=voice, lang='en-us' if voice == 'am_michael' else 'en-gb')
        audio = io.BytesIO()
        with wave.open(audio, 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate)
            wav.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        print(json.dumps({'audio': base64.b64encode(audio.getvalue()).decode()}), flush=True)
    except Exception:
        print(json.dumps({'error': 'Local speech generation failed.'}), flush=True)

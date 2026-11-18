"""Voice-over for the KaTuro reel: one WAV per scene (Piper, en_US-lessac-high, offline).
Writes vo/<id>.wav and vo/lines.json with each line's length in seconds."""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

here = Path(__file__).parent
model = Path(sys.argv[1])
out = here / "vo"
out.mkdir(exist_ok=True)

# Spelled for the voice: "Katuro Desk" (not "KaTuroDesk"), "katuro dot website".
LINES = [
    ("night", "This is Teacher Ana. It's eleven at night, and she's still making slides, lesson plans, and checking papers."),
    ("ask", "So tonight, she tries something new. She simply tells Katuro Desk what she needs for tomorrow."),
    ("sleep", "Then she goes to bed. While she sleeps, Katuro Desk prepares her lesson log, her PowerPoint, a quiz, and worksheets, all ready in her Lessons folder."),
    ("morning", "Good morning! Her phone reminds her: everything for today is ready."),
    ("scores", "After the quiz, she snaps the checked papers with her phone. The scores go straight into her class record, with a backup first."),
    ("teach", "And the rest of her time? She spends it where it matters most. Teaching."),
    ("recap", "Lesson plans, slides, quizzes, scores, and reminders. All on your own computer."),
    ("cta", "Katuro Desk, and the Katuro App. Less paperwork. More teaching. Get it at katuro dot website."),
]

voice = PiperVoice.load(str(model))
config = SynthesisConfig(length_scale=1.04, noise_scale=0.6, noise_w_scale=0.8)
lengths = {}
for key, text in LINES:
    path = out / f"{key}.wav"
    with wave.open(str(path), "wb") as w:
        voice.synthesize_wav(text, w, syn_config=config)
    with wave.open(str(path), "rb") as r:
        lengths[key] = round(r.getnframes() / r.getframerate(), 3)
    print(key, lengths[key])
(out / "lines.json").write_text(json.dumps({"lines": [{"id": k, "text": t, "seconds": lengths[k]} for k, t in LINES]}, indent=2))
print("total", round(sum(lengths.values()), 2))

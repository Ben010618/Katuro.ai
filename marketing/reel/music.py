"""Background music and sound effects for the reel, made here (no outside audio).
music.wav: a soft plucked loop (C - G - Am - F), 60 s.  chime.wav, buzz.wav, snap.wav: effects."""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
here = Path(__file__).parent / "sfx"
here.mkdir(exist_ok=True)


def write(path, samples):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))


def pluck(buf, start, freq, length=0.9, vol=0.22):
    """A soft plucked string (a few harmonics, fast attack, gentle decay)."""
    n0 = int(start * RATE)
    for i in range(int(length * RATE)):
        if n0 + i >= len(buf):
            break
        t = i / RATE
        env = min(1, t / 0.006) * math.exp(-t * 4.2)
        s = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(4 * math.pi * freq * t) + 0.12 * math.sin(6 * math.pi * freq * t)
        buf[n0 + i] += s * env * vol


NOTE = {n: 261.63 * 2 ** (k / 12) for k, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
CHORDS = [("C", ["C", "E", "G"]), ("G", ["G", "B", "D"]), ("A", ["A", "C", "E"]), ("F", ["F", "A", "C"])]

music = [0.0] * (RATE * 61)
beat = 60 / 96  # 96 BPM
pattern = [0, 1, 2, 1, 0, 2, 1, 2]  # arpeggio, eighth notes
t = 0.0
bar = 0
while t < 60:
    root, tones = CHORDS[bar % 4]
    pluck(music, t, NOTE[root] / 2, length=2.2, vol=0.16)  # soft bass
    for k, idx in enumerate(pattern):
        f = NOTE[tones[idx]] * (2 if idx == 2 and k % 4 == 3 else 1)
        pluck(music, t + k * beat / 2, f, vol=0.11)
    t += beat * 4
    bar += 1
fade = int(2.5 * RATE)
for i in range(fade):
    music[60 * RATE - fade + i] *= 1 - i / fade
write(here / "music.wav", music[: 60 * RATE])

# A bright two-note chime (the morning reminder).
chime = [0.0] * int(RATE * 1.6)
pluck(chime, 0.0, 1318.5, length=1.5, vol=0.35)
pluck(chime, 0.16, 1760.0, length=1.4, vol=0.35)
write(here / "chime.wav", chime)

# A phone buzz (vibration): a low hum pulsing twice.
buzz = []
for i in range(int(RATE * 0.9)):
    t = i / RATE
    on = 1 if (t % 0.45) < 0.32 else 0
    buzz.append(on * 0.5 * math.copysign(1, math.sin(2 * math.pi * 170 * t)) * (0.6 + 0.4 * math.sin(2 * math.pi * 30 * t)))
write(here / "buzz.wav", buzz)

# A camera shutter: two short clicks of noise.
random.seed(7)
snap = [0.0] * int(RATE * 0.25)
for at in (0.0, 0.07):
    for i in range(int(RATE * 0.04)):
        snap[int(at * RATE) + i] += random.uniform(-1, 1) * math.exp(-i / (RATE * 0.008)) * 0.8
write(here / "snap.wav", snap)
print("ok")

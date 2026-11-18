"""Frames + voice-over + music + effects → the 60-second reel (1080 × 1920, H.264/AAC)."""
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

here = Path(__file__).parent
out = Path(sys.argv[1])
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

LEAD = 0.45
SCENES = [("night", 0), ("ask", 7.6), ("sleep", 13.6), ("morning", 24.2), ("scores", 29.4), ("teach", 37.6), ("recap", 42.6), ("cta", 49.2)]
# (file, start seconds, volume)
tracks = [(here / "sfx" / "music.wav", 0, 0.16)]
tracks += [(here / "vo" / f"{sid}.wav", at + LEAD, 1.0) for sid, at in SCENES]
tracks += [
    (here / "sfx" / "buzz.wav", 24.5, 0.35),   # BZZT! the phone
    (here / "sfx" / "chime.wav", 24.75, 0.4),  # the morning reminder
    (here / "sfx" / "snap.wav", 30.6, 0.6),    # SNAP! the checked paper
]

cmd = [ffmpeg, "-y", "-framerate", "30", "-i", str(here / "frames" / "f%05d.jpg")]
for f, _, _ in tracks:
    cmd += ["-i", str(f)]
parts = []
for k, (_, at, vol) in enumerate(tracks, start=1):
    ms = int(round(at * 1000))
    parts.append(f"[{k}:a]aresample=44100,volume={vol},adelay={ms}|{ms}[a{k}]")
mix = "".join(f"[a{k}]" for k in range(1, len(tracks) + 1))
parts.append(f"{mix}amix=inputs={len(tracks)}:normalize=0,apad,atrim=0:60,loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=44100:channel_layouts=stereo[aout]")
cmd += [
    "-filter_complex", ";".join(parts),
    "-map", "0:v", "-map", "[aout]",
    "-vf", "scale=in_range=full:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "192k",
    "-t", "60", "-movflags", "+faststart",
    str(out),
]
subprocess.run(cmd, check=True)
print("wrote", out)

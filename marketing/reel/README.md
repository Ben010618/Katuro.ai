# KaTuro 60-second reel (TikTok / Reels, 1080 × 1920)

Teacher Ana's day with KaTuroDesk and the KaTuro App: comic-style animation, voice-over,
subtitles, music and sound effects, all made on this computer.

| File | What it is |
|---|---|
| `reel.html` | The animation. Open `reel.html` (through a local web server) to watch it; `?t=12` shows second 12. Scene times are in `SCENES`, texts in `TEXT`. |
| `vo.py` | The voice-over (Piper, voice `en_US-lessac-high`, offline): one WAV per scene in `vo/`. |
| `music.py` | The background music and the effects (buzz, chime, shutter) in `sfx/`. |
| `render-frames.mjs` | Saves the 1,800 frames (30 fps) to `frames/` from `reel.html?frames=1`. |
| `encode.py` | Frames + voice + music + effects → the MP4 (H.264/AAC, −14 LUFS). |

## Make it again

1. `python -m venv reelenv` then `reelenv\Scripts\pip install piper-tts imageio-ffmpeg`
2. `python -m piper.download_voices en_US-lessac-high` (once)
3. `reelenv\Scripts\python vo.py en_US-lessac-high.onnx` and `reelenv\Scripts\python music.py`
4. Serve this folder (`reelenv\Scripts\python -m http.server 5300`), run `render-frames.mjs`
   on `http://127.0.0.1:5300/reel.html?frames=1` with a Playwright browser
5. `reelenv\Scripts\python encode.py KaTuro-Reel-60s.mp4`

If a voice line changes length, update `VO` in `reel.html` (from `vo/lines.json`) and the
scene starts in both `reel.html` and `encode.py`.

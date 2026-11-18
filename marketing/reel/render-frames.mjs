export default async function run(page) {
  const FPS = 30;
  const N = 60 * FPS;
  const dir = process.env.REEL_FRAMES || 'frames'; // where the frames go (marketing/reel/frames)
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  const started = Date.now();
  for (let i = 0; i < N; i += 1) {
    const h = (i / FPS).toFixed(4);
    await page.evaluate((hh) => new Promise((res) => {
      location.hash = hh;
      const check = () => (document.title === `f${hh}` ? res() : requestAnimationFrame(check));
      check();
    }), h);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  return { frames: N, seconds: Math.round((Date.now() - started) / 1000) };
}

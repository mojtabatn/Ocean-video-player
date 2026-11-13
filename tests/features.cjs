// Feature checks beyond the engine: URL playback, screenshot, mini player, A-B repeat, speed, subtitles delay.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const [mediaDir, outDir, baseUrl] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const home = path.join(outDir, 'feat-home-' + Date.now());
  const app = await _electron.launch({
    executablePath: require(path.join(root, 'node_modules/electron')),
    args: [root, '--no-sandbox'],
    cwd: root,
    env: { ...process.env, OCEAN_USER_DATA: path.join(home, 'profile'), HOME: home, XDG_PICTURES_DIR: path.join(home, 'Pictures') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.waitForFunction(() => !!window.__oceanPlayer);
  const snap = () => page.evaluate(() => { const s = window.__oceanPlayer.getSnapshot(); return { mode: s.mode, t: +s.time.toFixed(2), playing: s.playing, rate: s.rate, error: s.error, title: s.title }; });
  const results = {};

  // URL playback (MKV over HTTP → ffmpeg reads the URL and remuxes).
  await page.keyboard.press('Control+U');
  await page.fill('.dialog input', `${baseUrl}/Test%20Movie%202024.mkv`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__oceanPlayer.getSnapshot().time > 1.5, null, { timeout: 25000 }).catch(() => {});
  let s = await snap();
  console.log('url:', JSON.stringify(s));
  results.url = s.playing && s.t > 1.5 && s.mode === 'remux';
  await page.evaluate(() => window.__oceanPlayer.seek(30));
  await sleep(2500);
  s = await snap();
  console.log('url seek 30:', JSON.stringify(s));
  results.urlSeek = s.t >= 28 && s.t < 34;

  // Speed
  await page.mouse.move(700, 400);
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  s = await snap();
  results.speed = s.rate === 1.5;
  console.log('speed:', s.rate, await page.locator('.osd').textContent().catch(() => ''));

  // Screenshot (ffmpeg, full resolution)
  await page.keyboard.press('Control+E');
  await sleep(2500);
  const shotDir = path.join(home, 'Pictures', 'Ocean');
  const files = fs.existsSync(shotDir) ? fs.readdirSync(shotDir) : [];
  console.log('screenshots:', files);
  results.screenshot = files.some((f) => f.endsWith('.png'));

  // A-B repeat: A at current, B 2 s later → time stays in [A, B].
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  const a = (await snap()).t;
  await page.keyboard.press('R');
  await sleep(2200);
  // Read B before pressing: right after setting it the player may already have looped back to A.
  const b = (await snap()).t;
  await page.keyboard.press('R');
  await sleep(3500);
  s = await snap();
  console.log('A-B', a, b, '→', s.t);
  results.abRepeat = b > a + 1 && s.t >= a - 0.5 && s.t <= b + 0.6;
  await page.keyboard.press('R');

  // Mini player
  await page.keyboard.press('Control+M');
  await sleep(800);
  const mini = await page.evaluate(() => [innerWidth, innerHeight, document.querySelector('.app').className]);
  console.log('mini:', mini);
  results.mini = mini[0] === 480 && mini[2].includes('is-mini');
  await page.screenshot({ path: path.join(outDir, 'feat-mini.png') });
  await page.keyboard.press('Control+M');
  await sleep(800);
  const restored = await page.evaluate(() => [innerWidth, innerHeight]);
  results.miniRestore = restored[0] === 1440;

  // Fullscreen
  await page.keyboard.press('F');
  await sleep(1000);
  const fsState = await page.evaluate(() => document.querySelector('.app').className.includes('is-fullscreen'));
  results.fullscreen = fsState;
  await page.keyboard.press('Escape');
  await sleep(800);

  console.table(results);
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

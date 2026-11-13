// End-to-end check of the playback engine in the real Electron app.
// Usage: xvfb-run -a node tests/e2e.cjs <media-dir> <out-dir>
const { _electron } = require('playwright');
const path = require('path');

const root = path.resolve(__dirname, '..');
const [mediaDir, outDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(file) {
  const app = await _electron.launch({
    executablePath: require(path.join(root, 'node_modules/electron')),
    args: [root, '--no-sandbox', ...(file ? [path.join(mediaDir, file)] : [])],
    cwd: root,
    env: { ...process.env, OCEAN_USER_DATA: path.join(outDir, 'e2e-profile-' + Date.now()) },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.__oceanPlayer);
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  return { app, page };
}

const snap = (page) => page.evaluate(() => {
  const s = window.__oceanPlayer.getSnapshot();
  return { mode: s.mode, reason: s.plan?.reason, enc: s.plan?.videoEncoder, time: +s.time.toFixed(2), duration: +s.duration.toFixed(2),
    playing: s.playing, loading: s.loading, error: s.error, audioIndex: s.audioIndex, w: s.videoWidth, h: s.videoHeight };
});

async function waitFor(page, pred, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await snap(page);
    if (pred(s)) return s;
    await sleep(250);
  }
  return snap(page);
}

(async () => {
  const results = [];
  for (const file of ['Direct Clip.mp4', 'Test Movie 2024.mkv', 'Old Xvid Clip.avi', 'Anime 10bit.mkv']) {
    console.log(`\n== ${file}`);
    const { app, page } = await launch(file);
    const r = { file };
    let s = await waitFor(page, (s) => s.playing && s.time > 1.2);
    console.log('  start:', JSON.stringify(s));
    r.mode = s.mode;
    r.startOk = s.playing && s.time > 1 && !s.error && s.w > 0;

    // Subtitle shown at ~2 s?
    const cue = await page.evaluate(() => [...document.querySelectorAll('.subtitles__cue')].map((e) => e.textContent).join(' | '));
    if (cue) console.log('  subtitle:', cue);
    r.subtitle = cue || null;

    // Seek far ahead (outside buffer for streams → ffmpeg restart).
    await page.evaluate(() => window.__oceanPlayer.seek(22));
    s = await waitFor(page, (s) => s.playing && s.time > 22.3 && !s.loading, 15000);
    console.log('  after seek 22:', JSON.stringify(s));
    r.seekOk = s.time >= 22 && s.time < 26;

    // Frame accuracy: pause, grab the displayed frame, compare with ffmpeg's frame at the reported time.
    if (s.w > 0) {
      const shot = await page.evaluate(async () => {
        const p = window.__oceanPlayer;
        p.pause();
        await new Promise((r) => setTimeout(r, 300));
        const v = p.video;
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = Math.round((320 * v.videoHeight) / v.videoWidth);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return { t: p.time, url: c.toDataURL('image/png') };
      });
      const fs = require('fs');
      const { execFileSync } = require('child_process');
      const base = path.join(outDir, file.replace(/\W+/g, '_'));
      fs.writeFileSync(base + '-shown.png', Buffer.from(shot.url.split(',')[1], 'base64'));
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(shot.t), '-i', path.join(mediaDir, file), '-frames:v', '1', '-vf', 'scale=320:-2', base + '-ref.png']);
      let diff = 'n/a';
      try {
        // testsrc's seconds counter sits at this spot; comparing just it makes a 1 s offset obvious.
        for (const f of ['-shown', '-ref']) execFileSync('convert', [base + f + '.png', '-crop', '74x58+214+60', '+repage', base + f + '-digits.png']);
        diff = execFileSync('compare', ['-metric', 'RMSE', base + '-shown-digits.png', base + '-ref-digits.png', 'null:'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      } catch (e) {
        diff = e.stderr.toString();
      }
      const rmse = Number(/\(([\d.]+)\)/.exec(diff)?.[1] ?? 1);
      console.log(`  frame check at ${shot.t.toFixed(2)}s: RMSE ${rmse.toFixed(4)}`);
      r.frameOk = rmse < 0.12;
      await page.evaluate(() => window.__oceanPlayer.play());
    }

    if (file.startsWith('Test Movie')) {
      await page.screenshot({ path: path.join(outDir, 'e2e-mkv-sub.png') });
      await page.evaluate(() => window.__oceanPlayer.setAudioTrack(1));
      await sleep(600);
      s = await waitFor(page, (s) => s.playing && s.audioIndex === 1 && s.time > 22.5, 15000);
      console.log('  audio track 1:', JSON.stringify(s));
      r.audioSwitchOk = s.audioIndex === 1 && s.playing && s.time > 22;
      const thumb = await page.evaluate(() => window.__oceanPlayer.thumbnail(10).then((t) => (t ? t.length : 0)));
      console.log('  thumbnail bytes:', thumb);
      r.thumbOk = thumb > 1000;
      const sub = await page.evaluate(() => window.__oceanPlayer.extractSubtitle(1).then((x) => x && x.format + ':' + x.text.length));
      console.log('  extract ASS track:', sub);
      r.extractOk = !!sub && sub.startsWith('ass');
      await page.evaluate(() => window.__oceanPlayer.setAudioDelay(-0.5));
      s = await waitFor(page, (s) => s.playing && !s.loading, 10000);
      await sleep(1500);
      s = await snap(page);
      console.log('  audio delay -0.5:', JSON.stringify(s));
      r.negDelayOk = s.playing && !s.error;
    }
    results.push(r);
    await app.close();
  }
  console.log('\nRESULTS');
  console.table(results);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Captures UI states for visual review: home, menus, dialogs, playlist.
const { _electron } = require('playwright');
const path = require('path');
const root = path.resolve(__dirname, '..');
const [mediaDir, outDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(args = []) {
  const app = await _electron.launch({
    executablePath: require(path.join(root, 'node_modules/electron')),
    args: [root, '--no-sandbox', ...args],
    cwd: root,
    env: { ...process.env, OCEAN_USER_DATA: path.join(outDir, 'ui-profile-' + Date.now()) },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.waitForFunction(() => !!window.__oceanPlayer);
  return { app, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `ui-${name}.png`) });

(async () => {
  // Home
  let { app, page } = await launch();
  await sleep(1500);
  await shot(page, 'home');
  await app.close();

  // Player with menus
  ({ app, page } = await launch([path.join(mediaDir, 'Test Movie 2024.mkv')]));
  await page.waitForFunction(() => window.__oceanPlayer.getSnapshot().time > 1.5, null, { timeout: 20000 });
  await page.evaluate(() => { window.__oceanPlayer.seek(2.5); window.__oceanPlayer.pause(); });
  await sleep(800);
  await page.click('.tb[aria-label="Menu"]');
  await sleep(300);
  await page.hover('.menu__item:has-text("Subtitles")');
  await sleep(400);
  await shot(page, 'menu-subtitles');
  await page.hover('.menu__item:has-text("Video")');
  await sleep(300);
  await shot(page, 'menu-video');
  await page.hover('.menu__item:has-text("Audio")');
  await sleep(300);
  await shot(page, 'menu-audio');
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 400);
  await sleep(200);
  await page.evaluate(() => window.__oceanPlayer.pause());

  // Seek preview
  const bar = await page.locator('.controls__seek').boundingBox();
  await page.mouse.move(bar.x + bar.width * 0.4, bar.y + bar.height / 2);
  await sleep(1500);
  await page.mouse.move(bar.x + bar.width * 0.41, bar.y + bar.height / 2);
  await sleep(1200);
  await shot(page, 'seek-preview');
  await page.mouse.move(700, 300);

  for (const [key, name] of [['Control+I', 'mediainfo'], ['Control+/', 'shortcuts'], ['Control+,', 'settings']]) {
    await page.keyboard.press(key);
    await sleep(400);
    await shot(page, name);
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await page.click('.tb[aria-label="Menu"]');
  await page.hover('.menu__item:has-text("Subtitles")');
  await sleep(200);
  await page.click('.menu--sub .menu__item:has-text("Subtitle Settings")');
  await sleep(400);
  await shot(page, 'subtitle-settings');
  await page.keyboard.press('Escape');
  await page.click('.tb[aria-label="Menu"]');
  await page.hover('.menu__item:has-text("Audio")');
  await sleep(200);
  await page.click('.menu--sub .menu__item:has-text("Equalizer")');
  await sleep(400);
  await shot(page, 'equalizer');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+L');
  await sleep(400);
  await shot(page, 'playlist');
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

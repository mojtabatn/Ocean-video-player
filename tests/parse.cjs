// Runs the tejaratban.top parsers against saved pages in tests/fixtures/tejaratban.
const path = require('path');
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../electron/online/tejaratban-parse.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(__dirname, '.parse.cjs'), logLevel: 'error' });
const { parseTrending } = require('./.parse.cjs');
const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/tejaratban/home.html'), 'utf8');
const titles = parseTrending(html, 'https://www.tejaratban.top/');
console.table(titles.map((t) => ({ id: t.id, kind: t.kind, title: t.title, year: t.year, imdb: t.imdb, poster: t.poster.split('/').pop() })));
const assert = require('assert');
assert.strictEqual(titles.length, 10);
assert.ok(titles.every((t) => t.poster.endsWith('-180x280.jpg') && t.pageUrl.startsWith('https://www.tejaratban.top/')));
assert.deepStrictEqual(titles.slice(0, 4).map((t) => t.title), ['MobLand', 'The Odyssey', 'The Lord of the Rings: The Rings of Power', 'Other Mommy 2026']);
console.log('parseTrending OK');

// ---------- Title pages ----------
const { parseDetails, compareSources } = require('./.parse.cjs');
const read = (f) => fs.readFileSync(path.join(__dirname, 'fixtures/tejaratban', f), 'utf8');

const movie = parseDetails(read('movie-odyssey.html'), titles[1]);
console.log(`\nThe Odyssey: ${movie.sources.length} sources, ${movie.episodes.length} episodes`);
console.table(movie.sources.map((s) => ({ group: s.group, label: s.label, h: s.height, encoder: s.encoder, note: s.note, file: s.url.split('/').pop().slice(0, 60) })));
assert.ok(movie.sources.length === 18 && movie.episodes.length === 0); // 23 rows minus 5 audio-only dubs
assert.ok(movie.sources.every((s) => /^https:\/\/.+\.mkv\?v=\d+$/.test(s.url)), 'direct mkv links');
const lowest = [...movie.sources].sort(compareSources)[0];
console.log('lowest →', lowest.group, lowest.label, lowest.url.split('/').pop());
assert.strictEqual(lowest.height, 480);

const series = parseDetails(read('series-mobland.html'), titles[0]);
const bySeason = {};
for (const e of series.episodes) bySeason[e.season] = (bySeason[e.season] || 0) + 1;
console.log(`\nMobLand: ${series.episodes.length} episodes`, bySeason);
console.table(series.episodes.slice(0, 3).concat(series.episodes.slice(-2)).map((e) => ({ s: e.season, e: e.episode, sources: e.sources.length, qualities: [...new Set(e.sources.map((s) => `${s.group}:${s.label}`))].join(' | ').slice(0, 120) })));
assert.ok(series.episodes.length >= 18);
assert.ok(series.episodes.every((e) => e.sources.length > 0 && e.sources.every((s) => s.url.includes(`S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`))), 'every link matches its SxxEyy');
console.log('parseDetails OK');

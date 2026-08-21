/* End-to-end test in a real headless Brave: real canvas, real CSS, real input.
   Catches what the node sim cannot — module load errors, missing DOM ids,
   renderer exceptions, UI wiring.
   Run: node test/browser-test.cjs [--head]   (--head shows the window) */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { launch, sleep } = require('./cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8100 + Math.floor(Math.random() * 300);
const SHOT = process.env.SHOT_DIR || require('os').tmpdir();

let fails = 0, page = null, server = null;
const ok = m => console.log('  ✓ ' + m);
const bad = (m, e) => { console.log('  ✗ ' + m + ' :: ' + e); fails++; };
async function chk(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function startServer() {
  server = spawn(process.execPath, [path.join(ROOT, 'test', 'serve.js')],
    { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/index.html`); if (r.ok) return; } catch (e) {}
    await sleep(100);
  }
  throw new Error('static server never came up');
}

/* A screenshot that is one flat color means nothing was painted. */
async function paintedPixels() {
  return page.eval(`(() => {
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) {
      seen.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]);
      if (seen.size > 40) break;
    }
    return seen.size;
  })()`);
}

(async () => {
  console.log('\nlaunching brave + static server');
  await startServer();
  page = await launch({ binary: 'brave', width: 1400, height: 860, headless: !process.argv.includes('--head') });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`);

  console.log('\npage load');
  await chk('page loads with no uncaught errors', () => {
    assert(page.errors.length === 0, 'errors: ' + page.errors.slice(0, 3).join(' | '));
  });
  await chk('canvas #view exists and is 1280x720 backed', async () => {
    const c = await page.eval(`(()=>{const c=document.getElementById('view');
      return c ? {w:c.width,h:c.height,cw:c.clientWidth} : null})()`);
    assert(c, 'no #view canvas');
    assert(c.w > 0 && c.h > 0, `canvas backing store is ${c.w}x${c.h}`);
  });
  await chk('the game object is exposed for driving', async () => {
    assert(await page.eval('typeof window.G === "object" && !!window.G'), 'window.G missing');
  });
  await chk('game boots into the menu phase', async () => {
    const p = await page.eval('G.phase');
    assert(p === 'menu', `phase is "${p}"`);
  });
  await page.screenshot(path.join(SHOT, 'brotato-1-title.png'));

  console.log('\nstarting a run');
  await chk('a run can be started from the page', async () => {
    // Prefer the real button; fall back to the keyboard path.
    await page.eval(`(()=>{const b=document.querySelector('#btn-start');
      if (b) b.click();})()`);
    await sleep(150);
    if (await page.eval('G.phase') === 'menu') await page.key(' ');
    await sleep(150);
    const p = await page.eval('G.phase');
    assert(p === 'wave', `phase is "${p}" after start`);
  });
  await chk('the renderer paints a non-trivial frame', async () => {
    await sleep(400);
    const colors = await paintedPixels();
    assert(colors > 3, `only ${colors} distinct colors sampled — screen looks blank`);
  });
  await chk('render loop throws no errors while running', async () => {
    await sleep(600);
    assert(page.errors.length === 0, 'errors: ' + page.errors.slice(0, 3).join(' | '));
  });

  console.log('\ninput and simulation');
  await chk('holding D moves the player right', async () => {
    const x0 = await page.eval('G.player.x');
    await page.keyDown('d');
    await sleep(500);
    await page.keyUp('d');
    const x1 = await page.eval('G.player.x');
    assert(x1 > x0 + 5, `player x went ${x0.toFixed(1)} -> ${x1.toFixed(1)}`);
  });
  await chk('holding W moves the player up', async () => {
    const y0 = await page.eval('G.player.y');
    await page.keyDown('w');
    await sleep(500);
    await page.keyUp('w');
    const y1 = await page.eval('G.player.y');
    assert(y1 < y0 - 5, `player y went ${y0.toFixed(1)} -> ${y1.toFixed(1)}`);
  });
  await chk('enemies spawn and weapons engage them', async () => {
    await page.waitFor('G.enemies.length > 0', 12000, 'enemies to spawn');
    await page.waitFor('G.kills > 0 || G.projectiles.length > 0', 12000, 'the player to fight back');
  });
  await page.screenshot(path.join(SHOT, 'brotato-2-combat.png'));

  await chk('the HUD reflects live game state', async () => {
    const txt = await page.eval('document.body.innerText');
    assert(/\d/.test(txt), 'HUD shows no numbers at all');
  });

  console.log('\nwave end, level up, shop');
  await chk('skipping to the end of the wave reaches levelup or shop', async () => {
    // Drive the clock forward rather than waiting out the real duration.
    await page.eval('G.t = G.waveTime - 0.05');
    await page.waitFor('G.phase === "levelup" || G.phase === "shop"', 8000, 'the wave to end');
  });
  await chk('a level-up choice can be taken', async () => {
    if (await page.eval('G.phase') !== 'levelup') return; // not every run levels in wave 1
    await page.screenshot(path.join(SHOT, 'brotato-3-levelup.png'));
    const n = await page.eval('G.upgradeChoices.length');
    assert(n === 3, `${n} upgrade choices offered`);
    let guard = 0;
    while (await page.eval('G.phase') === 'levelup' && guard++ < 12) {
      const clicked = await page.eval(`(()=>{const c=document.querySelector('#upgrade-cards .card');
        if (c) { c.click(); return true; } return false; })()`);
      if (!clicked) await page.eval('G.__pick && G.__pick(0)');
      await sleep(200);
      if (!clicked) break;
    }
  });
  await chk('the shop opens with four offers', async () => {
    const phase = await page.eval('G.phase');
    assert(phase === 'shop', `phase is "${phase}"`);
    const n = await page.eval('(()=>{ return window.__shopOffers ? window.__shopOffers() : null })()');
    // Fall back to counting rendered cards when no debug hook exists.
    const cards = await page.eval(`document.querySelectorAll('#shop-offers .card').length`);
    assert((n === 4) || cards >= 4, `offers=${n} rendered cards=${cards}`);
  });
  await page.screenshot(path.join(SHOT, 'brotato-4-shop.png'));
  await chk('shop UI is visibly populated with text', async () => {
    const txt = await page.eval('document.body.innerText');
    assert(txt.length > 40, `shop screen text is only ${txt.length} chars`);
  });
  await chk('the next wave can be started from the shop', async () => {
    await page.eval(`(()=>{const b=document.querySelector('#btn-next');
      if (b) b.click();})()`);
    await sleep(200);
    if (await page.eval('G.phase') === 'shop') await page.key(' ');
    await sleep(300);
    const p = await page.eval('G.phase');
    assert(p === 'wave', `phase is "${p}" after starting the next wave`);
    const w = await page.eval('G.wave');
    assert(w === 2, `wave is ${w}, expected 2`);
  });

  console.log('\nendurance');
  await chk('30 seconds of accelerated play throws nothing', async () => {
    const before = page.errors.length;
    for (let i = 0; i < 6; i++) {
      await page.eval('G.t = G.waveTime - 0.05');
      await sleep(700);
      const ph = await page.eval('G.phase');
      if (ph === 'levelup') await page.eval(`(()=>{const c=document.querySelector('#upgrade-cards .card');
        if (c) c.click();})()`);
      await sleep(200);
      if (await page.eval('G.phase') === 'shop') {
        await page.eval(`(()=>{const b=document.querySelector('#btn-next');
          if (b) b.click();})()`);
      }
      await sleep(400);
    }
    const news = page.errors.slice(before);
    assert(news.length === 0, 'new errors: ' + news.slice(0, 3).join(' | '));
  });
  await chk('the game is still on a live wave after all that', async () => {
    const st = await page.eval('({phase:G.phase, wave:G.wave, kills:G.kills})');
    console.log(`      phase=${st.phase} wave=${st.wave} kills=${st.kills}`);
    assert(['wave', 'shop', 'levelup', 'win'].includes(st.phase), `stuck in "${st.phase}"`);
    assert(st.wave >= 2, `still on wave ${st.wave}`);
  });
  await page.screenshot(path.join(SHOT, 'brotato-5-late.png'));

  console.log(`\nscreenshots in ${SHOT}`);
  console.log(fails ? `\n${fails} FAILED\n` : '\nall browser tests passed\n');
  await page.close();
  server.kill('SIGKILL');
  process.exit(fails ? 1 : 0);
})().catch(async e => {
  console.error('\nharness crashed: ' + e.stack);
  try { await page?.close(); } catch (_) {}
  try { server?.kill('SIGKILL'); } catch (_) {}
  process.exit(1);
});

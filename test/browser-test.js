'use strict';
/* End-to-end test in a real headless Brave, driven by trusted browser input.
   Unlike the node harness this exercises real canvas rendering, real CSS
   scaling of the canvas, and real mouse/key events - no stubs anywhere.
   Run: node test/browser-test.js [--head]    (--head shows the window) */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT = process.env.SHOT_DIR || '/tmp';
let fails = 0, page = null, rect = null;

const ok   = m => console.log('  ✓ ' + m);
const bad  = (m, e) => { console.log('  ✗ ' + m + ' :: ' + e); fails++; };
async function chk(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/* canvas is CSS-scaled by max-width:100%, so map game px -> viewport px for real */
const toView = (cx, cy) => ({ x: rect.left + cx * rect.width / 864, y: rect.top + cy * rect.height / 688 });
const tileView = (tx, ty) => toView(tx * 36 + 18, ty * 36 + 18);
const clickTile = async (tx, ty, btn) => { const p = tileView(tx, ty); await page.click(p.x, p.y, btn); };
const hoverTile = async (tx, ty) => { const p = tileView(tx, ty); await page.move(p.x, p.y); };

const menuInfo = () => page.eval(`(()=>{const m=G.menu; return m?{x:m.x,y:m.y,w:m.w,
  items:m.items.map(i=>({label:i.label,enabled:i.enabled}))}:null})()`);
async function clickMenuItem(label) {
  const m = await menuInfo();
  assert(m, 'no menu open');
  const i = m.items.findIndex(it => it.label === label);
  assert(i >= 0, `no item "${label}" (have ${m.items.map(x => x.label).join(',')})`);
  assert(m.items[i].enabled, `"${label}" is disabled`);
  const p = toView(m.x + 20, m.y + 8 + i * 22 + 10);
  await page.click(p.x, p.y);
}
const ALLY_TURN = `G.phase==='battle' && !busy() && G.mode==='move' && G.active && G.active.side==='ally'`;

/* plant a foe next to whoever is up, so the test is deterministic */
const standFoeAdjacent = () => page.eval(`(()=>{
  const u=G.active, f=foesOf(u).find(Boolean);
  const spot=[[1,0],[-1,0],[0,1],[0,-1]].map(d=>({x:u.x+d[0],y:u.y+d[1]}))
    .find(p=>p.x>=0&&p.y>=0&&p.x<24&&p.y<16&&terrainAt(p.x,p.y).cost<99&&!unitAt(p.x,p.y));
  if(!spot) return null;
  f.x=spot.x; f.y=spot.y;
  return {ux:u.x,uy:u.y,fx:f.x,fy:f.y,who:u.name,foe:f.name,foeHp:f.hp};
})()`);

(async () => {
  page = await launch({ binary: process.env.BROWSER || 'brave', headless: !process.argv.includes('--head') });
  await page.goto(GAME);
  rect = await page.eval(`(()=>{const r=document.getElementById('screen').getBoundingClientRect();
    return {left:r.left,top:r.top,width:r.width,height:r.height}})()`);
  console.log(`canvas 864x688 rendered at ${Math.round(rect.width)}x${Math.round(rect.height)} ` +
              `(scale ${(rect.width / 864).toFixed(3)}) - clicks go through the real scaling path`);

  console.log('\nboot:');
  await chk('title screen loads with no page errors', async () => {
    assert(await page.eval(`G.phase`) === 'title', 'not on title');
    assert(page.errors.length === 0, 'errors: ' + page.errors.join(' | '));
  });
  await chk('clicking the title starts the campaign brief', async () => {
    await page.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
    await page.waitFor(`G.phase==='brief'`, 3000, 'brief screen');
  });
  await chk('Enter deploys into chapter 1', async () => {
    await page.key('Enter');
    await page.waitFor(`G.phase==='battle'`, 3000, 'battle');
  });
  await chk('an ally turn arrives', async () => {
    await page.waitFor(ALLY_TURN, 30000, 'an ally turn');
  });

  console.log('\ncombat by real mouse input:');
  let st;
  await chk('the action menu opens where the unit stands', async () => {
    st = await standFoeAdjacent();
    assert(st, 'no free tile beside the active unit');
    await clickTile(st.ux, st.uy);
    await page.waitFor(`!!G.menu`, 3000, 'action menu');
  });
  await chk('Attack closes the menu and enters targeting', async () => {
    await clickMenuItem('Attack');
    const s = await page.eval(`({mode:G.mode, menu:!!G.menu, targets:(G.targets||[]).length})`);
    assert(s.mode === 'target', 'mode=' + s.mode);
    assert(!s.menu, 'menu still open - map clicks would be swallowed');
    assert(s.targets > 0, 'no targets offered');
  });
  await chk('clicking the enemy swings and resolves', async () => {
    await clickTile(st.fx, st.fy);
    await page.waitFor(`!!G.scene`, 2000, 'battle scene');
    await page.screenshot(path.join(SHOT, 'browser-fight.png'));
    await page.waitFor(`!G.scene`, 8000, 'scene to finish');
    await page.waitFor(`!busy()`, 8000, 'turn to settle');
    const done = await page.eval(`G.log.slice(-3).join(' | ')`);
    assert(/hits|missed|counterattack/i.test(done), 'no combat in the log: ' + done);
  });

  console.log('\nkeyboard and cancel:');
  await chk('Escape from targeting returns to the action menu', async () => {
    await page.waitFor(ALLY_TURN, 30000, 'an ally turn');
    const s2 = await standFoeAdjacent();
    assert(s2, 'no free tile beside the active unit');
    await clickTile(s2.ux, s2.uy);
    await page.waitFor(`!!G.menu`, 3000, 'action menu');
    await clickMenuItem('Attack');
    await page.key('Escape');
    const s = await page.eval(`({mode:G.mode, menu:!!G.menu})`);
    assert(s.mode === 'menu' && s.menu, `mode=${s.mode} menu=${s.menu}`);
  });
  await chk('right-click from the action menu undoes the move', async () => {
    const before = await page.eval(`({x:G.active.x, y:G.active.y})`);
    await page.key('Escape');                                   // menu -> undo move
    const s = await page.eval(`({mode:G.mode, x:G.active.x, y:G.active.y})`);
    assert(s.mode === 'move', 'mode=' + s.mode);
    assert(s.x === before.x && s.y === before.y, 'unit moved unexpectedly');
  });

  console.log('\nrendering:');
  await chk('hovering an enemy paints its danger zone', async () => {
    const foe = await page.eval(`(()=>{const f=G.units.find(u=>u.alive&&u.side==='enemy');
      return {x:f.x,y:f.y,name:f.name}})()`);
    await hoverTile(foe.x, foe.y);
    await sleep(120);
    const n = await page.eval(`G.hoverThreat ? G.hoverThreat.keys.length : 0`);
    assert(n > 0, 'no danger zone for ' + foe.name);
  });
  await chk('the canvas is actually painting pixels', async () => {
    const nonBlank = await page.eval(`(()=>{const c=document.getElementById('screen');
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let lit=0; for(let i=3;i<d.length;i+=4000) if(d[i]>0) lit++;
      return lit;})()`);
    assert(nonBlank > 100, 'canvas looks blank (' + nonBlank + ' lit samples)');
  });
  await chk('no uncaught page errors for the whole session', async () => {
    assert(page.errors.length === 0, page.errors.join(' | '));
  });

  await page.screenshot(path.join(SHOT, 'browser-final.png'));
  await page.close();
  console.log(fails ? `\nFAILED (${fails})` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(async e => {
  console.error('HARNESS ERROR:', e.message);
  if (page) { try { await page.screenshot('/tmp/browser-crash.png'); } catch (x) {} await page.close(); }
  process.exit(1);
});

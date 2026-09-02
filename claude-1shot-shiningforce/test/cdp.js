'use strict';
/* Minimal Chrome DevTools Protocol driver.
   Zero dependencies - Node's built-in fetch + WebSocket are all it needs.
   Launches Brave (or any Chromium) fully headless: no window ever appears. */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(opts = {}) {
  const binary = opts.binary || 'brave';
  const port = opts.port || 9500 + Math.floor(Math.random() * 400);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + port, '--user-data-dir=' + userDataDir,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', '--disable-extensions',
    '--window-size=' + (opts.width || 900) + ',' + (opts.height || 760),
    'about:blank',
  ];
  const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });

  let info = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) { info = await r.json(); break; }
    } catch (e) { /* not up yet */ }
    await sleep(100);
  }
  if (!info) { proc.kill('SIGKILL'); throw new Error('browser never came up:\n' + stderr.slice(-800)); }

  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });

  let nextId = 1;
  const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) listeners.forEach(f => f(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);

  /* everything the page complains about, collected for assertions */
  const errors = [], logs = [];
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    if (m.method === 'Runtime.consoleAPICalled')
      logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Log.enable');

  const page = {
    errors, logs, proc,
    async goto(url) {
      const loaded = new Promise(res => {
        const f = m => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId)
          { listeners.splice(listeners.indexOf(f), 1); res(); } };
        listeners.push(f);
      });
      await cmd('Page.navigate', { url });
      await loaded;
      await sleep(250);                                   // let rAF paint a frame
    },
    /* Evaluates in the page's global scope, so top-level `const` bindings from a
       classic script (like the game's G) are visible by bare name. */
    async eval(expression) {
      const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const e = r.exceptionDetails;
        throw new Error('page eval failed: ' +
          ((e.exception && (e.exception.description || e.exception.value)) || e.text));
      }
      return r.result.value;
    },
    async waitFor(expression, timeout = 5000, label) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (await page.eval('!!(' + expression + ')')) return true;
        await sleep(30);
      }
      throw new Error('timed out waiting for ' + (label || expression));
    },
    /* real trusted input, dispatched by the browser itself */
    async click(x, y, button = 'left') {
      const base = { x, y, button, clickCount: 1,
                     buttons: button === 'right' ? 2 : 1 };
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
      await sleep(20);
    },
    async move(x, y) {
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
      await sleep(20);
    },
    async key(key) {
      const codes = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40,
                      ArrowLeft: 37, ArrowRight: 39, ' ': 32 };
      const p = { key, code: key === ' ' ? 'Space' : key,
                  windowsVirtualKeyCode: codes[key] || key.toUpperCase().charCodeAt(0),
                  text: key.length === 1 ? key : undefined };
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
      await sleep(20);
    },
    async screenshot(file) {
      const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() {
      try { ws.close(); } catch (e) {}
      proc.kill('SIGKILL');
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    },
  };
  return page;
}
module.exports = { launch, sleep };

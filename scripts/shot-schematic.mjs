import { spawn } from 'node:child_process';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9223;

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,1050',
  'http://localhost:5173/'
]);

try {
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const tabs = await res.json();
      const tab = tabs.find(t => t.type === 'page');
      if (tab?.webSocketDebuggerUrl) {
        wsUrl = tab.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) throw new Error('Could not connect to Chrome DevTools port');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  // Wait 1.5 seconds for page load
  await new Promise(r => setTimeout(r, 1500));

  // Switch to single-line diagram view
  await evaluate(`
    const btn = document.querySelector('[data-view="schematic"]');
    if (btn) btn.click();
  `);

  await new Promise(r => setTimeout(r, 1500));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('schematic_preview_v2.png', Buffer.from(shot.result.data, 'base64'));
  console.log('Successfully captured schematic_preview_v2.png');

  ws.close();
} catch (err) {
  console.error(err);
} finally {
  chrome.kill();
}

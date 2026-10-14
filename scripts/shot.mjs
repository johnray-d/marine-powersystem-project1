import { spawn } from 'node:child_process';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9222;

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,1000',
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
  const consoleMessages = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push(msg.params.args.map(a => a.value || a.description).join(' '));
    }
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

  // Helper to run code in page
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  // Wait 2 seconds for initial render
  await new Promise(r => setTimeout(r, 2000));

  // Focus on crane
  await evaluate(`
    window.app.select('crane');
    window.app.vessel.focusSelection();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotCrane = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('crane_shot.png', Buffer.from(shotCrane.result.data, 'base64'));
  console.log('Saved crane_shot.png');

  // Focus on reefer unit
  await evaluate(`
    window.app.select('reeferUnit');
    window.app.vessel.focusSelection();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotReefer = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('reefer_shot.png', Buffer.from(shotReefer.result.data, 'base64'));
  console.log('Saved reefer_shot.png');

  // Test Enlarge modal on generator
  await evaluate(`
    window.app.select('dg1');
    document.querySelector('#explodeExpand')?.click();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotEnlarged = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('enlarged_shot.png', Buffer.from(shotEnlarged.result.data, 'base64'));
  console.log('Saved enlarged_shot.png');

  // Close enlarge and reset view
  await evaluate(`
    document.querySelector('#explodeExpand')?.click();
    window.app.select('busA');
    window.app.vessel.resetCamera();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotFull = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vessel_shot.png', Buffer.from(shotFull.result.data, 'base64'));
  console.log('Saved vessel_shot.png');

  if (consoleMessages.length) {
    console.log('Console messages:', consoleMessages);
  }
  ws.close();
} finally {
  chrome.kill();
}

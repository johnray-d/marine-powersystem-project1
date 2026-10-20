import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9223;

const targets = [
  {
    name: 'vent_fan_cad_view',
    url: 'http://localhost:5173/assemblies/3d_marine_vent_fan_assembly.html',
    prep: `
      if (typeof animateExplodeTo === 'function') animateExplodeTo(0.65);
    `
  },
  {
    name: 'bridge_navcom_cad_view',
    url: 'http://localhost:5173/assemblies/3d_marine_bridge_navcom_assembly.html',
    prep: `
      if (typeof animateExplodeTo === 'function') animateExplodeTo(0.65);
    `
  },
  {
    name: 'universal_viewer_ventfan',
    url: 'http://localhost:5173/assemblies/universal_viewer.html?eq=ventFan',
    prep: `
      if (typeof animateExplodeTo === 'function') animateExplodeTo(0.65);
    `
  },
  {
    name: 'universal_viewer_nav',
    url: 'http://localhost:5173/assemblies/universal_viewer.html?eq=nav',
    prep: `
      if (typeof animateExplodeTo === 'function') animateExplodeTo(0.65);
    `
  }
];

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,1000'
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

  for (const target of targets) {
    console.log(`Navigating to ${target.url}...`);
    await send('Page.navigate', { url: target.url });
    await new Promise(r => setTimeout(r, 1800));

    if (target.prep) {
      await send('Runtime.evaluate', { expression: target.prep, awaitPromise: true });
      await new Promise(r => setTimeout(r, 800));
    }

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = `${target.name}.png`;
    fs.writeFileSync(outPath, Buffer.from(shot.result.data, 'base64'));
    console.log(`Saved screenshot: ${outPath}`);
  }

  ws.close();
} finally {
  chrome.kill();
}

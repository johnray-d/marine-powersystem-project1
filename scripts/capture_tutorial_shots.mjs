import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

  // Wait 2.5 seconds for app initial render
  await new Promise(r => setTimeout(r, 2500));

  const tutorialDir = path.resolve('public', 'tutorial');
  if (!fs.existsSync(tutorialDir)) {
    fs.mkdirSync(tutorialDir, { recursive: true });
  }

  // --- SHOT 1: Protective Relay Engine (ANSI 32, 40, 51) ---
  console.log('Capturing tut_06_protective_relays.png...');
  await evaluate(`
    window.app.setLeftPanel(true);
    window.app.setLeftPanelExpanded(true);
    window.app.setRightPanel(true);
    window.app.select('dg1');
    const avrToggle = document.getElementById('avrTripToggle');
    if (avrToggle) {
      avrToggle.checked = true;
      avrToggle.dispatchEvent(new Event('change'));
    }
    const drawer = document.getElementById('leftDrawer');
    if (drawer) {
      const pmsSec = document.querySelector('.pms-section') || document.querySelector('.protection-relays-card');
      if (pmsSec) pmsSec.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  `);
  await new Promise(r => setTimeout(r, 1600));
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_06_protective_relays.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved tut_06_protective_relays.png');

  // --- SHOT 2: High-Resistance Earthing (HRE) & ANSI 67N ---
  console.log('Capturing tut_07_hre_earthing.png...');
  await evaluate(`
    const hreToggle = document.getElementById('hreSysToggle');
    if (hreToggle) {
      hreToggle.checked = true;
      hreToggle.dispatchEvent(new Event('change'));
    }
    const faultBtn = document.getElementById('faultHvEarth');
    if (faultBtn) {
      faultBtn.click();
    }
    const drawer = document.getElementById('leftDrawer');
    if (drawer) {
      const hreBox = document.getElementById('hreTelemetryBox');
      if (hreBox) hreBox.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  `);
  await new Promise(r => setTimeout(r, 1200));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_07_hre_earthing.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved tut_07_hre_earthing.png');

  // --- SHOT 3: SOLAS Blackout Recovery 5-Stage Waterfall ---
  console.log('Capturing tut_08_solas_waterfall.png...');
  await evaluate(`
    window.app.setLeftPanel(false);
    window.app.setRightPanel(false);
    window.app.scenario('04');
  `);
  // Let simulation advance to stage 2 or 3
  await new Promise(r => setTimeout(r, 3500));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_08_solas_waterfall.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved tut_08_solas_waterfall.png');

  // --- SHOT 4: Interactive 6.6 kV LOTO & PTW Flow ---
  console.log('Capturing tut_09_hv_loto.png...');
  await evaluate(`
    window.app.reset();
    window.app.setLeftPanel(false);
    window.app.setRightPanel(true);
    window.app.select('txA');
    window.app.vessel.focusSelection();
    // Simulate first step of LOTO sequence to show interactivity
    const step1Btn = document.querySelector('[data-loto-step="0"]');
    if (step1Btn) step1Btn.click();
  `);
  await new Promise(r => setTimeout(r, 1500));
  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_09_hv_loto.png'), Buffer.from(shot4.result.data, 'base64'));
  console.log('Saved tut_09_hv_loto.png');

  console.log('All tutorial screenshots successfully captured!');
  ws.close();
} catch (err) {
  console.error('Error during screenshot capture:', err);
} finally {
  chrome.kill();
}

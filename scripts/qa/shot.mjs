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

  // 1. Focus on Bow and Front of the Ship
  await evaluate(`
    window.app.select('bow');
    // Position camera for an eye-level beauty shot of the bow, bulbous bow, flare, and forecastle
    window.app.vessel.controls.target.set(16.5, 0.2, 0);
    window.app.vessel.camera.position.set(22.5, 2.2, 7.5);
    window.app.vessel.controls.update();
  `);
  await new Promise(r => setTimeout(r, 1200));
  const shotBow = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('bow_closeup.png', Buffer.from(shotBow.result.data, 'base64'));
  console.log('Saved bow_closeup.png');

  // 1b. Stern-Quarter Hovering Shot (the exact angle where the bug occurred)
  await evaluate(`
    window.app.vessel.controls.target.set(-2.0, 0.5, 0);
    window.app.vessel.camera.position.set(-24.0, 11.0, -22.0);
    window.app.vessel.controls.update();
  `);
  await new Promise(r => setTimeout(r, 1200));
  const shotSternHover = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vessel_stern_quarter_fixed.png', Buffer.from(shotSternHover.result.data, 'base64'));
  console.log('Saved vessel_stern_quarter_fixed.png');

  // 2. Full vessel overview showing elevated ship height above the sea
  await evaluate(`
    window.app.select('busA');
    window.app.vessel.resetCamera();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotFull = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vessel_shot.png', Buffer.from(shotFull.result.data, 'base64'));
  console.log('Saved vessel_shot.png');

  // 2b. Reefer containers closeup in the cargo hold (matching user's angle)
  await evaluate(`
    window.app.select('reeferUnitB');
    window.app.vessel.controls.target.set(10.0, 1.6, 0.2);
    window.app.vessel.camera.position.set(5.5, 3.8, 6.5);
    window.app.vessel.controls.update();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotReefer = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('reefer_containers_shot.png', Buffer.from(shotReefer.result.data, 'base64'));
  console.log('Saved reefer_containers_shot.png');

  // 3. Energize propulsion and bow thruster to test spinning animations
  await evaluate(`
    const state = window.app.getState();
    state.closed.propFeed = true;
    state.closed.bowFeed = true;
    window.app.refresh();
    window.app.select('prop');
    window.app.vessel.focusSelection();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotProp = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('propeller_shot.png', Buffer.from(shotProp.result.data, 'base64'));
  console.log('Saved propeller_shot.png');

  // 4. Focus on spinning bow thruster in tunnel
  await evaluate(`
    window.app.select('bow');
    window.app.vessel.focusSelection();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotBowSpin = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('bow_thruster_spin.png', Buffer.from(shotBowSpin.result.data, 'base64'));
  console.log('Saved bow_thruster_spin.png');

  // 5. Test Single-line diagram tab, Legend panel, and Zoom controls
  await evaluate(`
    const tab = document.querySelector('[data-view="schematic"]');
    if (tab) tab.click();
  `);
  await new Promise(r => setTimeout(r, 1000));
  const shotSldFitted = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('sld_fitted.png', Buffer.from(shotSldFitted.result.data, 'base64'));
  console.log('Saved sld_fitted.png');

  // 6. Test Zoom In (+) button twice and capture zoomed state
  await evaluate(`
    const zoomIn = document.querySelector('#schematicZoomIn');
    if (zoomIn) {
      zoomIn.click();
      zoomIn.click();
    }
  `);
  await new Promise(r => setTimeout(r, 800));
  const shotSldZoomed = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('sld_zoomed.png', Buffer.from(shotSldZoomed.result.data, 'base64'));
  console.log('Saved sld_zoomed.png');

  // 7. Test Legend toggle (collapse)
  await evaluate(`
    const fitBtn = document.querySelector('#schematicFit');
    if (fitBtn) fitBtn.click();
    const toggle = document.querySelector('#toggleSchematicLegend');
    if (toggle) toggle.click();
  `);
  await new Promise(r => setTimeout(r, 800));
  const shotSldCollapsed = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('sld_collapsed.png', Buffer.from(shotSldCollapsed.result.data, 'base64'));
  console.log('Saved sld_collapsed.png');

  if (consoleMessages.length) {
    console.log('Console messages:', consoleMessages);
  }
  ws.close();
} finally {
  chrome.kill();
}

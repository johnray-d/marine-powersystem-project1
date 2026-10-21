import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9225;
const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-tut-full-'));

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tempUserDataDir}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,1000',
  'http://localhost:5173/'
]);

try {
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
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

  if (!wsUrl) throw new Error('Could not connect to Chrome DevTools port ' + port);

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
    if (res.exceptionDetails) {
      console.error('EVAL EXCEPTION:', res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  };

  // Wait for window.app and DOM scenarios list to be completely mounted
  console.log('Waiting for simulator to initialize in browser...');
  for (let i = 0; i < 50; i++) {
    const ready = await evaluate(`Boolean(window.app && window.app.getState && document.getElementById('scenarios')?.children.length > 0)`);
    if (ready) {
      console.log(`Simulator ready (${i * 250}ms).`);
      break;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  await new Promise(r => setTimeout(r, 1500));

  const tutorialDir = path.resolve('public', 'tutorial');
  if (!fs.existsSync(tutorialDir)) {
    fs.mkdirSync(tutorialDir, { recursive: true });
  }

  // ==========================================
  // SHOT 1: 3D Vessel Overview & Power Flow
  // ==========================================
  console.log('Capturing tut_01_overview.png...');
  await evaluate(`
    (() => {
      window.app.reset();
      const btn = document.querySelector('[data-scenario="propulsion"]');
      if (btn) btn.click();
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(false);
      window.app.setRightPanel(true);
      window.app.select('prop');
      window.app.vessel.resetCamera();
      const panel = document.getElementById('leftPanel');
      if (panel) panel.scrollTop = 0;
    })()
  `);
  await new Promise(r => setTimeout(r, 2200));
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_01_overview.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved tut_01_overview.png');

  // ==========================================
  // SHOT 2: Expanded 2-Column Console
  // ==========================================
  console.log('Capturing tut_02_expanded_console.png...');
  await evaluate(`
    (() => {
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(true);
      window.app.setRightPanel(true);
      const panel = document.getElementById('leftPanel');
      if (panel) panel.scrollTop = 0;
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_02_expanded_console.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved tut_02_expanded_console.png');

  // ==========================================
  // SHOT 3: Interactive Single-Line Diagram
  // ==========================================
  console.log('Capturing tut_03_single_line_flow.png...');
  await evaluate(`
    (() => {
      window.app.setLeftPanel(false);
      window.app.setRightPanel(false);
      const sldTab = document.querySelector('[data-view="schematic"]');
      if (sldTab) sldTab.click();
      const legendCard = document.getElementById('schematicLegendCard');
      if (legendCard) legendCard.classList.remove('collapsed');
      const zoomFitBtn = document.getElementById('zoomFitBtn');
      if (zoomFitBtn) zoomFitBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_03_single_line_flow.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved tut_03_single_line_flow.png');

  // Switch back to 3D vessel view for remaining shots
  await evaluate(`
    (() => {
      const vTab = document.querySelector('[data-view="vessel"]');
      if (vTab) vTab.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  // ==========================================
  // SHOT 4: Synchroscope & Paralleling Panel
  // ==========================================
  console.log('Capturing tut_04_synchroscope_parallel.png...');
  await evaluate(`
    (() => {
      const btn = document.querySelector('[data-scenario="parallel"]');
      if (btn) btn.click();
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(false);
      window.app.setRightPanel(true);
      window.app.select('dg2');
      const panel = document.getElementById('leftPanel');
      const secSync = document.getElementById('secSync');
      if (panel && secSync) {
        panel.scrollTop = secSync.offsetTop - panel.offsetTop - 10;
      }
    })()
  `);
  // Allow synchroscope needle to swing toward 12 o'clock
  await new Promise(r => setTimeout(r, 2600));
  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_04_synchroscope_parallel.png'), Buffer.from(shot4.result.data, 'base64'));
  console.log('Saved tut_04_synchroscope_parallel.png');

  // ==========================================
  // SHOT 5: PMS Blackout & Alarm Logbook
  // ==========================================
  console.log('Capturing tut_05_blackout_pms.png...');
  await evaluate(`
    (() => {
      const btn = document.querySelector('[data-scenario="propulsion"]');
      if (btn) btn.click();
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(false);
      window.app.setRightPanel(true);
      if (!window.app.simEngine.earthFaultHv) {
        window.app.simEngine.toggleEarthFault('hv');
      }
      window.app.toggleBreaker('gb2');
      window.app.refresh();
      const panel = document.getElementById('leftPanel');
      const secPms = document.getElementById('secPms');
      if (panel && secPms) {
        panel.scrollTop = secPms.offsetTop - panel.offsetTop - 10;
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 1600));
  const shot5 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_05_blackout_pms.png'), Buffer.from(shot5.result.data, 'base64'));
  console.log('Saved tut_05_blackout_pms.png');

  // ==========================================
  // SHOT 6: ANSI Protective Relay Engine
  // ==========================================
  console.log('Capturing tut_06_protective_relays.png...');
  await evaluate(`
    (() => {
      const btn = document.querySelector('[data-scenario="propulsion"]');
      if (btn) btn.click();
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(false);
      window.app.setRightPanel(true);
      window.app.select('dg1');
      const lossBtn = document.getElementById('btnInspectorFieldLoss');
      if (lossBtn) lossBtn.click();
      const inspector = document.getElementById('inspector');
      const relayCard = document.querySelector('.relay-engine-card');
      if (inspector && relayCard) {
        inspector.scrollTop = relayCard.offsetTop - inspector.offsetTop - 10;
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 1400));
  const shot6 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_06_protective_relays.png'), Buffer.from(shot6.result.data, 'base64'));
  console.log('Saved tut_06_protective_relays.png');

  // ==========================================
  // SHOT 7: High-Resistance Earthing (HRE)
  // ==========================================
  console.log('Capturing tut_07_hre_earthing.png...');
  await evaluate(`
    (() => {
      window.app.simEngine.setEarthingArchitecture('HRE');
      if (!window.app.simEngine.earthFaultHv) {
        window.app.simEngine.toggleEarthFault('hv');
      }
      window.app.refresh();
      window.app.setLeftPanel(true);
      window.app.setLeftPanelExpanded(false);
      window.app.setRightPanel(true);
      window.app.select('busA');
      const panel = document.getElementById('leftPanel');
      const secPms = document.getElementById('secPms');
      if (panel && secPms) {
        panel.scrollTop = secPms.offsetTop - panel.offsetTop - 10;
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 1400));
  const shot7 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_07_hre_earthing.png'), Buffer.from(shot7.result.data, 'base64'));
  console.log('Saved tut_07_hre_earthing.png');

  // ==========================================
  // SHOT 8: SOLAS 5-Stage Blackout Waterfall
  // ==========================================
  console.log('Capturing tut_08_solas_waterfall.png...');
  await evaluate(`
    (() => {
      window.app.setLeftPanel(false);
      window.app.setRightPanel(false);
      const btn = document.querySelector('[data-scenario="emergency"]');
      if (btn) btn.click();
    })()
  `);
  // Let simulation advance to stage 2 or 3 so progress bar and countdown are visible
  await new Promise(r => setTimeout(r, 3800));
  const shot8 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_08_solas_waterfall.png'), Buffer.from(shot8.result.data, 'base64'));
  console.log('Saved tut_08_solas_waterfall.png');

  // ==========================================
  // SHOT 9: 6.6 kV Permit to Work & LOTO Checklist
  // ==========================================
  console.log('Capturing tut_09_hv_loto.png...');
  await evaluate(`
    (() => {
      window.app.reset();
      window.app.setLeftPanel(false);
      window.app.setRightPanel(true);
      window.app.select('txA');
      window.app.vessel.focusSelection();
      // Simulate first step of LOTO sequence (Step 1: Trip & Open Feeder VCB)
      const step1Btn = document.querySelector('[data-loto-step="1"]');
      if (step1Btn) step1Btn.click();
      const inspector = document.getElementById('inspector');
      const lotoCard = document.querySelector('.hv-loto-card') || document.querySelector('[data-loto-step]');
      if (inspector && lotoCard) {
        inspector.scrollTop = lotoCard.offsetTop - inspector.offsetTop - 15;
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const shot9 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(tutorialDir, 'tut_09_hv_loto.png'), Buffer.from(shot9.result.data, 'base64'));
  console.log('Saved tut_09_hv_loto.png');

  console.log('All 9 tutorial screenshots successfully captured!');
  ws.close();
} catch (err) {
  console.error('Error during screenshot capture:', err);
} finally {
  chrome.kill();
  try {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  } catch (e) {}
}

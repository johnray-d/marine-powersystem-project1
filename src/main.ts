import './style.css';
import { byId, connections, edgeById, equipment, initialState, powered, connectionState, scenarios, sourceIds, allSupplyIds, VOLTAGES, type SimState, type Equipment, type ModelType, type Connection, type EarthingArchitecture } from './network';
import { modelParts, HV_LOTO_STEPS, HV_EQUIPMENT_VCB_MAP, hvLotoManager, PROTECTION_RELAY_CATALOG } from './models';
import { VesselView, ExplodedView } from './scene';
import { SOLAS_WATERFALL_STAGES } from './vessel-layout';
import { propellerAssembly } from './propeller-assembly';
import { transformerAssembly } from './transformer-assembly';
import { driveAssembly } from './drive-assembly';
import { motorAssembly } from './motor-assembly';
import { steeringAssembly } from './steering-assembly';
import { reeferAssembly } from './reefer-assembly';
import { pumpAssembly } from './pump-assembly';
import { resolveAssemblyUrl } from './assets';
import { simEngine, LOAD_SPECS } from './sim-engine';

type View='vessel'|'schematic';
let state:SimState=initialState();
let live=powered(state);
let selected='busA';
let view:View='vessel';
let activeScenario='main';
let selectedPart:string|undefined;
let message='DG 1 is running. Follow its energized path through the closed bus tie.';
let showShell=true,showLabels=true;
let explodedExpanded=false;
let leftPanelOpen=true;
let leftPanelExpanded=false;
let rightPanelOpen=true;

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <header class="topbar">
    <div class="brand-cluster">
      <button class="drawer-toggle-btn active" id="toggleLeftPanel" type="button" aria-expanded="true" title="Toggle Left Switchboard & Scenario Drawer ([)">
        <span class="drawer-toggle-icon" id="leftToggleIcon">⇤</span>
        <span class="drawer-toggle-text" id="leftToggleText">Controls</span>
      </button>
      <div class="brand">
        <span class="brand-symbol">◈</span>
        <div>
          <div class="eyebrow">MARITIME POWER MANAGEMENT SYSTEM · PMS V2</div>
          <h1>Marine Power System <span>Simulator</span></h1>
        </div>
      </div>
    </div>
    <div class="top-telemetry" id="topTelemetry">
      <div class="telemetry-pill"><span class="telemetry-label">GEN</span><strong id="topGenCount">1 / 4</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">6.6 kV BUS</span><strong id="topBusFreq">60.00 Hz · 6.56 kV</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">LOAD</span><strong id="topTotalKw">0 kW · PF 0.89</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">TIE</span><strong id="topTieState" class="is-closed">CLOSED</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">EARTHING / IMD</span><strong id="topImdState" class="is-closed">IT · 15.0 MΩ OK</strong></div>
    </div>
    <div class="top-actions">
      <button class="button button-quiet" id="openTutorialBtn" type="button" title="Open Step-by-Step ETO Simulation Tutorial">📖 Tutorial</button>
      <button class="button button-quiet" id="openUniversalCatalog" type="button" title="Open Universal 3D CAD & Electrical Spec Catalog">🗂 Catalog</button>
      <button class="button button-quiet" id="resetAll" type="button">↺ Reset</button>
      <button class="drawer-toggle-btn active" id="toggleRightPanel" type="button" aria-expanded="true" title="Toggle Right Equipment Inspector (])">
        <span class="drawer-toggle-text" id="rightToggleText">Inspector</span>
        <span class="drawer-toggle-icon" id="rightToggleIcon">⇥</span>
      </button>
    </div>
  </header>
  <main class="workspace" id="workspace">
    <aside class="left-panel panel" id="leftPanel" aria-label="System Controls and Learning Path">
      <div class="panel-heading">
        <div>
          <div class="eyebrow">LEARNING PATH & PMS</div>
          <h2>Switchboard Controls</h2>
        </div>
        <div class="panel-heading-right">
          <span class="small-index">01 / 06</span>
          <button class="panel-expand-btn" id="expandLeftPanel" type="button" title="Expand left panel into wide 2-column simulation console (E)" aria-expanded="false">⤢ Expand</button>
          <button class="panel-collapse-btn" id="closeLeftPanel" type="button" title="Collapse left panel ([)" aria-label="Collapse left panel">⇤</button>
        </div>
      </div>
      <div class="scenario-list" id="scenarios"></div>
      <section class="control-section" id="secGenerators"><div class="section-heading"><h3>Generation & Shore</h3><span class="subtle">${VOLTAGES.hv} Droop & Relays</span></div><div id="generators"></div></section>
      <section class="control-section" id="secSync"><div class="section-heading"><h3>Synchroscope & Paralleling</h3><span class="subtle">ANSI 25 / 25A</span></div><div id="synchroscopeSection"></div></section>
      <section class="control-section" id="secThrottle"><div class="section-heading"><h3>Propulsion & Sea Load</h3><span class="subtle">VFD Throttle</span></div><div id="throttleSection"></div></section>
      <section class="control-section" id="secPms"><div class="section-heading"><h3>PMS, HRE & Fault Switchboard</h3><span class="subtle">IT / HRE · ANSI 67N</span></div><div id="pmsSection"></div></section>
      <section class="control-section" id="secTie"><div class="section-heading"><h3>Bus section tie</h3><span class="subtle">A ↔ B</span></div><div id="tieControl"></div></section>
      <section class="control-section" id="secEmergency"><div class="section-heading"><h3>Emergency supply</h3><span class="subtle">SOLAS 440 V</span></div><div id="emergencyControls"></div></section>
      <section class="control-section" id="secFeeders"><div class="section-heading"><h3>Representative feeders</h3><span class="subtle">Tap to switch</span></div><div id="feeders"></div></section>
    </aside>
    <section class="center-panel">
      <button class="left-edge-handle" id="leftEdgeHandle" type="button" title="Toggle Switchboard & Controls Drawer ([)" aria-label="Toggle Left Controls Drawer">
        <span class="handle-arrow" id="leftHandleArrow">◂</span>
        <span class="handle-label">CONTROLS</span>
      </button>
      <div class="view-header">
        <div class="view-title-group">
          <div class="eyebrow">POWER FLOW EXPLORER</div>
          <h2 id="viewTitle">Vessel overview</h2>
        </div>
        <div class="tabs" role="tablist" aria-label="System views">
          <button class="tab active" data-view="vessel" role="tab" aria-selected="true">◈ 3D vessel</button>
          <button class="tab" data-view="schematic" role="tab" aria-selected="false">⌁ Single-line</button>
        </div>
      </div>
      <div class="visual-stage" id="visualStage">
        <div class="vessel-host" id="vesselHost" aria-label="Interactive 3D vessel view"></div>
        <div class="schematic-host hidden" id="schematicHost" aria-label="Interactive single-line diagram"></div>
        <div class="arc-flash-stage-banner hidden" id="arcFlashBanner" role="alert">
          <span class="arc-flash-icon">⚡</span>
          <div class="arc-flash-copy">
            <strong>ARC-FLASH VIOLATION WARNING — HV PANEL NOT ISOLATED</strong>
            <span id="arcFlashBannerText">Complete the mandatory 5-step 6.6 kV LOTO &amp; Permit-to-Work sequence in the Equipment Inspector before opening or exploding HV enclosures.</span>
          </div>
          <button type="button" class="arc-flash-dismiss" id="dismissArcFlashBanner" aria-label="Dismiss Arc-Flash Warning">✕</button>
        </div>
        <div class="view-tools" id="viewTools">
          <button id="resetCamera" type="button">⌖ Reset view</button>
          <button id="focusEquipment" type="button">◎ Focus item</button>
          <button id="toggleShell" type="button">▧ Shell on</button>
          <button id="toggleLabels" type="button">T Labels on</button>
        </div>
        <div class="view-tools hidden" id="schematicTools">
          <button id="schematicFit" type="button" title="Fit Single-Line Diagram to screen">⤢ Fit</button>
          <button id="schematicZoomIn" type="button" title="Zoom In">＋</button>
          <button id="schematicZoomOut" type="button" title="Zoom Out">－</button>
          <button id="schematicReset" type="button" title="Reset Zoom">100%</button>
        </div>
      </div>
      <div class="bottom-hud">
        <div class="solas-waterfall-hud hidden" id="solasWaterfallHud" aria-label="SOLAS Blackout Recovery 5-Stage Sequential Waterfall"></div>
        <div class="bus-telemetry-strip" id="busTelemetryStrip" aria-label="Live switchboard bus telemetry"></div>
        <div class="status-strip">
          <div class="legend">
            <span><i class="legend-line live"></i> Energized (Red Line + Yellow Flow)</span>
            <span><i class="legend-line dead"></i> De-energized</span>
            <span><i class="legend-line open"></i> Open / disconnected</span>
          </div>
          <div class="status-count" id="statusCount"></div>
        </div>
        <div class="hud-cards-row">
          <div class="lesson-banner">
            <span class="lesson-icon">i</span>
            <div>
              <strong id="lessonTitle">Current lesson</strong>
              <p id="lessonText"></p>
            </div>
          </div>
          <div class="notice-card">
            <span class="notice-tag">PMS / EVENT LOG</span>
            <div class="notice" id="notice" role="status" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </section>
    <aside class="right-panel panel" id="inspector"></aside>
  </main>
  <footer class="footer"><span>MARINE POWER SYSTEM SIMULATOR · QUASI-STEADY-STATE PMS & PROTECTION ENGINE</span><span>Interactive 3D Digital Twin · IEC 60092 Single-Line · Shortcuts: [ Left Drawer · E Expand Panel · ] Inspector</span></footer>
  <div id="assemblyModal" class="assembly-modal hidden" role="dialog" aria-modal="true" aria-labelledby="assemblyModalTitle">
    <div class="assembly-modal-backdrop" id="assemblyBackdrop"></div>
    <div class="assembly-modal-dialog">
      <div class="assembly-modal-header">
        <div class="assembly-modal-title-group">
          <div class="assembly-modal-badge" id="assemblyModalBadge">3D CAD ASSEMBLY & SPECIFICATION</div>
          <h2 id="assemblyModalTitle" class="assembly-modal-title"></h2>
          <p id="assemblyModalSubtitle" class="assembly-modal-subtitle"></p>
        </div>
        <div class="assembly-modal-actions">
          <a id="assemblyNewTab" href="#" target="_blank" rel="noopener noreferrer" class="assembly-tab-link" title="Open full assembly in dedicated browser tab">
            ↗ Open in new tab
          </a>
          <button id="assemblyClose" type="button" class="assembly-close-btn" aria-label="Close CAD assembly dialog">
            ✕ Close
          </button>
        </div>
      </div>
      <div class="assembly-modal-body">
        <iframe id="assemblyFrame" src="about:blank" title="3D CAD Technical Assembly Viewer" allow="fullscreen"></iframe>
      </div>
    </div>
  </div>`;

const vessel=new VesselView(document.querySelector('#vesselHost')!);
const exploded=new ExplodedView(document.createElement('div'));
// The viewer is attached to the inspector after its first render.
vessel.onSelect=id=>select(id);
exploded.onPart=id=>{selectedPart=id;const model=modelForSelection();if(model)updatePartDescription(model);};

document.querySelector('#dismissArcFlashBanner')?.addEventListener('click',()=>{
  document.querySelector('#arcFlashBanner')?.classList.add('hidden');
});

function setMessage(text:string){message=text;document.querySelector('#notice')!.textContent=text;}
function statusText(id:string){return live.has(id)?'POWERED':'NOT POWERED';}
function toggleBreaker(id:string){
  // Prevent closing a breaker if its HV equipment has an active LOTO lock (racked out / padlocked / earthed)
  if(!state.closed[id]){
    for(const [eqId,map] of Object.entries(HV_EQUIPMENT_VCB_MAP)){
      if(map.vcbIds.includes(id)){
        const rec=hvLotoManager.getRecord(eqId);
        if(rec.completedSteps>=2){
          const msg=`LOTO Interlock Blocked: Cannot close ${edgeById[id]?.name||id} while ${map.label} is racked out / padlocked / earthed under ${rec.ptwNumber}. Reset LOTO in Inspector first.`;
          setMessage(msg);
          refresh();
          return;
        }
      }
    }
  }
  const check=simEngine.validateBreakerToggle(id,state,live);
  if(!check.allowed){
    setMessage(check.reason||'Breaker operation blocked by safety interlock.');
    refresh();
    return;
  }
  state.closed[id]=!state.closed[id];
  activeScenario='';
  const c=edgeById[id];
  const nextLive=powered(state);
  simEngine.notifyBreakerChanged(id,state.closed[id],nextLive,state);
  // If user closed a VCB that was at Step 1 LOTO, reset its LOTO step to 0
  if(state.closed[id]){
    for(const [eqId,map] of Object.entries(HV_EQUIPMENT_VCB_MAP)){
      if(map.vcbIds.includes(id) && hvLotoManager.getRecord(eqId).completedSteps===1){
        hvLotoManager.resetEquipmentLoto(eqId);
      }
    }
  }
  setMessage(`${c.name} ${state.closed[id]?'closed':'opened'}. ${state.closed[id]?'The path can carry power if its upstream source is active.':'The downstream path is isolated unless another route supplies it.'}`);
  refresh();
}
function toggleSource(id:string){
  state.running[id]=!state.running[id];
  activeScenario='';
  if(id==='shore'&&!state.running.shore){
    state.closed.shoreBreaker=false;
  }
  if(['dg1','dg2','dg3','dg4'].includes(id)&&state.running[id]&&!state.closed[`gb${id.slice(2)}`]){
    simEngine.syncTargetGen=id as 'dg1'|'dg2'|'dg3'|'dg4';
  }
  setMessage(`${byId[id].name} ${state.running[id]?'started':'stopped'}. ${id==='shore'?'Close the Shore Connection breaker when main generator breakers are open.':'A running generator supplies its bus only through a closed generator breaker.'}`);
  refresh();
}
function select(id:string){if(!byId[id]&&!edgeById[id])return;selected=id;selectedPart=undefined;renderInspector();renderSchematic();vessel.update(state,live,selected);}
function scenario(id:string){
  const item=scenarios.find(s=>s.id===id);
  if(!item)return;
  state=item.apply();
  activeScenario=id;
  selected=item.focus;
  selectedPart=undefined;
  simEngine.waterfall.active=false;
  simEngine.waterfall.completed=false;
  simEngine.recoveryStage=null;
  if(id==='parallel'){
    simEngine.syncTargetGen='dg2';
    simEngine.propulsionThrottle=0.60;
  } else if(id==='overload'){
    simEngine.propulsionThrottle=0.82;
  } else if(id==='emergency'){
    simEngine.propulsionThrottle=0.55;
    // Start the SOLAS 5-stage sequential blackout restoration waterfall
    simEngine.startPmsRecovery(state,0);
  } else {
    simEngine.propulsionThrottle=0.55;
  }
  setMessage(item.instruction);
  refresh();
}
function reset(){
  simEngine.propulsionThrottle=0.55;
  simEngine.earthFaultHv=false;
  simEngine.earthFaultLv=false;
  simEngine.earthingArchitecture='IT';
  simEngine.autoSyncGen=null;
  simEngine.recoveryStage=null;
  simEngine.waterfall.active=false;
  simEngine.waterfall.completed=false;
  hvLotoManager.resetAll();
  for(const g of Object.values(simEngine.generators)){
    g.relays.fieldLossInjected=false;
    g.relays.lastTripCode=null;
    g.relays.lastTripReason=null;
    g.avrSetpointPu=1.015;
    g.govSetpointHz=60.8;
  }
  for(const fr of Object.values(simEngine.feederRelays)){
    fr.overcurrentInjected=false;
    fr.idmtProgress=0;
    fr.lastTripReason=null;
  }
  document.querySelector('#arcFlashBanner')?.classList.add('hidden');
  scenario('main');
  vessel.resetCamera();
  setMessage('Simulation reset. DG 1 and the main bus are energized.');
}

function renderScenarios(){const el=document.querySelector('#scenarios')!;el.innerHTML=scenarios.map(s=>`<button type="button" class="scenario ${activeScenario===s.id?'active':''}" data-scenario="${s.id}"><span class="scenario-number">${s.title.slice(0,2)}</span><span>${s.title.slice(5)}</span><span class="scenario-arrow">↗</span></button>`).join('');el.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.onclick=()=>scenario(b.dataset.scenario!));}
function sourceRow(id:string){
  const e=byId[id],breaker=id==='eg'?'egBreaker':id==='shore'?'shoreBreaker':`gb${id.slice(2)}`;
  const g=simEngine.generators[id];
  const isMainDg=['dg1','dg2','dg3','dg4'].includes(id);
  return `<div class="generator-card" data-gen-card="${id}">
    <div class="generator-row">
      <button class="item-name" data-select="${id}" type="button"><span class="state-dot ${state.running[id]?'on':''}"></span>${e.short}</button>
      <button class="mini-toggle ${state.running[id]?'on':''}" data-source="${id}" type="button" aria-label="${state.running[id]?'Stop':'Start'} ${e.name}">${id==='shore'?(state.running[id]?'PLUGGED':'UNPLUGGED'):(state.running[id]?'RUNNING':'STOPPED')}</button>
      <button class="mini-toggle ${state.closed[breaker]?'closed':''}" data-breaker="${breaker}" type="button" aria-label="${state.closed[breaker]?'Open':'Close'} ${edgeById[breaker].name}">CB ${state.closed[breaker]?'CLOSED':'OPEN'}</button>
    </div>
    ${g?`<div class="gen-telemetry-subrow">
      <div class="gen-load-bar-track"><div class="gen-load-bar-fill" id="genBar-${id}" style="width:${Math.min(100,Math.max(0,g.loadPercent))}%"></div></div>
      <div class="gen-meta-line">
        <span class="gen-metrics-text" id="genMetrics-${id}">${g.status} · ${Math.round(g.kw)} kW (${g.loadPercent}%) · ${g.frequencyHz.toFixed(1)} Hz</span>
        ${isMainDg?`<span class="gov-trim-group" title="Adjust governor speed reference (ANSI 32 reverse power) or inject AVR field loss (ANSI 40)">
          <button type="button" class="gov-btn" data-gov-id="${id}" data-gov-delta="-0.15" title="Decrease Governor Speed Reference (Motorize / Test ANSI 32 Reverse Power)">Gov −</button>
          <button type="button" class="gov-btn" data-gov-id="${id}" data-gov-delta="0.15" title="Increase Governor Speed Reference">Gov ＋</button>
          <button type="button" class="gov-btn ${g.relays.fieldLossInjected?'fault-active':''}" data-field-loss="${id}" title="Simulate Loss of Excitation / Field (ANSI 40)">AVR 40</button>
        </span>`:''}
      </div>
      <div class="gen-relay-line hidden" id="genRelay-${id}"></div>
    </div>`:`<div class="gen-telemetry-subrow"><span class="gen-metrics-text">Port 6.6 kV Cold Ironing · Interlocked with Main DGs</span></div>`}
  </div>`;
}
function renderControls(){
  document.querySelector('#generators')!.innerHTML=['dg1','dg2','dg3','dg4','shore'].map(sourceRow).join('');

  // Synchroscope & Paralleling card
  const s=simEngine.sync;
  document.querySelector('#synchroscopeSection')!.innerHTML=`
    <div class="sync-card">
      <div class="sync-target-tabs">
        ${(['dg1','dg2','dg3','dg4'] as const).map(id=>`<button type="button" class="sync-tab ${s.targetGenId===id?'active':''}" data-sync-target="${id}">${byId[id].short}</button>`).join('')}
      </div>
      <div class="sync-main-grid">
        <div class="sync-dial-wrap">
          <svg viewBox="0 0 120 120" class="sync-dial-svg" id="syncDialSvg">
            <circle cx="60" cy="60" r="52" class="sync-dial-bg"/>
            <path d="M 44 10.5 A 52 52 0 0 1 76 10.5" class="sync-window-arc"/>
            <line x1="60" y1="6" x2="60" y2="16" class="sync-twelve-mark"/>
            <text x="24" y="26" class="sync-dir-label">← SLOW</text>
            <text x="96" y="26" text-anchor="end" class="sync-dir-label">FAST →</text>
            <text x="60" y="106" text-anchor="middle" class="sync-twelve-label">12 O'CLOCK SYNC</text>
            <g id="syncNeedleGroup" transform="rotate(${s.phaseAngleDeg.toFixed(1)} 60 60)">
              <line x1="60" y1="66" x2="60" y2="15" class="sync-needle"/>
              <polygon points="60,10 56,20 64,20" class="sync-needle-tip"/>
            </g>
            <circle cx="60" cy="60" r="6" id="syncCenterDot" class="sync-center-dot ${s.inSyncWindow?'ok':''}"/>
          </svg>
        </div>
        <div class="sync-readouts">
          <div class="sync-stat-row"><span>BUS</span><strong id="syncBusVal">${s.busFreqHz.toFixed(2)} Hz · ${s.busVoltageKv.toFixed(2)} kV</strong></div>
          <div class="sync-stat-row"><span>GEN (${byId[s.targetGenId].short})</span><strong id="syncGenVal">${s.genFreqHz.toFixed(2)} Hz · ${s.genVoltageKv.toFixed(2)} kV</strong></div>
          <div class="sync-stat-row"><span>SLIP / Δθ</span><strong id="syncSlipVal">${s.slipHz>=0?'+':''}${s.slipHz.toFixed(2)} Hz · ${Math.round(s.phaseAngleDeg)}°</strong></div>
          <div class="sync-badge ${s.alreadyClosed?'online':s.inSyncWindow?'ok':'wait'}" id="syncStatusBadge">
            ${s.alreadyClosed?'PARALLELED ON BUS':s.inSyncWindow?'ANSI 25 PERMISSIVE OK':'OUT OF SYNC WINDOW'}
          </div>
        </div>
      </div>
      <div class="sync-actions">
        <button type="button" class="button button-primary sync-auto-btn" id="btnAutoSync">⚡ ${s.autoSyncActive?'Auto-Syncing...':'Auto-Sync & Close'}</button>
        <button type="button" class="mini-toggle ${simEngine.checkSyncInterlock?'closed':''}" id="btnCheckSyncToggle" title="Toggle ANSI 25 Check-Synchronizer Interlock">ANSI 25 ${simEngine.checkSyncInterlock?'ON':'BYPASS'}</button>
      </div>
    </div>`;

  // Propulsion & Heavy Load Throttle
  const pct=Math.round(simEngine.propulsionThrottle*100);
  const propKw=Math.round(LOAD_SPECS.drive.ratedKw*simEngine.propulsionThrottle);
  document.querySelector('#throttleSection')!.innerHTML=`
    <div class="throttle-card">
      <div class="throttle-header">
        <span>Telegraph / VFD Order</span>
        <strong id="propThrottleVal">${pct}% · ${propKw} kW</strong>
      </div>
      <input type="range" id="propThrottleSlider" min="0" max="1.15" step="0.01" value="${simEngine.propulsionThrottle}" aria-label="Propulsion Load Throttle">
      <div class="throttle-presets">
        <button type="button" class="preset-btn" data-throttle="0.25">25% Harbor</button>
        <button type="button" class="preset-btn" data-throttle="0.55">55% Cruise</button>
        <button type="button" class="preset-btn" data-throttle="0.85">85% Sea</button>
        <button type="button" class="preset-btn" data-throttle="1.08">108% Flank</button>
      </div>
    </div>`;

  // PMS, HRE & Fault Switchboard
  const earthing=simEngine.hvEarthing;
  const ansi67nMsg=earthing.ansi67nActive?`ANSI 67N Directional Earth Fault Alarm · ${earthing.faultedPhase||'Phase A-Earth'} (V_N = ${earthing.neutralDisplacementV} V, I_ef = ${earthing.groundFaultCurrentAmps.toFixed(1)} A)`:'ANSI 67N Directional Earth Fault Relay: Normal';
  document.querySelector('#pmsSection')!.innerHTML=`
    <div class="pms-card">
      <div class="pms-toggles-row">
        <button type="button" class="mini-toggle ${simEngine.pmsAutoStandby?'closed':''}" id="btnPmsStandby">Auto-Standby (&gt;82%)</button>
        <button type="button" class="mini-toggle ${simEngine.pmsAutoLoadShed?'closed':''}" id="btnPmsLoadShed">Pref. Trip (&gt;94%)</button>
      </div>
      <div class="pms-action-grid">
        <button type="button" class="button button-danger" id="btnTriggerBlackout">🚨 Simulate Blackout</button>
        <button type="button" class="button button-primary" id="btnStartRecovery">🔄 SOLAS Waterfall</button>
      </div>
      <div class="pms-recovery-banner ${simEngine.recoveryStage?'':'hidden'}" id="pmsRecoveryBanner">${simEngine.recoveryStage||''}</div>
      <div class="earthing-arch-box">
        <div class="earthing-arch-label">6.6 kV BUSBAR EARTHING ARCHITECTURE</div>
        <div class="earthing-arch-toggle" role="group" aria-label="Busbar earthing architecture">
          <button type="button" class="earthing-arch-btn ${simEngine.earthingArchitecture==='IT'?'active':''}" data-earthing-arch="IT">Unearthed IT System</button>
          <button type="button" class="earthing-arch-btn ${simEngine.earthingArchitecture==='HRE'?'active':''}" data-earthing-arch="HRE">High-Resistance Earthed (HRE) System</button>
        </div>
        <div class="hre-telemetry-grid" id="hreTelemetryBox">
          <div><span>NEUTRAL DISPLACEMENT (V_N)</span><strong id="hreVnVal">${earthing.neutralDisplacementV.toLocaleString()} V</strong></div>
          <div><span>EARTH FAULT CURRENT (I_ef)</span><strong id="hreIefVal">${earthing.groundFaultCurrentAmps.toFixed(2)} A ${simEngine.earthingArchitecture==='HRE'?'(381 Ω NER)':'(Capacitive)'}</strong></div>
        </div>
        <div class="ansi67n-alarm-badge ${earthing.ansi67nActive?'active':'hidden'}" id="ansi67nBadge">
          ⚡ ${ansi67nMsg}
        </div>
      </div>
      <div class="pms-fault-row">
        <button type="button" class="mini-toggle ${simEngine.earthFaultHv?'fault-active':''}" id="btnFaultHv">⚡ 6.6 kV Earth Fault</button>
        <button type="button" class="mini-toggle ${simEngine.earthFaultLv?'fault-active':''}" id="btnFaultLv">⚡ 440 V Earth Fault</button>
      </div>
      <div class="alarm-log-wrap">
        <div class="alarm-log-header">
          <span>ALARM & PMS LOGBOOK</span>
          <button type="button" class="ack-btn" id="btnAckAlarms">Ack All</button>
        </div>
        <div class="alarm-log-list" id="alarmLogList"></div>
      </div>
    </div>`;

  document.querySelector('#tieControl')!.innerHTML=`
    <div class="tie-control-group">
      <div class="tie-row">
        <button class="item-name" data-select="tie" type="button">6.6 kV Bus Tie (A ↔ B)</button>
        <button class="switch ${state.closed.tie?'on':''}" id="tieSwitch" type="button" role="switch" aria-checked="${state.closed.tie}" aria-label="6.6 kV Bus tie breaker"><span></span></button>
        <strong>${state.closed.tie?'CLOSED':'OPEN'}</strong>
      </div>
      <div class="tie-row" style="margin-top:6px;">
        <button class="item-name" data-select="lvTie" type="button">440 V Bus Tie (A ↔ B)</button>
        <button class="switch ${state.closed.lvTie?'on':''}" id="lvTieSwitch" type="button" role="switch" aria-checked="${state.closed.lvTie}" aria-label="440 V Bus tie breaker"><span></span></button>
        <strong>${state.closed.lvTie?'CLOSED':'OPEN'}</strong>
      </div>
      <div class="tie-row" style="margin-top:6px;">
        <button class="item-name" data-select="consumerTie" type="button">220 V Bus Tie (A ↔ B)</button>
        <button class="switch ${state.closed.consumerTie?'on':''}" id="consumerTieSwitch" type="button" role="switch" aria-checked="${state.closed.consumerTie}" aria-label="220 V Bus tie breaker"><span></span></button>
        <strong>${state.closed.consumerTie?'CLOSED':'OPEN'}</strong>
      </div>
    </div>`;

  const groups = [
    [
      `${VOLTAGES.hv} Feeders (Port & Starboard)`,
      'propFeed', 'bowFeed', 'txAFeed', 'txBFeed', 'reeferAFeed', 'reeferBFeed'
    ],
    [
      `${VOLTAGES.lv} Port Bus A Feeders`,
      'conAAcb', 'cooling1Feed', 'steerFeed', 'fire1Feed', 'ballastFeed', 'bilgeFeed', 'esbTieFeed'
    ],
    [
      `${VOLTAGES.lv} Starboard Bus B Feeders`,
      'conBAcb', 'cooling2Feed', 'craneFeed', 'fire2Feed'
    ],
    [
      `${VOLTAGES.consumer} Accommodation & Hotel`,
      'navFeed', 'lightAFeed', 'galleyFeed', 'lightBFeed', 'txConAEsbTie'
    ],
    [
      '440 V SOLAS Emergency Feeders',
      'eFireFeed', 'eSteerFeed', 'eLightFeed', 'eRadioFeed'
    ]
  ];
  document.querySelector('#feeders')!.innerHTML=groups.map(([title,...ids])=>{const closedCount=ids.filter(id=>state.closed[id]).length;return `<div class="feeder-group"><div class="feeder-label"><span>${title}</span><span class="feeder-count">${closedCount}/${ids.length} CLOSED</span></div>${ids.map(id=>{const c=edgeById[id];const spec=Object.values(LOAD_SPECS).find(ls=>ls.breakerId===id);return `<div class="feeder-row"><button class="feeder-name" data-select="${id}" type="button">${c.name.replace(' feeder breaker','').replace(' breaker','')}${spec?` <small class="feeder-kw-tag">${spec.ratedKw}kW</small>`:''}</button><button class="feeder-state ${state.closed[id]?'closed':''}" data-breaker="${id}" type="button" aria-label="${state.closed[id]?'Open':'Close'} ${c.name}">${state.closed[id]?'CLOSED':'OPEN'}</button></div>`;}).join('')}</div>`;}).join('');
  document.querySelector('#emergencyControls')!.innerHTML=sourceRow('eg')+`<p class="micro-copy">SOLAS automatic standby: Starts & closes onto 440 V Emergency Bus automatically on main switchboard blackout.</p>`;

  document.querySelector('#tieSwitch')!.addEventListener('click',()=>toggleBreaker('tie'));
  document.querySelector('#lvTieSwitch')?.addEventListener('click',()=>toggleBreaker('lvTie'));
  document.querySelector('#consumerTieSwitch')?.addEventListener('click',()=>toggleBreaker('consumerTie'));
  document.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b=>b.onclick=()=>toggleSource(b.dataset.source!));
  document.querySelectorAll<HTMLButtonElement>('[data-breaker]').forEach(b=>b.onclick=()=>toggleBreaker(b.dataset.breaker!));
  document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(b=>b.onclick=()=>select(b.dataset.select!));
  document.querySelectorAll<HTMLButtonElement>('[data-gov-id]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.govId!;
    const delta=parseFloat(b.dataset.govDelta||'0');
    simEngine.nudgeGovernor(id,delta);
    setMessage(`Adjusted ${byId[id].short} governor speed reference to ${simEngine.generators[id].govSetpointHz.toFixed(2)} Hz.`);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-field-loss]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.fieldLoss!;
    setMessage(simEngine.toggleFieldLoss(id));
    renderControls();
    if(selected===id)renderInspector();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-earthing-arch]').forEach(b=>b.onclick=()=>{
    const arch=b.dataset.earthingArch as EarthingArchitecture;
    setMessage(simEngine.setEarthingArchitecture(arch));
    renderControls();
    renderInspector();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-sync-target]').forEach(b=>b.onclick=()=>{
    simEngine.syncTargetGen=b.dataset.syncTarget as 'dg1'|'dg2'|'dg3'|'dg4';
    renderControls();
  });
  document.querySelector<HTMLButtonElement>('#btnAutoSync')?.addEventListener('click',()=>{
    setMessage(simEngine.startAutoSync(simEngine.syncTargetGen,state));
    refresh();
  });
  document.querySelector<HTMLButtonElement>('#btnCheckSyncToggle')?.addEventListener('click',()=>{
    simEngine.checkSyncInterlock=!simEngine.checkSyncInterlock;
    setMessage(`ANSI 25 Check-Synchronizer interlock ${simEngine.checkSyncInterlock?'ENABLED':'BYPASSED'}.`);
    renderControls();
  });
  const propSlider=document.querySelector<HTMLInputElement>('#propThrottleSlider');
  propSlider?.addEventListener('input',ev=>{
    simEngine.propulsionThrottle=parseFloat((ev.target as HTMLInputElement).value);
    const pctVal=Math.round(simEngine.propulsionThrottle*100);
    const kwVal=Math.round(LOAD_SPECS.drive.ratedKw*simEngine.propulsionThrottle);
    const lbl=document.querySelector('#propThrottleVal');
    if(lbl)lbl.textContent=`${pctVal}% · ${kwVal} kW`;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-throttle]').forEach(b=>b.onclick=()=>{
    simEngine.propulsionThrottle=parseFloat(b.dataset.throttle||'0.55');
    if(propSlider)propSlider.value=String(simEngine.propulsionThrottle);
    const pctVal=Math.round(simEngine.propulsionThrottle*100);
    const kwVal=Math.round(LOAD_SPECS.drive.ratedKw*simEngine.propulsionThrottle);
    const lbl=document.querySelector('#propThrottleVal');
    if(lbl)lbl.textContent=`${pctVal}% · ${kwVal} kW`;
    setMessage(`Propulsion VFD order set to ${pctVal}% (${kwVal} kW).`);
  });
  document.querySelector<HTMLButtonElement>('#btnPmsStandby')?.addEventListener('click',()=>{
    simEngine.pmsAutoStandby=!simEngine.pmsAutoStandby;
    renderControls();
  });
  document.querySelector<HTMLButtonElement>('#btnPmsLoadShed')?.addEventListener('click',()=>{
    simEngine.pmsAutoLoadShed=!simEngine.pmsAutoLoadShed;
    renderControls();
  });
  document.querySelector<HTMLButtonElement>('#btnTriggerBlackout')?.addEventListener('click',()=>{
    setMessage(simEngine.triggerBlackout(state));
    refresh();
  });
  document.querySelector<HTMLButtonElement>('#btnStartRecovery')?.addEventListener('click',()=>{
    setMessage(simEngine.startPmsRecovery(state,0));
    refresh();
  });
  document.querySelector<HTMLButtonElement>('#btnFaultHv')?.addEventListener('click',()=>{
    setMessage(simEngine.toggleEarthFault('hv'));
    renderControls();
    renderInspector();
  });
  document.querySelector<HTMLButtonElement>('#btnFaultLv')?.addEventListener('click',()=>{
    setMessage(simEngine.toggleEarthFault('lv'));
    renderControls();
    renderInspector();
  });
  document.querySelector<HTMLButtonElement>('#btnAckAlarms')?.addEventListener('click',()=>{
    simEngine.acknowledgeAllAlarms();
    updateLiveTelemetryDOM();
  });
  updateLiveTelemetryDOM();
}
function nodeClass(e:Equipment){return e.kind==='generator'||e.kind==='emergency-generator'?'source':e.kind==='bus'||e.kind==='emergency-bus'?'bus':e.kind==='future'?'future':'equipment';}
function svgEsc(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
interface RouteDef {
  points: [number, number][];
  breaker?: { pos: [number, number]; orientation: 'h' | 'v' };
}

const SVG_BASE_WIDTH = 1500;
const SVG_BASE_HEIGHT = 960;

const ORTHOGONAL_ROUTES: Record<string, RouteDef> = {
  // --- 6.6 kV Generation Sources (Straight vertical lines down from circles to 6.6 kV bus) ---
  gb1: {
    points: [[160, 159], [160, 220]],
    breaker: { pos: [160, 185], orientation: 'v' }
  },
  gb2: {
    points: [[310, 159], [310, 220]],
    breaker: { pos: [310, 185], orientation: 'v' }
  },
  shoreBreaker: {
    points: [[460, 159], [460, 220]],
    breaker: { pos: [460, 185], orientation: 'v' }
  },
  gb3: {
    points: [[1190, 159], [1190, 220]],
    breaker: { pos: [1190, 185], orientation: 'v' }
  },
  gb4: {
    points: [[1340, 159], [1340, 220]],
    breaker: { pos: [1340, 185], orientation: 'v' }
  },

  // --- 6.6 kV Bus Tie ---
  tie: {
    points: [[660, 220], [840, 220]],
    breaker: { pos: [750, 220], orientation: 'h' }
  },

  // --- 6.6 kV Feeders & Heavy Machinery ---
  propFeed: {
    points: [[520, 220], [520, 321]],
    breaker: { pos: [520, 270], orientation: 'v' }
  },
  driveMotor: {
    points: [[520, 368], [520, 374]]
  },
  shaft: {
    points: [[520, 396], [520, 407]]
  },
  bowFeed: {
    points: [[980, 220], [980, 321]],
    breaker: { pos: [980, 270], orientation: 'v' }
  },

  // Main Step-Down Transformers A & B (6.6 kV / 440 V, 2.5 MVA)
  // Clean, single vertical path passing through the breaker and transformer circles
  txAFeed: {
    points: [[180, 220], [180, 345]],
    breaker: { pos: [180, 275], orientation: 'v' }
  },
  txAOut: {
    points: [[180, 375], [180, 440]]
  },
  txBFeed: {
    points: [[1320, 220], [1320, 345]],
    breaker: { pos: [1320, 275], orientation: 'v' }
  },
  txBOut: {
    points: [[1320, 375], [1320, 440]]
  },

  // Reefer Distribution Transformers A & B (6.6 kV / 440 V, 1.5 MVA)
  // Single vertical path from 6.6 kV bus straight to Reefer Panels
  reeferAFeed: {
    points: [[330, 220], [330, 345]],
    breaker: { pos: [330, 275], orientation: 'v' }
  },
  txReeferAOut: {
    points: [[330, 375], [330, 530]]
  },
  reeferBFeed: {
    points: [[1170, 220], [1170, 345]],
    breaker: { pos: [1170, 275], orientation: 'v' }
  },
  txReeferBOut: {
    points: [[1170, 375], [1170, 530]]
  },

  // --- 440 V Bus Tie ---
  lvTie: {
    points: [[660, 440], [840, 440]],
    breaker: { pos: [750, 440], orientation: 'h' }
  },

  // --- 440 V Bus A Feeders & Control TX A ---
  conAAcb: {
    points: [[110, 440], [110, 550]],
    breaker: { pos: [110, 495], orientation: 'v' }
  },
  txConAOut: {
    points: [[110, 580], [110, 640]]
  },
  fire1Feed: {
    points: [[210, 440], [210, 530]],
    breaker: { pos: [210, 495], orientation: 'v' }
  },
  cooling1Feed: {
    points: [[430, 440], [430, 530]],
    breaker: { pos: [430, 495], orientation: 'v' }
  },
  ballastFeed: {
    points: [[515, 440], [515, 530]],
    breaker: { pos: [515, 495], orientation: 'v' }
  },
  steerFeed: {
    points: [[595, 440], [595, 530]],
    breaker: { pos: [595, 495], orientation: 'v' }
  },
  bilgeFeed: {
    points: [[665, 440], [665, 530]],
    breaker: { pos: [665, 495], orientation: 'v' }
  },

  // --- 440 V Bus B Feeders & Control TX B ---
  conBAcb: {
    points: [[1390, 440], [1390, 550]],
    breaker: { pos: [1390, 495], orientation: 'v' }
  },
  txConBOut: {
    points: [[1390, 580], [1390, 640]]
  },
  fire2Feed: {
    points: [[870, 440], [870, 530]],
    breaker: { pos: [870, 495], orientation: 'v' }
  },
  cooling2Feed: {
    points: [[970, 440], [970, 530]],
    breaker: { pos: [970, 495], orientation: 'v' }
  },
  craneFeed: {
    points: [[1270, 440], [1270, 530]],
    breaker: { pos: [1270, 495], orientation: 'v' }
  },

  // --- 220 V Bus Tie ---
  consumerTie: {
    points: [[660, 640], [840, 640]],
    breaker: { pos: [750, 640], orientation: 'h' }
  },

  // --- 220 V Sub-Board Feeders ---
  navFeed: {
    points: [[240, 640], [240, 710]],
    breaker: { pos: [240, 678], orientation: 'v' }
  },
  lightAFeed: {
    points: [[460, 640], [460, 710]],
    breaker: { pos: [460, 678], orientation: 'v' }
  },
  galleyFeed: {
    points: [[1040, 640], [1040, 710]],
    breaker: { pos: [1040, 678], orientation: 'v' }
  },
  lightBFeed: {
    points: [[1260, 640], [1260, 710]],
    breaker: { pos: [1260, 678], orientation: 'v' }
  },

  // --- 440 V SOLAS Emergency Switchboard (ESB) Connections ---
  egBreaker: {
    points: [[750, 816], [750, 730]],
    breaker: { pos: [750, 775], orientation: 'v' }
  },
  eFireFeed: {
    points: [[570, 730], [570, 825]],
    breaker: { pos: [570, 785], orientation: 'v' }
  },
  eSteerFeed: {
    points: [[660, 730], [660, 825]],
    breaker: { pos: [660, 785], orientation: 'v' }
  },
  eLightFeed: {
    points: [[840, 730], [840, 825]],
    breaker: { pos: [840, 785], orientation: 'v' }
  },
  eRadioFeed: {
    points: [[930, 730], [930, 825]],
    breaker: { pos: [930, 785], orientation: 'v' }
  },
  esbTieFeed: {
    points: [[530, 440], [530, 730]],
    breaker: { pos: [530, 585], orientation: 'v' }
  },
  txConAEsbTie: {
    points: [[530, 730], [50, 730], [50, 640], [95, 640]],
    breaker: { pos: [50, 685], orientation: 'v' }
  }
};

function getRoute(c: Connection, a: Equipment, b: Equipment): RouteDef {
  if (ORTHOGONAL_ROUTES[c.id]) return ORTHOGONAL_ROUTES[c.id];
  const midX = Math.round((a.sx + b.sx) / 2);
  const points: [number, number][] = [[a.sx, a.sy], [midX, a.sy], [midX, b.sy], [b.sx, b.sy]];
  return {
    points,
    breaker: c.breaker ? { pos: [midX, Math.round((a.sy + b.sy) / 2)], orientation: 'v' } : undefined
  };
}

const schematicState = {
  zoom: 1.0,
  panX: 0,
  panY: 0
};

function updateSchematicViewBox() {
  const svg = document.querySelector<SVGSVGElement>('#schematicHost svg');
  if (!svg) return;
  const w = SVG_BASE_WIDTH / schematicState.zoom;
  const h = SVG_BASE_HEIGHT / schematicState.zoom;
  svg.setAttribute('viewBox', `${schematicState.panX} ${schematicState.panY} ${w} ${h}`);
  const resetBtn = document.querySelector<HTMLButtonElement>('#schematicReset');
  if (resetBtn) resetBtn.textContent = `${Math.round(schematicState.zoom * 100)}%`;
}

export function fitSchematicToScreen() {
  schematicState.zoom = 1.0;
  schematicState.panX = 0;
  schematicState.panY = 0;
  updateSchematicViewBox();
}

function zoomSchematic(factor: number) {
  const host = document.querySelector<HTMLElement>('#schematicHost');
  if (!host) return;
  const mx = 0.5;
  const my = 0.5;
  const oldZoom = schematicState.zoom;
  const newZoom = Math.max(0.4, Math.min(4.0, oldZoom * factor));
  if (Math.abs(newZoom - oldZoom) < 0.001) return;
  
  const oldW = SVG_BASE_WIDTH / oldZoom;
  const oldH = SVG_BASE_HEIGHT / oldZoom;
  const newW = SVG_BASE_WIDTH / newZoom;
  const newH = SVG_BASE_HEIGHT / newZoom;
  
  const cursorSvgX = schematicState.panX + mx * oldW;
  const cursorSvgY = schematicState.panY + my * oldH;
  
  schematicState.panX = cursorSvgX - mx * newW;
  schematicState.panY = cursorSvgY - my * newH;
  schematicState.zoom = newZoom;
  updateSchematicViewBox();
}

function initSchematicInteractions() {
  const host = document.querySelector<HTMLElement>('#schematicHost');
  if (!host || host.dataset.interactive) return;
  host.dataset.interactive = 'true';

  let isDown = false;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;
  let hasMoved = false;

  host.addEventListener('pointerdown', (e: PointerEvent) => {
    isDown = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = schematicState.panX;
    startPanY = schematicState.panY;
    hasMoved = false;
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > 4) {
      hasMoved = true;
      host.classList.add('is-panning');
    }
    if (hasMoved) {
      const scale = (SVG_BASE_WIDTH / schematicState.zoom) / host.clientWidth;
      schematicState.panX = startPanX - dx * scale;
      schematicState.panY = startPanY - dy * scale;
      updateSchematicViewBox();
    }
  });

  window.addEventListener('pointerup', () => {
    if (isDown) {
      isDown = false;
      host.classList.remove('is-panning');
    }
  });

  host.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    const oldZoom = schematicState.zoom;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.4, Math.min(4.0, oldZoom * zoomFactor));
    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    const oldW = SVG_BASE_WIDTH / oldZoom;
    const oldH = SVG_BASE_HEIGHT / oldZoom;
    const newW = SVG_BASE_WIDTH / newZoom;
    const newH = SVG_BASE_HEIGHT / newZoom;

    const cursorSvgX = schematicState.panX + mx * oldW;
    const cursorSvgY = schematicState.panY + my * oldH;

    schematicState.panX = cursorSvgX - mx * newW;
    schematicState.panY = cursorSvgY - my * newH;
    schematicState.zoom = newZoom;
    updateSchematicViewBox();
  }, { passive: false });

  document.querySelector('#schematicFit')?.addEventListener('click', fitSchematicToScreen);
  document.querySelector('#schematicZoomIn')?.addEventListener('click', () => zoomSchematic(1.25));
  document.querySelector('#schematicZoomOut')?.addEventListener('click', () => zoomSchematic(0.8));
  document.querySelector('#schematicReset')?.addEventListener('click', fitSchematicToScreen);
}

interface BusbarDef {
  id: string;
  x1: number;
  x2: number;
  y: number;
  label: string;
  voltageType: 'hv' | 'lv' | 'consumer' | 'emergency';
}

const BUSBARS: BusbarDef[] = [
  { id: 'busA', x1: 110, x2: 660, y: 220, label: '6.6 kV MAIN SWITCHBOARD - BUS A (PORT)', voltageType: 'hv' },
  { id: 'busB', x1: 840, x2: 1390, y: 220, label: '6.6 kV MAIN SWITCHBOARD - BUS B (STARBOARD)', voltageType: 'hv' },
  { id: 'lvBusA', x1: 95, x2: 660, y: 440, label: '440 V MAIN SWITCHBOARD - BUS A (PORT)', voltageType: 'lv' },
  { id: 'lvBusB', x1: 840, x2: 1405, y: 440, label: '440 V MAIN SWITCHBOARD - BUS B (STARBOARD)', voltageType: 'lv' },
  { id: 'consumerA', x1: 95, x2: 660, y: 640, label: '220 V SUB-BOARD - BUS A (PORT)', voltageType: 'consumer' },
  { id: 'consumerB', x1: 840, x2: 1405, y: 640, label: '220 V SUB-BOARD - BUS B (STARBOARD)', voltageType: 'consumer' },
  { id: 'eBus', x1: 530, x2: 970, y: 730, label: '440 V EMERGENCY SWITCHBOARD (ESB)', voltageType: 'emergency' }
];

const GENERATOR_IDS = ['dg1', 'dg2', 'dg3', 'dg4', 'eg'];

interface TxDef {
  id: string;
  name: string;
  ratio: string;
  rating: string;
  labelSide: 'left' | 'right';
}

const TRANSFORMERS: TxDef[] = [
  { id: 'txA', name: 'TX A', ratio: '(6.6kV/440V)', rating: '2.5 MVA', labelSide: 'left' },
  { id: 'txB', name: 'TX B', ratio: '(6.6kV/440V)', rating: '2.5 MVA', labelSide: 'left' },
  { id: 'txReeferA', name: 'TX REEFER A', ratio: '(6.6kV/440V)', rating: '1.5 MVA', labelSide: 'left' },
  { id: 'txReeferB', name: 'TX REEFER B', ratio: '(6.6kV/440V)', rating: '1.5 MVA', labelSide: 'left' },
  { id: 'txConA', name: 'TX CON A', ratio: '(440V/220V)', rating: '500 kVA', labelSide: 'left' },
  { id: 'txConB', name: 'TX CON B', ratio: '(440V/220V)', rating: '500 kVA', labelSide: 'right' }
];

const BREAKER_LABELS: Record<string, { label: string; offset: [number, number]; anchor: 'start' | 'end' | 'middle' }> = {
  tie: { label: '6.6kV BUS TIE', offset: [0, -16], anchor: 'middle' },
  lvTie: { label: '440V BUS TIE', offset: [0, -16], anchor: 'middle' },
  consumerTie: { label: '220V BUS TIE', offset: [0, -16], anchor: 'middle' },
  txAFeed: { label: 'TX A VCB', offset: [16, 4], anchor: 'start' },
  txBFeed: { label: 'TX B VCB', offset: [16, 4], anchor: 'start' },
  reeferAFeed: { label: 'REEFER A VCB', offset: [16, 4], anchor: 'start' },
  reeferBFeed: { label: 'REEFER B VCB', offset: [16, 4], anchor: 'start' },
  propFeed: { label: 'DRIVE 1 VCB', offset: [16, 4], anchor: 'start' },
  bowFeed: { label: 'THRUSTER VCB', offset: [16, 4], anchor: 'start' },
  conAAcb: { label: 'CON A ACB', offset: [16, 4], anchor: 'start' },
  conBAcb: { label: 'CON B ACB', offset: [16, 4], anchor: 'start' },
  egBreaker: { label: 'EDG CB', offset: [16, 4], anchor: 'start' },
  txConAEsbTie: { label: 'TX CON A ESB TIE CB (Norm. Open)', offset: [16, 4], anchor: 'start' }
};

function renderSchematic(){
  const host=document.querySelector('#schematicHost')!;

  // 1. Busbars (Bold horizontal lines matching blue image)
  const busbarSvg = BUSBARS.map(b => {
    const isLive = live.has(b.id);
    const isSel = selected === b.id;
    const eq = byId[b.id];
    const midX = (b.x1 + b.x2) / 2;
    return `
      <g class="diagram-busbar ${b.voltageType} ${isLive ? 'live' : 'dead'} ${isSel ? 'selected' : ''}" data-select="${b.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(eq?.name || b.label)}">
        <line class="busbar-hit" x1="${b.x1}" y1="${b.y}" x2="${b.x2}" y2="${b.y}" stroke="transparent" stroke-width="26" />
        <line class="busbar-line" x1="${b.x1}" y1="${b.y}" x2="${b.x2}" y2="${b.y}" />
        <text class="busbar-label ${b.voltageType}" x="${midX}" y="${b.y - 12}" text-anchor="middle">${svgEsc(b.label)}</text>
        <title>${svgEsc(eq?.name || b.label)} · ${isLive ? 'POWERED' : 'DEAD'}</title>
      </g>
    `;
  }).join('');

  // 2. Generators (Circular symbols with sine waves matching blue image)
  const genSvg = GENERATOR_IDS.map(gid => {
    const e = byId[gid];
    if (!e) return '';
    const isLive = live.has(gid);
    const isRunning = !!state.running[gid];
    const isSel = selected === gid;
    const isEg = gid === 'eg';
    const subText = isEg ? '440V / 600kW' : '6.6kV / 3.5MW';
    const r = 24;
    return `
      <g class="gen-symbol ${isEg ? 'emergency' : 'hv'} ${isLive ? 'live' : isRunning ? 'running' : 'dead'} ${isSel ? 'selected' : ''}" data-select="${gid}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(e.name)}">
        <text class="gen-sub" x="${e.sx}" y="${e.sy - 36}">${subText}</text>
        <text class="gen-title" x="${e.sx}" y="${e.sy - 26}">${svgEsc(e.short)}</text>
        <circle cx="${e.sx}" cy="${e.sy}" r="${r}" />
        <path class="gen-sine" d="M ${e.sx - 12} ${e.sy} Q ${e.sx - 6} ${e.sy - 8} ${e.sx} ${e.sy} T ${e.sx + 12} ${e.sy}" />
        <title>${svgEsc(e.name)} · ${isRunning ? 'RUNNING' : 'STOPPED'} · ${isLive ? 'POWERED' : 'NOT POWERED'}</title>
      </g>
    `;
  }).join('');

  // 3. Shore Connection (Purple header & symbol matching blue image)
  const shoreEq = byId['shore'];
  const isShoreLive = live.has('shore');
  const isShoreRunning = !!state.running['shore'];
  const isShoreSel = selected === 'shore';
  const shoreSvg = `
    <g class="shore-symbol ${isShoreLive ? 'live' : 'dead'} ${isShoreSel ? 'selected' : ''}" data-select="shore" tabindex="0" role="button" aria-label="Inspect ${svgEsc(shoreEq?.name || 'Shore Connection')}">
      <text class="shore-title" x="${shoreEq.sx}" y="${shoreEq.sy - 24}">SHORE POWER</text>
      <text class="shore-sub" x="${shoreEq.sx}" y="${shoreEq.sy - 12}">(6.6kV Cold Ironing)</text>
      <title>${svgEsc(shoreEq?.name || 'Shore Connection')} · ${isShoreRunning ? 'CONNECTED' : 'DISCONNECTED'}</title>
    </g>
  `;

  // 4. Transformers (Dual interlocking circles with amber ratings matching blue image)
  const txSvg = TRANSFORMERS.map(t => {
    const e = byId[t.id];
    if (!e) return '';
    const isLive = live.has(t.id);
    const isSel = selected === t.id;
    const r = 14;
    const y1 = e.sy - 8;
    const y2 = e.sy + 8;
    const isLeft = t.labelSide === 'left';
    const lx = isLeft ? e.sx - 24 : e.sx + 24;
    const rx = isLeft ? e.sx + 24 : e.sx - 24;
    const anchor = isLeft ? 'end' : 'start';
    const ratingAnchor = isLeft ? 'start' : 'end';
    return `
      <g class="tx-symbol ${isLive ? 'live' : 'dead'} ${isSel ? 'selected' : ''}" data-select="${t.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(e.name)}">
        <circle class="tx-coil" cx="${e.sx}" cy="${y1}" r="${r}" />
        <circle class="tx-coil" cx="${e.sx}" cy="${y2}" r="${r}" />
        <text class="tx-tag" x="${lx}" y="${e.sy - 6}" text-anchor="${anchor}">${t.name}</text>
        <text class="tx-ratio" x="${lx}" y="${e.sy + 6}" text-anchor="${anchor}">${t.ratio}</text>
        <text class="tx-rating" x="${rx}" y="${e.sy}" text-anchor="${ratingAnchor}">${t.rating}</text>
        <title>${svgEsc(e.name)} · ${t.rating} · ${isLive ? 'ENERGIZED' : 'DE-ENERGIZED'}</title>
      </g>
    `;
  }).join('');

  // 5. Equipment Nodes (Boxes matching blue image)
  const skipEquipmentIds = new Set([
    ...BUSBARS.map(b => b.id),
    ...GENERATOR_IDS,
    'shore',
    ...TRANSFORMERS.map(t => t.id)
  ]);

  const equipmentSvg = equipment.filter(e => !skipEquipmentIds.has(e.id)).map(e => {
    const isLive = live.has(e.id);
    const isSel = selected === e.id;
    const isDriveOrBow = e.id === 'drive' || e.id === 'bow';
    const isMotorOrProp = e.id === 'motor' || e.id === 'prop';
    const w = isDriveOrBow ? 116 : isMotorOrProp ? 84 : 76;
    const h = isDriveOrBow ? 48 : isMotorOrProp ? 22 : 28;
    const rx = 4;
    const x = e.sx - w / 2;
    const y = e.sy - h / 2;

    let content = '';
    if (e.id === 'drive') {
      content = `
        <text class="drive-title" x="${e.sx}" y="${e.sy - 4}" text-anchor="middle">PROPULSION</text>
        <text class="drive-sub" x="${e.sx}" y="${e.sy + 12}" text-anchor="middle">VFD DRIVE 1</text>
      `;
    } else if (e.id === 'bow') {
      content = `
        <text class="drive-title" x="${e.sx}" y="${e.sy - 4}" text-anchor="middle">BOW THRUSTER</text>
        <text class="drive-sub" x="${e.sx}" y="${e.sy + 12}" text-anchor="middle">VFD DRIVE 2</text>
      `;
    } else if (e.id === 'motor') {
      content = `<text class="node-single-label" x="${e.sx}" y="${e.sy + 4}" text-anchor="middle">MOTOR 6.6kV</text>`;
    } else if (e.id === 'prop') {
      content = `<text class="node-single-label" x="${e.sx}" y="${e.sy + 4}" text-anchor="middle">PROP SHAFT</text>`;
    } else {
      const nameParts = e.short.split(' ');
      let line1 = e.short;
      let line2 = '';
      if (nameParts.length > 2) {
        line1 = nameParts.slice(0, 2).join(' ');
        line2 = nameParts.slice(2).join(' ');
      } else if (nameParts.length === 2 && e.short.length > 10) {
        line1 = nameParts[0];
        line2 = nameParts[1];
      }

      if (line2) {
        content = `
          <text class="node-line1" x="${e.sx}" y="${e.sy - 2}" text-anchor="middle">${svgEsc(line1)}</text>
          <text class="node-line2" x="${e.sx}" y="${e.sy + 9}" text-anchor="middle">${svgEsc(line2)}</text>
        `;
      } else {
        content = `
          <text class="node-single-label" x="${e.sx}" y="${e.sy + 4}" text-anchor="middle">${svgEsc(line1)}</text>
        `;
      }
    }

    return `
      <g class="diagram-node ${nodeClass(e)} ${isLive ? 'live' : 'dead'} ${isSel ? 'selected' : ''}" data-select="${e.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(e.name)}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" />
        ${content}
        <title>${svgEsc(e.name)} · ${isLive ? 'POWERED' : 'NOT POWERED'}</title>
      </g>
    `;
  }).join('');

  // 6. Power Paths and Breakers (Single clean line per equipment)
  const paths = connections.map(c => {
    const a = byId[c.from], b = byId[c.to];
    const status = connectionState(c, state, live);
    const route = getRoute(c, a, b);
    const d = 'M ' + route.points.map(p => `${p[0]} ${p[1]}`).join(' L ');
    const isDashed = c.id === 'esbTieFeed' || c.id === 'txConAEsbTie';

    let breaker = '';
    if (c.breaker && route.breaker) {
      const { pos: [bx, by], orientation } = route.breaker;
      const isClosed = !!state.closed[c.id];
      const bInfo = BREAKER_LABELS[c.id];
      let labelSvg = '';
      if (bInfo) {
        labelSvg = `<text class="breaker-label" x="${bx + bInfo.offset[0]}" y="${by + bInfo.offset[1]}" text-anchor="${bInfo.anchor}">${bInfo.label}</text>`;
      }

      let symbolContent = '';
      if (isClosed) {
        symbolContent = `
          <line class="breaker-cross" x1="${bx - 6}" y1="${by - 6}" x2="${bx + 6}" y2="${by + 6}" />
          <line class="breaker-cross" x1="${bx + 6}" y1="${by - 6}" x2="${bx - 6}" y2="${by + 6}" />
        `;
      } else {
        symbolContent = `
          <line class="breaker-open-blade" x1="${bx - 5}" y1="${by + 6}" x2="${bx + 6}" y2="${by - 6}" />
        `;
      }

      breaker = `
        <g class="breaker-symbol ${status} ${isClosed ? 'closed' : 'open'} ${selected === c.id ? 'selected' : ''}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}">
          <rect x="${bx - 10}" y="${by - 10}" width="20" height="20" rx="3" />
          ${symbolContent}
          ${labelSvg}
          <title>${svgEsc(c.name)} · ${isClosed ? 'CLOSED' : 'OPEN'} · ${status}</title>
        </g>
      `;
    }

    return `
      <g class="diagram-path ${status} ${isDashed ? 'dashed-tie' : ''} ${selected === c.id ? 'selected' : ''}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}">
        <path class="power-line-base" d="${d}" />
        ${status === 'live' && !isDashed ? `<path class="power-flow-anim" d="${d}" />` : ''}
        <title>${svgEsc(c.name)} · ${status}</title>
      </g>
      ${breaker}
    `;
  }).join('');

  // 7. Header and Legend
  const headerSvg = `
    <g class="diagram-header">
      <text class="diagram-main-title" x="750" y="44" text-anchor="middle">DUAL-BUS REDUNDANT MARINE POWER SYSTEM (SINGLE LINE DIAGRAM)</text>
      <text class="diagram-subtitle" x="750" y="66" text-anchor="middle">Symmetrical Dual-Transformer Topology (Left Bus A / Right Bus B Redundancy)</text>
    </g>
  `;

  const legendSvg = `
    <g class="diagram-legend-box" transform="translate(40 890)">
      <rect width="1420" height="52" rx="6" />
      <text class="legend-header" x="25" y="22">SYSTEM VOLTAGE RATINGS &amp; REDUNDANCY LEGEND:</text>
      
      <line x1="420" y1="18" x2="465" y2="18" class="legend-sample-line hv" />
      <text class="legend-text" x="475" y="22">6.6 kV HV Main Grid</text>

      <line x1="710" y1="18" x2="755" y2="18" class="legend-sample-line lv" />
      <text class="legend-text" x="765" y="22">440 V LV Distribution</text>

      <line x1="1000" y1="18" x2="1045" y2="18" class="legend-sample-line consumer" />
      <text class="legend-text" x="1055" y="22">220 V Control/Lighting</text>

      <text class="legend-subtext" x="420" y="42">✓ 2x Main Step-Down Transformers (TX A &amp; TX B) | 2x Reefer Transformers (TX REEFER A &amp; B) | 2x Control Transformers (TX CON A &amp; B)</text>
    </g>
  `;

  const vbW = SVG_BASE_WIDTH / schematicState.zoom;
  const vbH = SVG_BASE_HEIGHT / schematicState.zoom;
  host.innerHTML = `
    <div class="diagram-wrap">
      <svg viewBox="${schematicState.panX} ${schematicState.panY} ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dual-Bus Redundant Marine Power System Single Line Diagram">
        <rect width="${SVG_BASE_WIDTH}" height="${SVG_BASE_HEIGHT}" fill="#071220" />
        ${headerSvg}
        ${paths}
        ${busbarSvg}
        ${txSvg}
        ${genSvg}
        ${shoreSvg}
        ${equipmentSvg}
        ${legendSvg}
      </svg>
    </div>
  `;

  host.querySelectorAll<SVGGElement>('[data-select]').forEach(g => {
    g.addEventListener('click', () => select(g.dataset.select!));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(g.dataset.select!);
      }
    });
  });

}
function relatedControls(id:string){const related=connections.filter(c=>c.from===id||c.to===id).filter(c=>c.breaker);if(!related.length)return '';return `<div class="inspector-related"><h4>Connected breakers</h4>${related.map(c=>`<div class="related-row"><button data-select="${c.id}" type="button">${c.name}</button><button class="feeder-state ${state.closed[c.id]?'closed':''}" data-breaker="${c.id}" type="button">${state.closed[c.id]?'CLOSED':'OPEN'}</button></div>`).join('')}</div>`;}
interface AssemblyPageInfo {
  url: string;
  title: string;
  subtitle: string;
  tag: string;
}



function getAssemblyPage(selectedId: string, model: ModelType | undefined): AssemblyPageInfo | null {
  if (model === 'thruster' || selectedId === 'bow') {
    return {
      url: resolveAssemblyUrl('3d_bow_thruster_explodable_assembly.html'),
      title: 'HI-SEA Marine Bow Thruster — 3D Explodable CAD Assembly',
      subtitle: 'Right-Angle Spiral Bevel Drive · 4-Blade Kaplan Bronze Propeller · Bridge Joystick · Hydrodynamic Flow · Bill of Materials',
      tag: 'HI-SEA CAD ASSEMBLY & SPECS'
    };
  }
  if (model === 'hv-board' || model === 'lv-board' || selectedId === 'busA' || selectedId === 'busB' || selectedId === 'tie') {
    return {
      url: resolveAssemblyUrl('3d_marine_main_switchboard_bus_tie_assembly.html'),
      title: 'IEC 60092-302 Marine Main Switchboard & Bus-Tie Assembly',
      subtitle: 'Cubicle 1 Open 115° · Center Withdrawable Bus-Tie ACB · Three-Phase Copper Busbars · IP22 Canopy · Engineering BOM',
      tag: 'IEC 60092-302 CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'prop' || model === 'propeller') {
    return {
      url: resolveAssemblyUrl('3d_marine_propeller_assembly.html'),
      title: 'Marine Propeller & Stern Tube — 3D Explodable Assembly',
      subtitle: 'Controllable Pitch / Fixed Pitch Propeller · Stern Tube Bearings · Lip Seals · Intermediate Coupling · Exploded View & BOM',
      tag: 'PROPULSION CAD ASSEMBLY & SPECS'
    };
  }
  if (['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(selectedId) || model === 'transformer') {
    return {
      url: resolveAssemblyUrl('3d_marine_transformer_assembly.html'),
      title: 'Marine Distribution Transformer — 3D Explodable CAD Assembly',
      subtitle: '3-Phase Laminated Core · Concentric Primary & Secondary Windings · Class H Nomex Insulation · Porcelain Bushings · Forced Air Cooling',
      tag: 'TRANSFORMER CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'drive' || model === 'drive') {
    return {
      url: resolveAssemblyUrl('3d_marine_propulsion_drive_assembly.html'),
      title: 'Marine Propulsion Drive / Converter — 3D Explodable CAD Assembly',
      subtitle: 'Medium-Voltage Frequency Converter · Multi-Pulse Input Stage · Water-Cooled IGBT Inverter Stacks · DC Link Capacitor Bank · Control & Protection Casing',
      tag: 'PROPULSION DRIVE CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'motor' || model === 'motor') {
    return {
      url: resolveAssemblyUrl('3d_marine_propulsion_motor_assembly.html'),
      title: 'Marine Electric Propulsion Motor — 3D Explodable CAD Assembly',
      subtitle: '6.6 kV Squirrel-Cage Induction Motor · Low-Loss Laminated Stator & Rotor · Form-Wound Copper Coils · Heavy-Duty Bearings · Bi-Directional Cooling Fan',
      tag: 'PROPULSION MOTOR CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'steering' || selectedId === 'eSteer') {
    return {
      url: resolveAssemblyUrl('3d_marine_steering_gear_assembly.html'),
      title: 'Marine Steering Gear — 3D Explodable CAD Assembly',
      subtitle: 'Twin-Ram Electro-Hydraulic Steering Gear · Forged Rudder Stock · Double-Acting Crosshead Tiller · Axial Piston Pump · SOLAS Steering Standard',
      tag: 'STEERING GEAR CAD ASSEMBLY & SPECS'
    };
  }
  if (['reefer', 'reeferA', 'reeferB', 'reeferAFeed', 'reeferBFeed'].includes(selectedId) || model === 'reefer') {
    return {
      url: resolveAssemblyUrl('3d_marine_reefer_distribution_assembly.html'),
      title: 'Reefer Distribution Panel — 3D Explodable CAD Assembly',
      subtitle: 'Marine Container Bay Distribution · 440 V / 60 Hz 3-Phase · 4 × 32 A CEE Sockets · Individual MCCB Protection · Solid Copper Hull Grounding',
      tag: 'REEFER DISTRIBUTION CAD ASSEMBLY & SPECS'
    };
  }
  if (['cooling', 'cooling1', 'cooling2', 'fire', 'fire1', 'fire2', 'ballast', 'bilge', 'eFire'].includes(selectedId) || model === 'pump') {
    const pumpVariant = (['fire', 'fire1', 'fire2', 'eFire'].includes(selectedId)) ? 'fire' : selectedId === 'ballast' ? 'ballast' : selectedId === 'bilge' ? 'bilge' : 'cooling';
    return {
      url: resolveAssemblyUrl(`3d_marine_pump_assembly.html?pump=${pumpVariant}`),
      title: 'Marine Centrifugal Pump Set — 3D Explodable CAD Assembly',
      subtitle: 'Machinery Space 440 V Pump Set · Volute Casing · Impeller · Mechanical Shaft Seal · Rigid Foundation Skid',
      tag: 'PUMP CAD ASSEMBLY & SPECS'
    };
  }
  return null;
}

function openAssemblyModal(info: AssemblyPageInfo) {
  const modal = document.querySelector<HTMLElement>('#assemblyModal')!;
  const title = document.querySelector<HTMLElement>('#assemblyModalTitle')!;
  const subtitle = document.querySelector<HTMLElement>('#assemblyModalSubtitle')!;
  const badge = document.querySelector<HTMLElement>('#assemblyModalBadge')!;
  const link = document.querySelector<HTMLAnchorElement>('#assemblyNewTab')!;
  const frame = document.querySelector<HTMLIFrameElement>('#assemblyFrame')!;

  title.textContent = info.title;
  subtitle.textContent = info.subtitle;
  badge.textContent = info.tag;
  link.href = info.url;
  frame.src = info.url;
  modal.classList.remove('hidden');
  document.body.classList.add('has-assembly-modal');
}

function closeAssemblyModal() {
  const modal = document.querySelector<HTMLElement>('#assemblyModal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('has-assembly-modal');
    const frame = document.querySelector<HTMLIFrameElement>('#assemblyFrame');
    if (frame) frame.src = 'about:blank';
  }
}

document.querySelector('#assemblyClose')?.addEventListener('click', closeAssemblyModal);
document.querySelector('#assemblyBackdrop')?.addEventListener('click', closeAssemblyModal);

function modelForSelection():ModelType|undefined {return byId[selected]?.model||edgeById[selected]?.model;}

function verifyHvIsolationOrWarn(equipmentId: string): boolean {
  const access = hvLotoManager.verify3dInspectAccess(equipmentId, state.closed);
  const banner = document.querySelector<HTMLElement>('#arcFlashBanner');
  const bannerText = document.querySelector<HTMLElement>('#arcFlashBannerText');
  if (!access.allowed) {
    const warnMsg = access.violationMessage || 'ARC-FLASH VIOLATION WARNING: Complete the mandatory 5-step 6.6 kV LOTO isolation sequence before opening or exploding HV panels!';
    simEngine.pushAlarm('CRITICAL', 'ARC-FLASH', warnMsg);
    if (banner && bannerText) {
      bannerText.textContent = warnMsg;
      banner.classList.remove('hidden');
    }
    setMessage(warnMsg);
    renderInspector();
    updateLiveTelemetryDOM();
    return false;
  }
  banner?.classList.add('hidden');
  return true;
}

function renderInspector(){
  const pane=document.querySelector('#inspector')!;
  const e=byId[selected],c=edgeById[selected];
  const model=modelForSelection();
  const assemblyInfo=getAssemblyPage(selected, model);
  const title=e?.name||c?.name||'Select equipment';
  const sub=e?.zone||'Switchgear / feeder';
  const status=e?statusText(e.id):c?connectionState(c,state,live)==='open'?'OPEN / DISCONNECTED':connectionState(c,state,live)==='live'?'ENERGIZED':'DE-ENERGIZED':'';
  const purpose=e?.purpose||c?.purpose||'Switches an electrical connection between two pieces of equipment.';
  const path=e?.path||`${byId[c.from].short} → ${byId[c.to].short}`;
  const normal=e?.normal||`${c.normalClosed?'Normally closed':'Normally open'} breaker`;
  const lesson=e?.lesson||c?.lesson||'Closing the breaker connects its two endpoints. The downstream load is powered only when a running source can reach it.';

  const loadSpec=LOAD_SPECS[selected]||Object.values(LOAD_SPECS).find(ls=>ls.breakerId===selected);
  const genSpec=simEngine.generators[selected];
  const busSpec=(simEngine.buses as Record<string, any>)[selected];
  const feederRelay=c?.breaker?simEngine.feederRelays[c.id]:undefined;

  let electricalSpecCard='';
  if(loadSpec){
    const isPowered=live.has(loadSpec.id);
    const activeKw=isPowered?Math.round(loadSpec.id==='drive'?loadSpec.ratedKw*simEngine.propulsionThrottle:loadSpec.ratedKw):0;
    const activeKvar=isPowered?Math.round(activeKw*Math.tan(Math.acos(loadSpec.powerFactor))):0;
    const activeAmps=isPowered?Math.round((Math.hypot(activeKw,activeKvar)*1000)/(Math.sqrt(3)*loadSpec.nominalVoltageV)):0;
    electricalSpecCard=`
      <div class="eto-elec-card">
        <div class="eyebrow">ETO ELECTRICAL RATING & TELEMETRY</div>
        <div class="eto-elec-grid">
          <div><span>RATED POWER</span><strong>${loadSpec.ratedKw} kW · PF ${loadSpec.powerFactor}</strong></div>
          <div><span>LIVE DRAW</span><strong>${activeKw} kW / ${activeKvar} kVAr (${activeAmps} A)</strong></div>
          <div><span>STARTING / INRUSH</span><strong>${loadSpec.startingMethod} (${loadSpec.inrushMultiplier}× Iₙ)</strong></div>
          <div><span>PMS PRIORITY</span><strong>${loadSpec.priority.toUpperCase()}${loadSpec.preferentialTripStage?` (Shed Stage ${loadSpec.preferentialTripStage})`:''}</strong></div>
        </div>
      </div>`;
  } else if(genSpec){
    electricalSpecCard=`
      <div class="eto-elec-card">
        <div class="eyebrow">GENERATOR GOVERNOR & AVR TELEMETRY</div>
        <div class="eto-elec-grid">
          <div><span>RATED CAPACITY</span><strong>${genSpec.ratedKw} kW / ${genSpec.ratedKva} kVA</strong></div>
          <div><span>LIVE OUTPUT</span><strong>${Math.round(genSpec.kw)} kW · ${Math.round(genSpec.kvar)} kVAr (${genSpec.loadPercent}%)</strong></div>
          <div><span>TERMINAL V / Hz</span><strong>${Math.round(genSpec.voltageV)} V · ${genSpec.frequencyHz.toFixed(2)} Hz</strong></div>
          <div><span>DROOP / AVR REF</span><strong>Gov ${genSpec.govSetpointHz.toFixed(2)} Hz · AVR ${genSpec.relays.fieldLossInjected?'FIELD LOSS':`${Math.round(genSpec.avrSetpointPu*100)}%`}</strong></div>
        </div>
      </div>`;
  } else if(busSpec){
    const isHvBus=selected==='busA'||selected==='busB';
    const earthing=simEngine.hvEarthing;
    electricalSpecCard=`
      <div class="eto-elec-card">
        <div class="eyebrow">SWITCHBOARD BUS TELEMETRY</div>
        <div class="eto-elec-grid">
          <div><span>BUS VOLTAGE / Hz</span><strong>${Math.round(busSpec.voltageV)} V · ${busSpec.frequencyHz.toFixed(2)} Hz</strong></div>
          <div><span>TOTAL LOAD</span><strong>${busSpec.kw} kW · ${busSpec.kvar} kVAr (PF ${busSpec.powerFactor})</strong></div>
          <div><span>CURRENT / THD</span><strong>${busSpec.currentAmps} A · THD ${busSpec.thdPercent}%</strong></div>
          <div><span>${isHvBus?`EARTHING (${simEngine.earthingArchitecture})`:'IT INSULATION (IMD)'}</span><strong>${isHvBus&&simEngine.earthingArchitecture==='HRE'?(simEngine.earthFaultHv?`V_N=${earthing.neutralDisplacementV}V · I_ef=${earthing.groundFaultCurrentAmps.toFixed(1)}A`:'381 Ω NER (V_N=0V)'):(busSpec.insulationKohm>=1000?`${(busSpec.insulationKohm/1000).toFixed(1)} MΩ`:`${busSpec.insulationKohm} kΩ FAULT`)}</strong></div>
        </div>
      </div>`;
  }

  // Phase 1: Protective Relay Engine Card (ANSI 32 / ANSI 40 / ANSI 51 IDMT)
  let protectionRelayCard='';
  if(genSpec && ['dg1','dg2','dg3','dg4'].includes(selected)){
    const r=genSpec.relays;
    const ratedQ=genSpec.ratedKvar;
    const tripped32=r.lastTripCode==='ANSI-32';
    const tripped40=r.lastTripCode==='ANSI-40';
    const tripped51=r.lastTripCode==='ANSI-51';
    protectionRelayCard=`
      <div class="relay-engine-card">
        <div class="eyebrow">MULTIFUNCTION PROTECTION RELAY (ANSI 32 / 40 / 51)</div>
        <div class="relay-functions-list">
          <div class="relay-fn-row ${tripped32?'tripped':r.reversePowerTimer>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>ANSI 32 · Reverse Power Protection</strong>
              <span class="relay-pill">${tripped32?'TRIPPED':r.reversePowerTimer>0?`PICKUP ${r.reversePowerTimer.toFixed(1)}s / 3.0s`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Pickup: P &lt; −5% P_rated (−${Math.round(genSpec.ratedKw*0.05)} kW) for &gt; 3.0 s · Live P: ${Math.round(genSpec.kw)} kW</div>
          </div>
          <div class="relay-fn-row ${tripped40?'tripped':r.lossOfFieldTimer>0||r.fieldLossInjected?'pickup':''}">
            <div class="relay-fn-head">
              <strong>ANSI 40 · Loss of Excitation / Field</strong>
              <span class="relay-pill">${tripped40?'TRIPPED':r.lossOfFieldTimer>0?`PICKUP ${r.lossOfFieldTimer.toFixed(1)}s / 1.5s`:r.fieldLossInjected?'ARMED':'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Pickup: Q &lt; −20% Q_rated (−${Math.round(ratedQ*0.20)} kVAr) &amp; V &lt; 85% (5.61 kV) for 1.5 s · Live Q: ${Math.round(genSpec.kvar)} kVAr, V: ${(genSpec.voltageV/1000).toFixed(2)} kV</div>
          </div>
          <div class="relay-fn-row ${tripped51?'tripped':r.idmtProgress>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>ANSI 51 · IDMT Overcurrent Curve</strong>
              <span class="relay-pill">${tripped51?'TRIPPED':r.idmtProgress>0?`DIAL ${(r.idmtProgress*100).toFixed(0)}%`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">IEC Standard Inverse: t = 0.14 / ((I / I_s)^0.02 − 1) · Live I: ${genSpec.currentAmps} A</div>
          </div>
        </div>
        <div class="relay-test-actions">
          <button type="button" class="button button-secondary relay-test-btn ${r.fieldLossInjected?'fault-active':''}" id="btnInspectorFieldLoss">⚡ ${r.fieldLossInjected?'Restore AVR Field':'Inject Field Loss (ANSI 40)'}</button>
          <button type="button" class="button button-secondary relay-test-btn" id="btnInspectorMotorize">↙ Motorize Gov −0.4 Hz (ANSI 32)</button>
        </div>
      </div>`;
  } else if(feederRelay && c){
    const fTripped=Boolean(feederRelay.lastTripReason);
    protectionRelayCard=`
      <div class="relay-engine-card">
        <div class="eyebrow">FEEDER PROTECTION RELAY (ANSI 51 IDMT CURVE)</div>
        <div class="relay-functions-list">
          <div class="relay-fn-row ${fTripped?'tripped':feederRelay.idmtProgress>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>ANSI 51 · IEC Standard Inverse IDMT</strong>
              <span class="relay-pill">${fTripped?'TRIPPED':feederRelay.idmtProgress>0?`DIAL ${(feederRelay.idmtProgress*100).toFixed(0)}%`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Curve: t = k / ((I / I_s)^α − 1) [k=0.14, α=0.02] · Pickup I_s = ${feederRelay.pickupAmps} A · Live I = ${feederRelay.currentAmps} A</div>
          </div>
        </div>
        <div class="relay-test-actions">
          <button type="button" class="button button-secondary relay-test-btn ${feederRelay.overcurrentInjected?'fault-active':''}" id="btnInspectorFeederOverload">⚡ ${feederRelay.overcurrentInjected?'Clear Feeder Overload':'Inject 185% Feeder Overload (ANSI 51)'}</button>
        </div>
      </div>`;
  }

  // Phase 4: Interactive 5-Step LOTO & High Voltage Permit to Work (PTW) Card
  let hvLotoCard='';
  const needsLoto=hvLotoManager.requiresHvLoto(selected);
  if(needsLoto){
    const lotoRec=hvLotoManager.getRecord(selected);
    const map=HV_EQUIPMENT_VCB_MAP[selected];
    const vcbIds=map.vcbIds;
    const anyVcbClosed=vcbIds.some(id=>!!state.closed[id]);
    const vcbNames=vcbIds.map(id=>edgeById[id]?.name||id).join(', ');
    const isIsolated=hvLotoManager.isFullyIsolated(selected,state.closed);
    hvLotoCard=`
      <div class="hv-loto-card ${isIsolated?'is-safe':lotoRec.arcFlashViolation?'is-violation':''}" id="hvLotoCard">
        <div class="hv-loto-header">
          <div>
            <div class="eyebrow">6.6 kV HIGH-VOLTAGE PERMIT TO WORK (PTW)</div>
            <h4>Mandatory 5-Step LOTO Safety Isolation</h4>
          </div>
          <span class="ptw-badge ${isIsolated?'safe':'live'}">${lotoRec.ptwNumber} · ${isIsolated?'ISOLATED & EARTHED':`${lotoRec.completedSteps} / 5 STEPS`}</span>
        </div>
        <div class="arc-flash-violation-badge ${lotoRec.arcFlashViolation?'':'hidden'}" id="inspectorArcFlashBadge" role="alert">
          <span class="arc-flash-badge-icon">⚡</span>
          <div>
            <strong>ARC-FLASH VIOLATION WARNING</strong>
            <p>${lotoRec.violationMessage||'Un-isolated 6.6 kV enclosure access attempted! Complete all 5 LOTO steps before opening or exploding 3D HV models.'}</p>
          </div>
        </div>
        <div class="loto-status-strip">
          <div><span>FEEDER VCB (${vcbIds.join('/')})</span><strong>${anyVcbClosed?'CLOSED (LIVE)':'OPEN'}</strong></div>
          <div><span>VCB TRUCK</span><strong>${lotoRec.completedSteps>=2?'TEST / ISOLATED':'SERVICE'}</strong></div>
          <div><span>6.6 kV WAND</span><strong>${lotoRec.completedSteps>=4?'0.0 kV DEAD':'UNVERIFIED'}</strong></div>
          <div><span>CME SWITCH</span><strong>${lotoRec.completedSteps>=5?'EARTHED TO HULL':'OPEN'}</strong></div>
        </div>
        <div class="loto-steps-list">
          ${HV_LOTO_STEPS.map(st=>{
            const done=lotoRec.completedSteps>=st.stepNumber;
            const isNext=lotoRec.completedSteps===st.stepNumber-1;
            return `<div class="loto-step-row ${done?'done':isNext?'next':'locked'}">
              <div class="loto-step-info">
                <span class="loto-step-num">${done?'✓':st.stepNumber}</span>
                <div>
                  <strong>${st.shortLabel}</strong>
                  <p>${st.detail}</p>
                </div>
              </div>
              <button type="button" class="loto-step-btn ${done?'done':isNext?'primary':''}" data-loto-step="${st.stepNumber}" ${done?'disabled':''}>
                ${done?'Completed':st.actionLabel}
              </button>
            </div>`;
          }).join('')}
        </div>
        <div class="loto-card-footer">
          <span class="loto-vcb-ref">Associated VCB: ${vcbNames}</span>
          <button type="button" class="button button-quiet loto-reset-btn" id="btnResetLoto">↺ De-Isolate &amp; Reset PTW</button>
        </div>
      </div>`;
  }

  pane.innerHTML=`<div class="inspector-header"><div class="eyebrow">EQUIPMENT INSPECTOR</div><span class="inspector-icon">◈</span><h2>${title}</h2><div class="zone">${sub}</div><span class="status-pill ${status.startsWith('POWERED')||status==='ENERGIZED'?'live':status.startsWith('OPEN')?'open':'dead'}">${status}</span></div>
    <div class="inspector-scroll"><div class="facts"><div><span>VOLTAGE / TYPE</span><strong>${e?.voltage||'Vacuum circuit breaker'}</strong></div><div><span>NORMAL STATE</span><strong>${normal}</strong></div></div>
    ${electricalSpecCard}
    ${protectionRelayCard}
    ${hvLotoCard}
    <div class="detail-copy"><h3>Purpose</h3><p>${purpose}</p><h3>Power path</h3><p>${path}</p><h3>Understand it</h3><p>${lesson}</p></div>
    ${e&&allSupplyIds.includes(e.id)?`<div class="inspector-actions"><button class="button button-primary" data-source="${e.id}" type="button">${state.running[e.id]?'Stop':'Start'} ${e.id==='shore'?'shore supply':'generator'}</button></div>`:''}
    ${c?.breaker?`<div class="inspector-actions"><button class="button button-primary" data-breaker="${c.id}" type="button">${state.closed[c.id]?'Open':'Close'} breaker</button></div>`:''}
    ${e?relatedControls(e.id):''}
    ${assemblyInfo?`<div class="inspector-actions" style="margin-top:14px;"><button id="openCadAssembly" type="button" class="button button-primary open-cad-btn" style="width:100%;">⚡ Open 3D Engineering Assembly & Specs ↗</button></div>`:''}
    ${selected === 'prop' || e?.kind === 'propeller' ? `
      <div class="propeller-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Propeller & Stern Tube Assembly</h4>
          </div>
          <span id="propeller-explosion-val" class="propeller-val-badge">${Math.round(propellerAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the nickel-aluminum bronze hub, 4 slender Kaplan blades, thrust washer, retaining nut, multi-stage seals, aft gland, and stern tube cutaway.
        </p>
        <div class="propeller-slider-row">
          <label for="propeller-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="propeller-explosion-slider" min="0" max="1" step="0.01" value="${propellerAssembly.targetExplosionFactor}">
        </div>
        <div class="propeller-presets">
          <button type="button" class="preset-btn" data-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(selected) || e?.kind === 'transformer' || model === 'transformer' ? `
      <div class="transformer-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL · 6.6 kV LOTO ENFORCED</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">6.6 kV / 440 V Distribution Transformer</h4>
          </div>
          <span id="transformer-explosion-val" class="transformer-val-badge">${Math.round(transformerAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the CRGO laminated silicon steel core, concentric 440 V LV and 6.6 kV HV resin coils, dielectric Nomex barriers, porcelain bushings, and radiator fin banks.
        </p>
        <div class="transformer-slider-row">
          <label for="transformer-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="transformer-explosion-slider" min="0" max="1" step="0.01" value="${transformerAssembly.targetExplosionFactor}">
        </div>
        <div class="transformer-presets">
          <button type="button" class="preset-btn" data-tx-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-tx-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-tx-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${selected === 'drive' || e?.kind === 'drive' || model === 'drive' ? `
      <div class="drive-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL · 6.6 kV LOTO ENFORCED</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Marine Propulsion Frequency Converter</h4>
          </div>
          <span id="drive-explosion-val" class="drive-val-badge">${Math.round(driveAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the MV input switchgear, DC link capacitor bank, water-cooled IGBT inverter stacks, closed-loop cooling system, and digital control rack.
        </p>
        <div class="drive-slider-row">
          <label for="drive-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="drive-explosion-slider" min="0" max="1" step="0.01" value="${driveAssembly.targetExplosionFactor}">
        </div>
        <div class="drive-presets">
          <button type="button" class="preset-btn" data-drive-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-drive-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-drive-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${selected === 'motor' || e?.kind === 'motor' || model === 'motor' ? `
      <div class="motor-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL · 6.6 kV LOTO ENFORCED</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Marine Electric Propulsion Motor</h4>
          </div>
          <span id="motor-explosion-val" class="motor-val-badge">${Math.round(motorAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the cast ribbed stator frame, 6.6 kV form-wound coils, squirrel-cage rotor, alloy drive shaft, heavy roller bearings, and aft cooling fan.
        </p>
        <div class="motor-slider-row">
          <label for="motor-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="motor-explosion-slider" min="0" max="1" step="0.01" value="${motorAssembly.targetExplosionFactor}">
        </div>
        <div class="motor-presets">
          <button type="button" class="preset-btn" data-motor-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-motor-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-motor-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${selected === 'steering' || selected === 'eSteer' || e?.id === 'steering' || e?.id === 'eSteer' ? `
      <div class="steering-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Electro-Hydraulic Steering Gear</h4>
          </div>
          <span id="steering-explosion-val" class="steering-val-badge">${Math.round(steeringAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the heavy cast bedplate, vertical rudder stock, crosshead tiller arm, port and starboard hydraulic rams, reciprocating pistons, and hydraulic power pack.
        </p>
        <div class="steering-slider-row">
          <label for="steering-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="steering-explosion-slider" min="0" max="1" step="0.01" value="${steeringAssembly.targetExplosionFactor}">
        </div>
        <div class="steering-presets">
          <button type="button" class="preset-btn" data-steering-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-steering-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-steering-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${['reefer', 'reeferA', 'reeferB', 'reeferAFeed', 'reeferBFeed'].includes(selected) || e?.id === 'reefer' || model === 'reefer' ? `
      <div class="reefer-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#38bdf8;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Reefer Distribution Panel</h4>
          </div>
          <span id="reefer-explosion-val" class="reefer-val-badge">${Math.round(reeferAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the watertight marine steel cabinet, incoming 440 V supply module, MCCB circuit breaker panel, four 32 A container sockets, deck cable transit, and copper earth bar.
        </p>
        <div class="reefer-slider-row">
          <label for="reefer-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="reefer-explosion-slider" min="0" max="1" step="0.01" value="${reeferAssembly.targetExplosionFactor}">
        </div>
        <div class="reefer-presets">
          <button type="button" class="preset-btn" data-reefer-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-reefer-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-reefer-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${['cooling', 'cooling1', 'cooling2', 'fire', 'fire1', 'fire2', 'ballast', 'bilge', 'eFire'].includes(selected) || e?.kind === 'pump' || model === 'pump' ? `
      <div class="pump-controls-card">
        <div class="card-header">
          <div>
            <div class="eyebrow" style="color:#2dd4bf;font-size:10px;font-weight:700;">HYBRID 3D CAD MODEL</div>
            <h4 style="margin:2px 0 0 0;font-size:13px;color:#f8fafc;">Marine Centrifugal Pump Assembly</h4>
          </div>
          <span id="pump-explosion-val" class="pump-val-badge">${Math.round(pumpAssembly.targetExplosionFactor * 100)}%</span>
        </div>
        <p class="micro-copy" style="margin:0;color:#94a3b8;font-size:11px;">
          Explode the heavy steel bedplate, foundation bolts, 440 V induction motor, cooling fins, flexible shaft coupling, volute casing, vaned impeller, suction/discharge flanges, and mechanical seal.
        </p>
        <div class="pump-slider-row">
          <label for="pump-explosion-slider" style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:#cbd5e1;">
            <span>Explosion Displacement</span>
            <span style="color:#64748b;font-weight:normal;">0.0 – 1.0</span>
          </label>
          <input type="range" id="pump-explosion-slider" min="0" max="1" step="0.01" value="${pumpAssembly.targetExplosionFactor}">
        </div>
        <div class="pump-presets">
          <button type="button" class="preset-btn" data-pump-preset="0">0% Assembled</button>
          <button type="button" class="preset-btn" data-pump-preset="0.45">45% Sub-Assy</button>
          <button type="button" class="preset-btn" data-pump-preset="1.0">100% Full Exploded View</button>
        </div>
      </div>
    ` : ''}
    ${model?`<div class="exploded-section${explodedExpanded?' expanded':''}"><div class="section-heading"><div><div class="eyebrow">${assemblyInfo?'3D CAD ENGINEERING MODEL':'INTERACTIVE 3D MODEL'}</div><h3>${assemblyInfo?assemblyInfo.title.split('—')[0].trim():model==='generator'?'Marine diesel generator':model==='breaker'?'Vacuum circuit breaker':model==='hv-board'?'6.6 kV main switchboard':model==='lv-board'?'Low-voltage switchboard':'Inside the equipment'}</h3></div><div class="heading-tools"><span class="generic-tag ${assemblyInfo?'cad-badge':''}">${assemblyInfo?'CAD MODEL':'GENERIC'}</span><button id="explodeExpand" type="button" class="button button-secondary expand-button" aria-expanded="${explodedExpanded}" aria-label="Enlarge the equipment viewer">${assemblyInfo?'⤢ Enlarge & Specs':explodedExpanded?'✕ Close':'⤢ Enlarge'}</button></div></div><p class="micro-copy">${assemblyInfo?`${assemblyInfo.subtitle.split('·')[0].trim()} · ${modelParts[model].length} selectable subassemblies. Click Enlarge to open full interactive assembly with BOM and specifications.`:`Reference-inspired teaching model · ${modelParts[model].length} selectable assemblies. Explode, select a name or a 3D part, then focus to inspect it.`}</p><div class="exploded-host" id="explodedHost"></div><div class="exploded-actions"><button id="explodeToggle" type="button" class="button button-secondary">↗ Explode view</button><button id="focusPart" type="button" class="button button-secondary" disabled>Focus part</button><button id="resetModelView" type="button" class="button button-secondary">Fit all</button><span>Drag to rotate · Scroll to zoom</span></div><div class="parts-list" id="partsList"></div><div id="partDescription" class="part-description">Select a part to see what it does.</div></div>`:''}
    </div>`;

  pane.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b=>b.onclick=()=>toggleSource(b.dataset.source!));
  pane.querySelectorAll<HTMLButtonElement>('[data-breaker]').forEach(b=>b.onclick=()=>toggleBreaker(b.dataset.breaker!));
  pane.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(b=>b.onclick=()=>select(b.dataset.select!));

  // Wire Phase 1 Relay Test Buttons in Inspector
  pane.querySelector<HTMLButtonElement>('#btnInspectorFieldLoss')?.addEventListener('click',()=>{
    setMessage(simEngine.toggleFieldLoss(selected));
    renderControls();
    renderInspector();
  });
  pane.querySelector<HTMLButtonElement>('#btnInspectorMotorize')?.addEventListener('click',()=>{
    simEngine.nudgeGovernor(selected,-0.4);
    setMessage(`Lowered ${byId[selected]?.short||selected} governor reference to ${simEngine.generators[selected].govSetpointHz.toFixed(2)} Hz to test ANSI 32 Reverse Power protection.`);
    renderControls();
    renderInspector();
  });
  pane.querySelector<HTMLButtonElement>('#btnInspectorFeederOverload')?.addEventListener('click',()=>{
    if(c){
      setMessage(simEngine.toggleFeederOvercurrent(c.id));
      renderInspector();
    }
  });

  // Wire Phase 4 LOTO Step Buttons in Inspector
  pane.querySelectorAll<HTMLButtonElement>('[data-loto-step]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const stepNum=parseInt(btn.dataset.lotoStep||'1',10) as 1|2|3|4|5;
      const res=hvLotoManager.executeStep(selected,stepNum,state.closed);
      if(res.success){
        document.querySelector('#arcFlashBanner')?.classList.add('hidden');
        simEngine.pushAlarm('INFO','HV LOTO',res.message);
      } else {
        simEngine.pushAlarm('WARNING','HV LOTO',res.message);
      }
      setMessage(res.message);
      refresh();
    });
  });
  pane.querySelector<HTMLButtonElement>('#btnResetLoto')?.addEventListener('click',()=>{
    const msg=hvLotoManager.resetEquipmentLoto(selected);
    document.querySelector('#arcFlashBanner')?.classList.add('hidden');
    if(['txA','txB','txReeferA','txReeferB','txConA','txConB'].includes(selected)||model==='transformer')transformerAssembly.setExplosionFactor(0);
    if(selected==='drive'||model==='drive')driveAssembly.setExplosionFactor(0);
    if(selected==='motor'||model==='motor')motorAssembly.setExplosionFactor(0);
    if(exploded.isExploded())exploded.setExploded(false);
    setMessage(msg);
    refresh();
  });

  if(assemblyInfo){
    pane.querySelector<HTMLButtonElement>('#openCadAssembly')?.addEventListener('click',()=>{
      if(needsLoto && !verifyHvIsolationOrWarn(selected))return;
      openAssemblyModal(assemblyInfo);
    });
  }

  if (selected === 'prop' || e?.kind === 'propeller') {
    const propSlider = document.getElementById('propeller-explosion-slider') as HTMLInputElement;
    propSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      propellerAssembly.setExplosionFactor(factor);
      const label = document.getElementById('propeller-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.preset || '0');
        propellerAssembly.setExplosionFactor(factor);
        if (propSlider) propSlider.value = String(factor);
        const label = document.getElementById('propeller-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(selected) || e?.kind === 'transformer' || model === 'transformer') {
    const txSlider = document.getElementById('transformer-explosion-slider') as HTMLInputElement;
    txSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
        txSlider.value = '0';
        transformerAssembly.setExplosionFactor(0);
        return;
      }
      transformerAssembly.setExplosionFactor(factor);
      const label = document.getElementById('transformer-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-tx-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.txPreset || '0');
        if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
          if (txSlider) txSlider.value = '0';
          transformerAssembly.setExplosionFactor(0);
          return;
        }
        transformerAssembly.setExplosionFactor(factor);
        if (txSlider) txSlider.value = String(factor);
        const label = document.getElementById('transformer-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (selected === 'drive' || e?.kind === 'drive' || model === 'drive') {
    const driveSlider = document.getElementById('drive-explosion-slider') as HTMLInputElement;
    driveSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
        driveSlider.value = '0';
        driveAssembly.setExplosionFactor(0);
        return;
      }
      driveAssembly.setExplosionFactor(factor);
      const label = document.getElementById('drive-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-drive-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.drivePreset || '0');
        if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
          if (driveSlider) driveSlider.value = '0';
          driveAssembly.setExplosionFactor(0);
          return;
        }
        driveAssembly.setExplosionFactor(factor);
        if (driveSlider) driveSlider.value = String(factor);
        const label = document.getElementById('drive-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (selected === 'motor' || e?.kind === 'motor' || model === 'motor') {
    const motorSlider = document.getElementById('motor-explosion-slider') as HTMLInputElement;
    motorSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
        motorSlider.value = '0';
        motorAssembly.setExplosionFactor(0);
        return;
      }
      motorAssembly.setExplosionFactor(factor);
      const label = document.getElementById('motor-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-motor-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.motorPreset || '0');
        if (factor > 0 && !verifyHvIsolationOrWarn(selected)) {
          if (motorSlider) motorSlider.value = '0';
          motorAssembly.setExplosionFactor(0);
          return;
        }
        motorAssembly.setExplosionFactor(factor);
        if (motorSlider) motorSlider.value = String(factor);
        const label = document.getElementById('motor-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (selected === 'steering' || selected === 'eSteer' || e?.id === 'steering' || e?.id === 'eSteer') {
    const steerSlider = document.getElementById('steering-explosion-slider') as HTMLInputElement;
    steerSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      steeringAssembly.setExplosionFactor(factor);
      const label = document.getElementById('steering-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-steering-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.steeringPreset || '0');
        steeringAssembly.setExplosionFactor(factor);
        if (steerSlider) steerSlider.value = String(factor);
        const label = document.getElementById('steering-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (['reefer', 'reeferA', 'reeferB', 'reeferAFeed', 'reeferBFeed'].includes(selected) || e?.id === 'reefer' || model === 'reefer') {
    const reeferSlider = document.getElementById('reefer-explosion-slider') as HTMLInputElement;
    reeferSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      reeferAssembly.setExplosionFactor(factor);
      const label = document.getElementById('reefer-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-reefer-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.reeferPreset || '0');
        reeferAssembly.setExplosionFactor(factor);
        if (reeferSlider) reeferSlider.value = String(factor);
        const label = document.getElementById('reefer-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if (['cooling', 'cooling1', 'cooling2', 'fire', 'fire1', 'fire2', 'ballast', 'bilge', 'eFire'].includes(selected) || e?.kind === 'pump' || model === 'pump') {
    const pumpSlider = document.getElementById('pump-explosion-slider') as HTMLInputElement;
    pumpSlider?.addEventListener('input', (ev) => {
      const factor = parseFloat((ev.target as HTMLInputElement).value);
      pumpAssembly.setExplosionFactor(factor);
      const label = document.getElementById('pump-explosion-val');
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });

    pane.querySelectorAll<HTMLButtonElement>('[data-pump-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.pumpPreset || '0');
        pumpAssembly.setExplosionFactor(factor);
        if (pumpSlider) pumpSlider.value = String(factor);
        const label = document.getElementById('pump-explosion-val');
        if (label) label.textContent = `${Math.round(factor * 100)}%`;
      });
    });
  }

  if(model){
    pane.querySelector<HTMLButtonElement>('#explodeExpand')!.onclick=()=>{
      if(needsLoto && !verifyHvIsolationOrWarn(selected))return;
      if(assemblyInfo){
        openAssemblyModal(assemblyInfo);
      }else{
        setExpanded(!explodedExpanded);
      }
    };
    document.body.classList.toggle('has-expanded-viewer',explodedExpanded);
    const host=pane.querySelector<HTMLElement>('#explodedHost')!;
    host.appendChild(explodedElement());
    exploded.setModel(model);
    exploded.setPart(selectedPart);
    const button=pane.querySelector<HTMLButtonElement>('#explodeToggle')!;
    button.onclick=()=>{
      if(!exploded.isExploded() && needsLoto && !verifyHvIsolationOrWarn(selected))return;
      exploded.setExploded(!exploded.isExploded());
      button.textContent=exploded.isExploded()?'↙ Assemble view':'↗ Explode view';
    };
    pane.querySelector<HTMLButtonElement>('#focusPart')!.onclick=()=>exploded.focusPart();
    pane.querySelector<HTMLButtonElement>('#resetModelView')!.onclick=()=>exploded.resetView();
    const list=pane.querySelector('#partsList')!;
    list.innerHTML=modelParts[model].map((p,i)=>`<button class="part-chip ${selectedPart===p.id?'active':''}" data-part="${p.id}" type="button"><span>${String(i+1).padStart(2,'0')}</span>${p.name}</button>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(b=>b.onclick=()=>{selectedPart=b.dataset.part;exploded.setPart(selectedPart);updatePartDescription(model);});
    updatePartDescription(model);
  } else {
    exploded.setModel(undefined);
    explodedExpanded=false;
    document.body.classList.remove('has-expanded-viewer');
  }
}

function setExpanded(value:boolean){
  explodedExpanded=value;
  document.body.classList.toggle('has-expanded-viewer',value);
  document.querySelector('.exploded-section')?.classList.toggle('expanded',value);
  const button=document.querySelector<HTMLButtonElement>('#explodeExpand');
  if(button){
    button.textContent=value?'✕ Close':'⤢ Enlarge';
    button.setAttribute('aria-expanded',String(value));
    button.setAttribute('aria-label',value?'Close the enlarged equipment viewer':'Enlarge the equipment viewer');
  }
}

const viewerBackdrop=document.createElement('div');
viewerBackdrop.className='exploded-backdrop';
viewerBackdrop.addEventListener('click',()=>setExpanded(false));
document.body.appendChild(viewerBackdrop);

function setLeftPanel(open:boolean){
  leftPanelOpen=open;
  const ws=document.querySelector('#workspace');
  ws?.classList.toggle('left-collapsed',!open);
  const topBtn=document.querySelector<HTMLButtonElement>('#toggleLeftPanel');
  const icon=document.querySelector('#leftToggleIcon');
  const handleArrow=document.querySelector('#leftHandleArrow');
  if(topBtn){
    topBtn.classList.toggle('active',open);
    topBtn.setAttribute('aria-expanded',String(open));
  }
  if(icon)icon.textContent=open?'⇤':'⇥';
  if(handleArrow)handleArrow.textContent=open?'◂':'▸';
  window.dispatchEvent(new Event('resize'));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),260);
}

function setLeftPanelExpanded(expanded:boolean){
  leftPanelExpanded=expanded;
  if(expanded&&!leftPanelOpen)setLeftPanel(true);
  const ws=document.querySelector('#workspace');
  ws?.classList.toggle('left-expanded',expanded);
  const expBtn=document.querySelector<HTMLButtonElement>('#expandLeftPanel');
  if(expBtn){
    expBtn.classList.toggle('active',expanded);
    expBtn.setAttribute('aria-expanded',String(expanded));
    expBtn.textContent=expanded?'⤡ Compact':'⤢ Expand';
  }
  window.dispatchEvent(new Event('resize'));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),260);
}

function setRightPanel(open:boolean){
  rightPanelOpen=open;
  const ws=document.querySelector('#workspace');
  ws?.classList.toggle('right-collapsed',!open);
  const topBtn=document.querySelector<HTMLButtonElement>('#toggleRightPanel');
  const icon=document.querySelector('#rightToggleIcon');
  if(topBtn){
    topBtn.classList.toggle('active',open);
    topBtn.setAttribute('aria-expanded',String(open));
  }
  if(icon)icon.textContent=open?'⇥':'⇤';
  window.dispatchEvent(new Event('resize'));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),260);
}

document.addEventListener('keydown',e=>{
  const isInput=['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
  if(e.key==='Escape'){
    closeAssemblyModal();
    if(explodedExpanded)setExpanded(false);
  } else if(e.key==='['&&!isInput){
    setLeftPanel(!leftPanelOpen);
  } else if((e.key==='e'||e.key==='E')&&!isInput){
    setLeftPanelExpanded(!leftPanelExpanded);
  } else if(e.key===']'&&!isInput){
    setRightPanel(!rightPanelOpen);
  }
});

function explodedElement():HTMLElement{return explodedHostRef;}
const explodedHostRef=exploded.element();
explodedHostRef.className='exploded-canvas';

function updatePartDescription(model:ModelType){
  const focusButton=document.querySelector<HTMLButtonElement>('#focusPart');
  if(focusButton)focusButton.disabled=!selectedPart;
  document.querySelectorAll<HTMLButtonElement>('.part-chip').forEach(b=>b.classList.toggle('active',b.dataset.part===selectedPart));
  const part=modelParts[model].find(p=>p.id===selectedPart);
  document.querySelector('#partDescription')!.innerHTML=part?`<strong>${part.name}</strong><p>${part.description}</p>`:'Select a part to see what it does.';
}

function updateLiveTelemetryDOM(){
  // 1. Update generator telemetry bars, text, and Phase 1 protective relay timers
  for(const [id,g] of Object.entries(simEngine.generators)){
    const bar=document.getElementById(`genBar-${id}`);
    if(bar){
      bar.style.width=`${Math.min(100,Math.max(0,g.loadPercent))}%`;
      bar.className=`gen-load-bar-fill ${g.loadPercent>95||g.kw<0||g.relays.fieldLossInjected?'crit':g.loadPercent>80?'warn':''}`;
    }
    const txt=document.getElementById(`genMetrics-${id}`);
    if(txt){
      txt.textContent=`${g.status} · ${Math.round(g.kw)} kW (${g.loadPercent}%) · ${g.frequencyHz.toFixed(1)} Hz`;
    }
    const relayEl=document.getElementById(`genRelay-${id}`);
    if(relayEl){
      const r=g.relays;
      const tags:string[]=[];
      if(r.lastTripCode==='ANSI-32')tags.push('TRIP: ANSI 32 Reverse Power');
      else if(r.reversePowerTimer>0)tags.push(`ANSI 32 Reverse P: ${r.reversePowerTimer.toFixed(1)}s / 3.0s`);
      if(r.lastTripCode==='ANSI-40')tags.push('TRIP: ANSI 40 Loss of Field');
      else if(r.lossOfFieldTimer>0)tags.push(`ANSI 40 Loss of Field: ${r.lossOfFieldTimer.toFixed(1)}s / 1.5s (${(g.voltageV/1000).toFixed(2)} kV)`);
      else if(r.fieldLossInjected)tags.push('ANSI 40 Field Loss Armed');
      if(r.lastTripCode==='ANSI-51')tags.push('TRIP: ANSI 51 IDMT Overcurrent');
      else if(r.idmtProgress>0)tags.push(`ANSI 51 IDMT Dial: ${(r.idmtProgress*100).toFixed(0)}%`);
      if(tags.length){
        relayEl.textContent=`⚡ ${tags.join(' · ')}`;
        relayEl.classList.remove('hidden');
      } else {
        relayEl.textContent='';
        relayEl.classList.add('hidden');
      }
    }
  }

  // 2. Update Synchroscope needle & digital readouts
  const s=simEngine.sync;
  const needle=document.getElementById('syncNeedleGroup');
  if(needle)needle.setAttribute('transform',`rotate(${s.phaseAngleDeg.toFixed(1)} 60 60)`);
  const dot=document.getElementById('syncCenterDot');
  if(dot)dot.setAttribute('class',`sync-center-dot ${s.inSyncWindow?'ok':''}`);
  const busVal=document.getElementById('syncBusVal');
  if(busVal)busVal.textContent=`${s.busFreqHz.toFixed(2)} Hz · ${s.busVoltageKv.toFixed(2)} kV`;
  const genVal=document.getElementById('syncGenVal');
  if(genVal)genVal.textContent=`${s.genFreqHz.toFixed(2)} Hz · ${s.genVoltageKv.toFixed(2)} kV`;
  const slipVal=document.getElementById('syncSlipVal');
  if(slipVal)slipVal.textContent=`${s.slipHz>=0?'+':''}${s.slipHz.toFixed(2)} Hz · ${Math.round(s.phaseAngleDeg)}°`;
  const badge=document.getElementById('syncStatusBadge');
  if(badge){
    badge.className=`sync-badge ${s.alreadyClosed?'online':s.inSyncWindow?'ok':'wait'}`;
    badge.textContent=s.alreadyClosed?'PARALLELED ON BUS':s.inSyncWindow?'ANSI 25 PERMISSIVE OK':'OUT OF SYNC WINDOW';
  }
  const autoBtn=document.getElementById('btnAutoSync');
  if(autoBtn)autoBtn.textContent=`⚡ ${s.autoSyncActive?'Auto-Syncing...':'Auto-Sync & Close'}`;

  // 3. Update PMS Recovery Banner, HRE Telemetry & Alarm Logbook
  const recBanner=document.getElementById('pmsRecoveryBanner');
  if(recBanner){
    recBanner.classList.toggle('hidden',!simEngine.recoveryStage);
    recBanner.textContent=simEngine.recoveryStage||'';
  }
  const earthing=simEngine.hvEarthing;
  const hreVn=document.getElementById('hreVnVal');
  if(hreVn)hreVn.textContent=`${earthing.neutralDisplacementV.toLocaleString()} V`;
  const hreIef=document.getElementById('hreIefVal');
  if(hreIef)hreIef.textContent=`${earthing.groundFaultCurrentAmps.toFixed(2)} A ${simEngine.earthingArchitecture==='HRE'?'(381 Ω NER)':'(Capacitive)'}`;
  const ansi67n=document.getElementById('ansi67nBadge');
  if(ansi67n){
    const ansi67nMsg=earthing.ansi67nActive?`ANSI 67N Directional Earth Fault Alarm · ${earthing.faultedPhase||'Phase A-Earth'} (V_N = ${earthing.neutralDisplacementV} V, I_ef = ${earthing.groundFaultCurrentAmps.toFixed(1)} A)`:'ANSI 67N Directional Earth Fault Relay: Normal';
    ansi67n.className=`ansi67n-alarm-badge ${earthing.ansi67nActive?'active':'hidden'}`;
    ansi67n.textContent=`⚡ ${ansi67nMsg}`;
  }

  // 3b. Update Phase 3 SOLAS Blackout Recovery 5-Stage Sequential Waterfall HUD Progress Bar
  const wfHud=document.getElementById('solasWaterfallHud');
  const wf=simEngine.waterfall;
  if(wfHud){
    const showWf=wf.active || wf.completed || activeScenario==='emergency';
    wfHud.classList.toggle('hidden',!showWf);
    if(showWf){
      const curTitle=wf.currentStage?`Stage ${wf.currentStage.stageNumber}: ${wf.currentStage.shortTitle}`:(wf.completed?'All 5 SOLAS Stages Restored':'SOLAS Blackout Recovery');
      wfHud.innerHTML=`
        <div class="solas-wf-header">
          <div class="solas-wf-title">
            <span class="solas-wf-badge">${wf.active?'SOLAS SEQUENTIAL WATERFALL ACTIVE':'SOLAS WATERFALL COMPLETE'}</span>
            <strong>${curTitle} (T = ${wf.elapsedSec.toFixed(1)}s)</strong>
          </div>
          <span class="solas-wf-pct">${wf.progressPercent}%</span>
        </div>
        <div class="solas-wf-bar-track">
          <div class="solas-wf-bar-fill" style="width:${wf.progressPercent}%"></div>
        </div>
        <div class="solas-wf-stages-grid">
          ${SOLAS_WATERFALL_STAGES.map((st,idx)=>{
            const isDone=wf.completed || (wf.active && idx<wf.currentStageIndex);
            const isCur=wf.active && idx===wf.currentStageIndex;
            return `<div class="solas-wf-stage-pill ${isDone?'done':isCur?'active':'pending'}">
              <div class="solas-wf-stage-top">
                <span class="solas-wf-stage-time">${st.timeWindowLabel}</span>
                <span class="solas-wf-stage-state">${isDone?'✓ ENERGIZED':isCur?'⚡ SEQUENCING':'QUEUED'}</span>
              </div>
              <strong class="solas-wf-stage-name">Stage ${st.stageNumber}: ${st.shortTitle}</strong>
            </div>`;
          }).join('')}
        </div>`;
    }
  }

  const alarmList=document.getElementById('alarmLogList');
  if(alarmList){
    alarmList.innerHTML=simEngine.alarms.slice(0,8).map(a=>`
      <div class="alarm-item ${a.severity.toLowerCase()} ${a.acknowledged?'ack':''}">
        <div class="alarm-top-row">
          <strong class="alarm-code">${a.code}</strong>
          <span class="alarm-time">${a.time}</span>
        </div>
        <div class="alarm-msg">${a.message}</div>
      </div>`).join('');
  }

  // 4. Update Bottom HUD Bus Telemetry Strip
  const strip=document.getElementById('busTelemetryStrip');
  if(strip){
    const bA=simEngine.buses.busA, bB=simEngine.buses.busB;
    const lvA=simEngine.buses.lvBusA, lvB=simEngine.buses.lvBusB;
    const conA=simEngine.buses.consumerA, conB=simEngine.buses.consumerB;
    const bEm=simEngine.buses.eBus;
    const txA=simEngine.transformerLoading.txA, txB=simEngine.transformerLoading.txB;
    const txReeferA=simEngine.transformerLoading.txReeferA, txReeferB=simEngine.transformerLoading.txReeferB;
    strip.innerHTML=`
      <button type="button" class="bus-tele-card ${bA.live?'live':'dead'}" data-bus-jump="busA">
        <span class="bus-tele-title">6.6 kV BUS A (${simEngine.earthingArchitecture})</span>
        <strong>${bA.live?`${(bA.voltageV/1000).toFixed(2)} kV · ${bA.frequencyHz.toFixed(2)} Hz`:'DEAD BUS'}</strong>
        <span>${bA.kw} kW · PF ${bA.powerFactor} · THD ${bA.thdPercent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${bB.live?'live':'dead'}" data-bus-jump="busB">
        <span class="bus-tele-title">6.6 kV BUS B (${simEngine.earthingArchitecture})</span>
        <strong>${bB.live?`${(bB.voltageV/1000).toFixed(2)} kV · ${bB.frequencyHz.toFixed(2)} Hz`:'DEAD BUS'}</strong>
        <span>${bB.kw} kW · PF ${bB.powerFactor} · THD ${bB.thdPercent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${lvA.live?'live':'dead'}" data-bus-jump="lvBusA">
        <span class="bus-tele-title">440 V BUS A (PORT)</span>
        <strong>${lvA.live?`${Math.round(lvA.voltageV)} V · ${lvA.frequencyHz.toFixed(1)} Hz`:'DEAD BUS'}</strong>
        <span>${lvA.kw} kW · TxA ${txA.percent}% · RefA ${txReeferA.percent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${lvB.live?'live':'dead'}" data-bus-jump="lvBusB">
        <span class="bus-tele-title">440 V BUS B (STBD)</span>
        <strong>${lvB.live?`${Math.round(lvB.voltageV)} V · ${lvB.frequencyHz.toFixed(1)} Hz`:'DEAD BUS'}</strong>
        <span>${lvB.kw} kW · TxB ${txB.percent}% · RefB ${txReeferB.percent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${conA.live||conB.live?'live':'dead'}" data-bus-jump="consumerA">
        <span class="bus-tele-title">220 V SUB A &amp; B</span>
        <strong>${conA.live||conB.live?`${Math.round(conA.live?conA.voltageV:conB.voltageV)} V · 60 Hz`:'DEAD BUS'}</strong>
        <span>Sub A: ${conA.kw} kW · Sub B: ${conB.kw} kW</span>
      </button>
      <button type="button" class="bus-tele-card ${bEm.live?'live':'dead'}" data-bus-jump="eBus">
        <span class="bus-tele-title">440 V ESB (SOLAS)</span>
        <strong>${bEm.live?`${Math.round(bEm.voltageV)} V · ${bEm.frequencyHz.toFixed(1)} Hz`:'STANDBY'}</strong>
        <span>${bEm.kw} kW · SOLAS Essential</span>
      </button>`;
    strip.querySelectorAll<HTMLButtonElement>('[data-bus-jump]').forEach(btn=>{
      btn.onclick=()=>select(btn.dataset.busJump!);
    });
  }

  // 5. Update Topbar Telemetry Pills
  const topGen=document.querySelector('#topGenCount');
  if(topGen){
    const onlineCnt=['dg1','dg2','dg3','dg4'].filter(id=>state.running[id]&&state.closed[`gb${id.slice(2)}`]).length;
    topGen.textContent=state.closed.shoreBreaker?'SHORE POWER':`${onlineCnt} / 4 ONLINE`;
  }
  const topBusFreq=document.querySelector('#topBusFreq');
  if(topBusFreq){
    const refBus=simEngine.buses.busA.live?simEngine.buses.busA:simEngine.buses.busB;
    topBusFreq.textContent=refBus.live?`${refBus.frequencyHz.toFixed(2)} Hz · ${(refBus.voltageV/1000).toFixed(2)} kV`:'0.00 Hz · BLACKOUT';
  }
  const topTotalKw=document.querySelector('#topTotalKw');
  if(topTotalKw){
    const totalKw=simEngine.buses.busA.kw+simEngine.buses.busB.kw+simEngine.buses.eBus.kw;
    const totalKva=Math.hypot(totalKw,simEngine.buses.busA.kvar+simEngine.buses.busB.kvar+simEngine.buses.eBus.kvar);
    const pf=totalKva>1?(totalKw/totalKva).toFixed(2):'1.00';
    topTotalKw.textContent=`${totalKw.toLocaleString()} kW · PF ${pf}`;
  }
  const topTie=document.querySelector('#topTieState');
  if(topTie){
    topTie.textContent=state.closed.tie?'CLOSED':'OPEN';
    topTie.className=state.closed.tie?'is-closed':'is-open';
  }
  const topImd=document.querySelector('#topImdState');
  if(topImd){
    const fault=simEngine.earthFaultHv||simEngine.earthFaultLv;
    if(simEngine.earthFaultHv && simEngine.earthingArchitecture==='HRE'){
      topImd.textContent='HRE · V_N 3810V · 10.0A (67N)';
    } else if(simEngine.earthFaultHv){
      topImd.textContent='IT · 6.6kV FAULT (14 kΩ)';
    } else if(simEngine.earthFaultLv){
      topImd.textContent='440V FAULT (8 kΩ)';
    } else {
      topImd.textContent=`${simEngine.earthingArchitecture} · 15.0 MΩ OK`;
    }
    topImd.className=fault?'is-open':'is-closed';
  }
}

function refresh(){
  live=powered(state);
  simEngine.step(0.05,state);
  renderScenarios();
  renderControls();
  renderSchematic();
  renderInspector();
  vessel.update(state,live,selected);
  updateLiveTelemetryDOM();
  const s=scenarios.find(s=>s.id===activeScenario);
  document.querySelector('#lessonTitle')!.textContent=s?.title||'Free exploration';
  document.querySelector('#lessonText')!.textContent=s?.instruction||'Change a source or breaker and trace which loads remain connected to an active source.';
  const runningSources=allSupplyIds.filter(id=>state.running[id]).length;
  const suppliedLoads=equipment.filter(e=>['load','pump','thruster','motor','propeller'].includes(e.kind)&&live.has(e.id)).length;
  document.querySelector('#statusCount')!.textContent=`${runningSources} sources active · ${suppliedLoads} load groups supplied`;
  document.querySelector('.small-index')!.textContent=s?`${String(scenarios.indexOf(s)+1).padStart(2,'0')} / ${String(scenarios.length).padStart(2,'0')}`:'FREE MODE';
  setMessage(message);
}

document.querySelector('#openTutorialBtn')?.addEventListener('click',()=>{
  openAssemblyModal({
    url: resolveAssemblyUrl('tutorial.html'),
    title: 'Marine Power System Simulator — Interactive ETO Operations & Simulation Guide',
    subtitle: 'Step-by-Step Guide · Generator Paralleling & Synchroscope · PMS Load Sharing · Blackout Recovery · IT Earth Faults',
    tag: 'ETO STUDENT TRAINING MANUAL'
  });
});
document.querySelector('#openUniversalCatalog')?.addEventListener('click',()=>{
  openAssemblyModal({
    url: resolveAssemblyUrl('universal_viewer.html?eq=pump_cooling'),
    title: 'Universal Marine Equipment 3D CAD & Electrical Spec Viewer',
    subtitle: 'Unified Manifest-Driven Viewer · Interactive Exploded Views · ETO Electrical Ratings & BOM',
    tag: 'UNIVERSAL ETO EQUIPMENT CATALOG'
  });
});
document.querySelector('#toggleLeftPanel')?.addEventListener('click',()=>setLeftPanel(!leftPanelOpen));
document.querySelector('#expandLeftPanel')?.addEventListener('click',()=>setLeftPanelExpanded(!leftPanelExpanded));
document.querySelector('#closeLeftPanel')?.addEventListener('click',()=>setLeftPanel(false));
document.querySelector('#leftEdgeHandle')?.addEventListener('click',()=>setLeftPanel(!leftPanelOpen));
document.querySelector('#toggleRightPanel')?.addEventListener('click',()=>setRightPanel(!rightPanelOpen));
document.querySelector('#resetAll')!.addEventListener('click',reset);
document.querySelector('#resetCamera')!.addEventListener('click',()=>vessel.resetCamera());
document.querySelector('#focusEquipment')!.addEventListener('click',()=>vessel.focusSelection());
document.querySelector('#toggleShell')!.addEventListener('click',e=>{showShell=!showShell;vessel.setShell(showShell);(e.currentTarget as HTMLElement).textContent=`▧ Shell ${showShell?'on':'off'}`;});
document.querySelector('#toggleLabels')!.addEventListener('click',e=>{showLabels=!showLabels;vessel.setLabels(showLabels);(e.currentTarget as HTMLElement).textContent=`T Labels ${showLabels?'on':'off'}`;});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
  view=b.dataset.view as View;
  document.querySelector('#vesselHost')!.classList.toggle('hidden',view!=='vessel');
  document.querySelector('#schematicHost')!.classList.toggle('hidden',view!=='schematic');
  document.querySelector('#viewTools')!.classList.toggle('hidden',view!=='vessel');
  document.querySelector('#schematicTools')?.classList.toggle('hidden',view!=='schematic');
  document.querySelector('#viewTitle')!.textContent=view==='vessel'?'Vessel overview':'Single-line diagram';
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-selected',String(t===b));});
  if(view==='schematic') {
    fitSchematicToScreen();
  }
});
refresh();

// Run continuous 100ms quasi-steady-state electrical simulation loop
setInterval(()=>{
  simEngine.step(0.1,state,msg=>{
    setMessage(msg);
    refresh();
  });
  updateLiveTelemetryDOM();
},100);

(window as any).app = { vessel, exploded, simEngine, hvLotoManager, scenario, select, toggleBreaker, toggleSource, reset, refresh, setLeftPanel, setLeftPanelExpanded, setRightPanel, getState: () => state, getLive: () => live };

import './style.css';
import { byId, connections, edgeById, equipment, initialState, powered, connectionState, scenarios, sourceIds, allSupplyIds, VOLTAGES, type SimState, type Equipment, type ModelType, type Connection, type EarthingArchitecture } from './core/network';
import { modelParts, HV_LOTO_STEPS, HV_EQUIPMENT_VCB_MAP, hvLotoManager, PROTECTION_RELAY_CATALOG } from './assemblies/models';
import { VesselView, ExplodedView } from './vessel/scene';
import { SOLAS_WATERFALL_STAGES } from './vessel/vessel-layout';
import { propellerAssembly } from './assemblies/propeller-assembly';
import { transformerAssembly } from './assemblies/transformer-assembly';
import { driveAssembly } from './assemblies/drive-assembly';
import { motorAssembly } from './assemblies/motor-assembly';
import { steeringAssembly } from './assemblies/steering-assembly';
import { reeferAssembly } from './assemblies/reefer-assembly';
import { pumpAssembly } from './assemblies/pump-assembly';
import {
  esbCubicleAssembly,
  batterySystemAssembly,
  airCompressorAssembly,
  ventFanAssembly,
  ballastOwsAssembly,
  galleyBoardAssembly,
  shorePowerAssembly,
  bridgeNavComAssembly
} from './assemblies/consumer-assemblies';
import { resolveAssemblyUrl } from './vessel/assets';
import { simEngine, LOAD_SPECS } from './core/sim-engine';

// Stroke icons (24px grid, drawn with currentColor) used in place of unicode glyphs.
const ICON_PATHS={
  panelLeft:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelRight:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  chevronLeft:'<path d="M15 6l-6 6 6 6"/>',
  chevronRight:'<path d="M9 6l6 6-6 6"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  maximize:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  minimize:'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  warning:'<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  reset:'<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  book:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  grid:'<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  mark:'<path d="M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M3 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M12 3v7M8.5 6.5L12 3l3.5 3.5"/>',
} as const;
function icon(name:keyof typeof ICON_PATHS){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;}

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
      <button class="drawer-toggle-btn active" id="toggleLeftPanel" type="button" aria-expanded="true" title="Show or hide controls ([)">
        <span class="drawer-toggle-icon">${icon('panelLeft')}</span>
        <span class="drawer-toggle-text">Controls</span>
      </button>
      <div class="brand">
        <span class="brand-symbol">${icon('mark')}</span>
        <h1>Marine Power System <span>Simulator</span></h1>
      </div>
    </div>
    <div class="top-telemetry" id="topTelemetry" aria-label="Plant summary">
      <div class="telemetry-pill"><span class="telemetry-label">Generators</span><strong id="topGenCount">1 / 4</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">6.6 kV bus</span><strong id="topBusFreq">60.00 Hz · 6.56 kV</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">Total load</span><strong id="topTotalKw">0 kW · PF 0.89</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">Bus tie</span><strong id="topTieState" class="is-closed">CLOSED</strong></div>
      <div class="telemetry-pill"><span class="telemetry-label">Earthing / IMD</span><strong id="topImdState" class="is-closed">IT · 15.0 MΩ OK</strong></div>
    </div>
    <div class="top-actions">
      <button class="button button-quiet" id="openTutorialBtn" type="button" title="Open the tutorial">${icon('book')}<span class="button-label">Tutorial</span></button>
      <button class="button button-quiet" id="openUniversalCatalog" type="button" title="Open the equipment catalog">${icon('grid')}<span class="button-label">Catalog</span></button>
      <button class="button button-quiet" id="resetAll" type="button" title="Reset the simulation">${icon('reset')}<span class="button-label">Reset</span></button>
      <button class="drawer-toggle-btn active" id="toggleRightPanel" type="button" aria-expanded="true" title="Show or hide the inspector (])">
        <span class="drawer-toggle-text">Inspector</span>
        <span class="drawer-toggle-icon">${icon('panelRight')}</span>
      </button>
    </div>
  </header>
  <main class="workspace" id="workspace">
    <aside class="left-panel panel" id="leftPanel" aria-label="Scenarios and switchboard controls">
      <div class="panel-heading">
        <h2>Scenarios</h2>
        <div class="panel-heading-right">
          <span class="small-index">01 / 06</span>
          <button class="panel-expand-btn" id="expandLeftPanel" type="button" title="Widen to two columns (E)" aria-expanded="false">${icon('maximize')}<span>Widen</span></button>
          <button class="panel-collapse-btn" id="closeLeftPanel" type="button" title="Hide controls ([)" aria-label="Hide controls">${icon('chevronLeft')}</button>
        </div>
      </div>
      <div class="scenario-list" id="scenarios"></div>
      <section class="control-section" id="secGenerators"><div class="section-heading"><h3>Generation and shore</h3><span class="subtle">${VOLTAGES.hv} · droop</span></div><div id="generators"></div></section>
      <section class="control-section" id="secSync"><div class="section-heading"><h3>Synchroscope</h3><span class="subtle">ANSI 25</span></div><div id="synchroscopeSection"></div></section>
      <section class="control-section" id="secThrottle"><div class="section-heading"><h3>Propulsion load</h3><span class="subtle">VFD order</span></div><div id="throttleSection"></div></section>
      <section class="control-section" id="secPms"><div class="section-heading"><h3>PMS, earthing and faults</h3><span class="subtle">ANSI 67N</span></div><div id="pmsSection"></div></section>
      <section class="control-section" id="secTie"><div class="section-heading"><h3>Bus ties</h3><span class="subtle">A ↔ B</span></div><div id="tieControl"></div></section>
      <section class="control-section" id="secEmergency"><div class="section-heading"><h3>Emergency supply</h3><span class="subtle">SOLAS 440 V</span></div><div id="emergencyControls"></div></section>
      <section class="control-section" id="secFeeders"><div class="section-heading"><h3>Feeders</h3><span class="subtle">Click a state to switch</span></div><div id="feeders"></div></section>
    </aside>
    <section class="center-panel">
      <button class="left-edge-handle" id="leftEdgeHandle" type="button" title="Show controls ([)" aria-label="Show controls">
        <span class="handle-arrow" id="leftHandleArrow">${icon('chevronRight')}</span>
        <span class="handle-label">Controls</span>
      </button>
      <div class="view-header">
        <div class="view-title-group">
          <h2 id="viewTitle">Vessel overview</h2>
        </div>
        <div class="tabs" role="tablist" aria-label="System views">
          <button class="tab active" data-view="vessel" role="tab" aria-selected="true">3D vessel</button>
          <button class="tab" data-view="schematic" role="tab" aria-selected="false">Single-line</button>
        </div>
      </div>
      <div class="visual-stage" id="visualStage">
        <div class="vessel-host" id="vesselHost" aria-label="Interactive 3D vessel view"></div>
        <div class="schematic-host hidden" id="schematicHost" aria-label="Interactive single-line diagram"></div>
        <div class="arc-flash-stage-banner hidden" id="arcFlashBanner" role="alert">
          <span class="arc-flash-icon">${icon('warning')}</span>
          <div class="arc-flash-copy">
            <strong>HV panel not isolated</strong>
            <span id="arcFlashBannerText">Complete the 6.6 kV lockout / tagout steps in the inspector before opening or exploding an HV enclosure.</span>
          </div>
          <button type="button" class="arc-flash-dismiss" id="dismissArcFlashBanner" aria-label="Dismiss warning">${icon('close')}</button>
        </div>
        <div class="view-tools" id="viewTools">
          <button id="resetCamera" type="button">Reset view</button>
          <button id="focusEquipment" type="button">Focus selection</button>
          <button id="toggleShell" type="button" aria-pressed="true">Hull</button>
          <button id="toggleLabels" type="button" aria-pressed="true">Labels</button>
        </div>
        <div class="schematic-legend-card hidden" id="schematicLegendCard" aria-label="Single-line diagram legend">
          <div class="schematic-legend-header" id="schematicLegendHeader" title="Click to collapse / expand legend">
            <div class="schematic-legend-title-wrap">
              <span class="schematic-legend-title">Legend</span>
              <span class="schematic-legend-sub">DWG NO: MPS-SLD-2026-REV-A</span>
            </div>
            <button type="button" class="schematic-legend-toggle" id="toggleSchematicLegend" title="Collapse / expand legend" aria-label="Toggle legend">
              ${icon('chevronLeft')}
            </button>
          </div>
          <div class="schematic-legend-content" id="schematicLegendContent">
            <div class="legend-row">
              <span class="legend-bar hv"></span>
              <span class="legend-name">6.6 kV main distribution</span>
            </div>
            <div class="legend-row">
              <span class="legend-bar lv"></span>
              <span class="legend-name">440 V distribution</span>
            </div>
            <div class="legend-row">
              <span class="legend-bar consumer"></span>
              <span class="legend-name">220 V control &amp; domestic sub-boards</span>
            </div>
            <div class="legend-row">
              <span class="legend-bar emergency"></span>
              <span class="legend-name">440 V SOLAS emergency</span>
            </div>
            <div class="legend-row">
              <span class="legend-bar bulkhead"></span>
              <span class="legend-name">A-60 / watertight bulkheads</span>
            </div>
            <div class="legend-subnote">CLASS: DNV / BV / SOLAS II-1 · Dual transformers · Galley shunt trip · 381 Ω NER</div>
          </div>
        </div>
        <div class="view-tools hidden" id="schematicTools">
          <button id="schematicFit" type="button" title="Fit diagram to view">Fit</button>
          <button id="schematicZoomIn" type="button" title="Zoom in" aria-label="Zoom in">+</button>
          <button id="schematicZoomOut" type="button" title="Zoom out" aria-label="Zoom out">−</button>
          <button id="schematicReset" type="button" title="Reset zoom">100%</button>
        </div>
      </div>
      <div class="bottom-hud">
        <div class="solas-waterfall-hud hidden" id="solasWaterfallHud" aria-label="SOLAS blackout recovery progress"></div>
        <div class="bus-telemetry-strip" id="busTelemetryStrip" aria-label="Switchboard bus readings"></div>
        <div class="status-strip">
          <div class="legend">
            <span><i class="legend-line live"></i> Energized</span>
            <span><i class="legend-line dead"></i> De-energized</span>
            <span><i class="legend-line open"></i> Open</span>
          </div>
          <div class="status-count" id="statusCount"></div>
        </div>
        <div class="hud-cards-row">
          <div class="lesson-banner">
            <span class="lesson-icon"></span>
            <div>
              <strong id="lessonTitle">Current lesson</strong>
              <p id="lessonText"></p>
            </div>
          </div>
          <div class="notice-card">
            <span class="notice-tag">Last event</span>
            <div class="notice" id="notice" role="status" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </section>
    <aside class="right-panel panel" id="inspector"></aside>
  </main>
  <footer class="footer"><span>Quasi-steady-state PMS and protection model · for training, not for operational use</span><span><kbd>[</kbd> controls <kbd>E</kbd> widen <kbd>]</kbd> inspector <kbd>Esc</kbd> close</span></footer>
  <div id="assemblyModal" class="assembly-modal hidden" role="dialog" aria-modal="true" aria-labelledby="assemblyModalTitle">
    <div class="assembly-modal-backdrop" id="assemblyBackdrop"></div>
    <div class="assembly-modal-dialog">
      <div class="assembly-modal-header">
        <div class="assembly-modal-title-group">
          <div class="assembly-modal-badge" id="assemblyModalBadge">Assembly</div>
          <h2 id="assemblyModalTitle" class="assembly-modal-title"></h2>
          <p id="assemblyModalSubtitle" class="assembly-modal-subtitle"></p>
        </div>
        <div class="assembly-modal-actions">
          <a id="assemblyNewTab" href="#" target="_blank" rel="noopener noreferrer" class="assembly-tab-link" title="Open in a new tab">
            ${icon('external')}New tab
          </a>
          <button id="assemblyClose" type="button" class="assembly-close-btn" aria-label="Close">
            ${icon('close')}Close
          </button>
        </div>
      </div>
      <div class="assembly-modal-body">
        <iframe id="assemblyFrame" src="about:blank" title="Equipment assembly viewer" allow="fullscreen"></iframe>
      </div>
    </div>
  </div>
  <div id="lotoModal" class="loto-modal hidden" role="dialog" aria-modal="true" aria-labelledby="lotoModalTitle">
    <div class="loto-modal-backdrop" id="lotoModalBackdrop"></div>
    <div class="loto-modal-dialog">
      <div class="loto-modal-header">
        <div class="loto-modal-title-group">
          <div class="loto-modal-badge" id="lotoModalBadge">6.6 kV permit to work</div>
          <h2 id="lotoModalTitle" class="loto-modal-title">Lockout / tagout</h2>
          <p id="lotoModalSubtitle" class="loto-modal-subtitle"></p>
        </div>
        <div class="loto-modal-actions">
          <button id="lotoModalClose" type="button" class="loto-modal-close-btn" aria-label="Close">
            ${icon('close')}Close
          </button>
        </div>
      </div>
      <div class="loto-modal-body" id="lotoModalBody"></div>
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

function renderScenarios(){const el=document.querySelector('#scenarios')!;el.innerHTML=scenarios.map(s=>`<button type="button" class="scenario ${activeScenario===s.id?'active':''}" data-scenario="${s.id}"><span class="scenario-number">${s.title.slice(0,2)}</span><span>${s.title.slice(5)}</span></button>`).join('');el.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.onclick=()=>scenario(b.dataset.scenario!));}
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
          <button type="button" class="gov-btn" data-gov-id="${id}" data-gov-delta="0.15" title="Increase Governor Speed Reference">Gov +</button>
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
            <text x="24" y="26" class="sync-dir-label">Slow</text>
            <text x="96" y="26" text-anchor="end" class="sync-dir-label">Fast</text>
            <text x="60" y="100" text-anchor="middle" class="sync-twelve-label">In phase at 12</text>
            <g id="syncNeedleGroup" transform="rotate(${s.phaseAngleDeg.toFixed(1)} 60 60)">
              <line x1="60" y1="66" x2="60" y2="15" class="sync-needle"/>
              <polygon points="60,10 56,20 64,20" class="sync-needle-tip"/>
            </g>
            <circle cx="60" cy="60" r="6" id="syncCenterDot" class="sync-center-dot ${s.inSyncWindow?'ok':''}"/>
          </svg>
        </div>
        <div class="sync-readouts">
          <div class="sync-stat-row"><span>Bus</span><strong id="syncBusVal">${s.busFreqHz.toFixed(2)} Hz · ${s.busVoltageKv.toFixed(2)} kV</strong></div>
          <div class="sync-stat-row"><span>${byId[s.targetGenId].short}</span><strong id="syncGenVal">${s.genFreqHz.toFixed(2)} Hz · ${s.genVoltageKv.toFixed(2)} kV</strong></div>
          <div class="sync-stat-row"><span>Slip / Δθ</span><strong id="syncSlipVal">${s.slipHz>=0?'+':''}${s.slipHz.toFixed(2)} Hz · ${Math.round(s.phaseAngleDeg)}°</strong></div>
          <div class="sync-badge ${s.alreadyClosed?'online':s.inSyncWindow?'ok':'wait'}" id="syncStatusBadge">
            ${s.alreadyClosed?'PARALLELED ON BUS':s.inSyncWindow?'ANSI 25 PERMISSIVE OK':'OUT OF SYNC WINDOW'}
          </div>
        </div>
      </div>
      <div class="sync-actions">
        <button type="button" class="button button-primary sync-auto-btn" id="btnAutoSync">${s.autoSyncActive?'Synchronizing…':'Auto-sync and close'}</button>
        <button type="button" class="mini-toggle ${simEngine.checkSyncInterlock?'closed':''}" id="btnCheckSyncToggle" title="Toggle ANSI 25 Check-Synchronizer Interlock">ANSI 25 ${simEngine.checkSyncInterlock?'ON':'BYPASS'}</button>
      </div>
    </div>`;

  // Propulsion & Heavy Load Throttle
  const pct=Math.round(simEngine.propulsionThrottle*100);
  const propKw=Math.round(LOAD_SPECS.drive.ratedKw*simEngine.propulsionThrottle);
  document.querySelector('#throttleSection')!.innerHTML=`
    <div class="throttle-card">
      <div class="throttle-header">
        <span>Telegraph order</span>
        <strong id="propThrottleVal">${pct}% · ${propKw} kW</strong>
      </div>
      <input type="range" id="propThrottleSlider" min="0" max="1.15" step="0.01" value="${simEngine.propulsionThrottle}" aria-label="Propulsion Load Throttle">
      <div class="throttle-presets">
        <button type="button" class="preset-btn" data-throttle="0.25">25% harbour</button>
        <button type="button" class="preset-btn" data-throttle="0.55">55% cruise</button>
        <button type="button" class="preset-btn" data-throttle="0.85">85% sea</button>
        <button type="button" class="preset-btn" data-throttle="1.08">108% flank</button>
      </div>
    </div>`;

  // PMS, HRE & Fault Switchboard
  const earthing=simEngine.hvEarthing;
  const ansi67nMsg=earthing.ansi67nActive?`ANSI 67N Directional Earth Fault Alarm · ${earthing.faultedPhase||'Phase A-Earth'} (V_N = ${earthing.neutralDisplacementV} V, I_ef = ${earthing.groundFaultCurrentAmps.toFixed(1)} A)`:'ANSI 67N Directional Earth Fault Relay: Normal';
  document.querySelector('#pmsSection')!.innerHTML=`
    <div class="pms-card">
      <div class="pms-toggles-row">
        <button type="button" class="mini-toggle ${simEngine.pmsAutoStandby?'closed':''}" id="btnPmsStandby">Auto standby &gt;82%</button>
        <button type="button" class="mini-toggle ${simEngine.pmsAutoLoadShed?'closed':''}" id="btnPmsLoadShed">Preferential trip &gt;94%</button>
      </div>
      <div class="pms-action-grid">
        <button type="button" class="button button-danger" id="btnTriggerBlackout">Simulate blackout</button>
        <button type="button" class="button button-primary" id="btnStartRecovery">Run SOLAS recovery</button>
      </div>
      <div class="pms-recovery-banner ${simEngine.recoveryStage?'':'hidden'}" id="pmsRecoveryBanner">${simEngine.recoveryStage||''}</div>
      <div class="earthing-arch-box">
        <div class="earthing-arch-label">6.6 kV busbar earthing</div>
        <div class="earthing-arch-toggle" role="group" aria-label="Busbar earthing architecture">
          <button type="button" class="earthing-arch-btn ${simEngine.earthingArchitecture==='IT'?'active':''}" data-earthing-arch="IT">Unearthed (IT)</button>
          <button type="button" class="earthing-arch-btn ${simEngine.earthingArchitecture==='HRE'?'active':''}" data-earthing-arch="HRE">High-resistance earthed (HRE)</button>
        </div>
        <div class="hre-telemetry-grid" id="hreTelemetryBox">
          <div><span>Neutral displacement V<sub>N</sub></span><strong id="hreVnVal">${earthing.neutralDisplacementV.toLocaleString()} V</strong></div>
          <div><span>Earth-fault current I<sub>ef</sub></span><strong id="hreIefVal">${earthing.groundFaultCurrentAmps.toFixed(2)} A ${simEngine.earthingArchitecture==='HRE'?'(381 Ω NER)':'(Capacitive)'}</strong></div>
        </div>
        <div class="ansi67n-alarm-badge ${earthing.ansi67nActive?'active':'hidden'}" id="ansi67nBadge">
          ${ansi67nMsg}
        </div>
      </div>
      <div class="galley-shunt-box">
        <div class="galley-shunt-header">
          <span class="galley-shunt-title">Galley remote shunt trip</span>
          <span class="galley-shunt-pill ${simEngine.galleyShuntTripped?'tripped':'armed'}">${simEngine.galleyShuntTripped?'TRIPPED':'ARMED'}</span>
        </div>
        <p class="micro-copy">
          The trip station outside the galley de-energizes the 440 V galley board and its ventilation in a galley fire (SOLAS II-2).
        </p>
        <div class="galley-shunt-actions">
          <button type="button" class="button button-danger" id="btnGalleyShuntTrip">Trip</button>
          <button type="button" class="button button-secondary" id="btnGalleyShuntReset" ${simEngine.galleyShuntTripped?'':'disabled'}>Reset</button>
        </div>
      </div>
      <div class="pms-fault-row">
        <button type="button" class="mini-toggle ${simEngine.earthFaultHv?'fault-active':''}" id="btnFaultHv">6.6 kV earth fault</button>
        <button type="button" class="mini-toggle ${simEngine.earthFaultLv?'fault-active':''}" id="btnFaultLv">440 V earth fault</button>
      </div>
      <div class="alarm-log-wrap">
        <div class="alarm-log-header">
          <span>Alarm log</span>
          <button type="button" class="ack-btn" id="btnAckAlarms">Acknowledge all</button>
        </div>
        <div class="alarm-log-list" id="alarmLogList"></div>
      </div>
    </div>`;

  document.querySelector('#tieControl')!.innerHTML=`
    <div class="tie-control-group">
      <div class="tie-row">
        <button class="item-name" data-select="tie" type="button">6.6 kV bus tie</button>
        <button class="switch ${state.closed.tie?'on':''}" id="tieSwitch" type="button" role="switch" aria-checked="${state.closed.tie}" aria-label="6.6 kV Bus tie breaker"><span></span></button>
        <strong>${state.closed.tie?'CLOSED':'OPEN'}</strong>
      </div>
      <div class="tie-row">
        <button class="item-name" data-select="lvTie" type="button">440 V bus tie</button>
        <button class="switch ${state.closed.lvTie?'on':''}" id="lvTieSwitch" type="button" role="switch" aria-checked="${state.closed.lvTie}" aria-label="440 V Bus tie breaker"><span></span></button>
        <strong>${state.closed.lvTie?'CLOSED':'OPEN'}</strong>
      </div>
      <div class="tie-row">
        <button class="item-name" data-select="consumerTie" type="button">220 V bus tie</button>
        <button class="switch ${state.closed.consumerTie?'on':''}" id="consumerTieSwitch" type="button" role="switch" aria-checked="${state.closed.consumerTie}" aria-label="220 V Bus tie breaker"><span></span></button>
        <strong>${state.closed.consumerTie?'CLOSED':'OPEN'}</strong>
      </div>
    </div>`;

  const groups = [
    [
      `${VOLTAGES.hv} feeders`,
      'propFeed', 'reeferAFeed', 'txAFeed', 'txBFeed', 'reeferBFeed', 'bowFeed'
    ],
    [
      `${VOLTAGES.lv} bus A (port)`,
      'galley440Feed', 'fire1Feed', 'cooling1Feed', 'craneFeed', 'conAAcb', 'esbTieFeed'
    ],
    [
      `${VOLTAGES.lv} bus B (starboard)`,
      'conBAcb', 'fire2Feed', 'cooling2Feed', 'ballastFeed', 'bilgeFeed'
    ],
    [
      `${VOLTAGES.consumer} accommodation and bridge`,
      'lightAFeed', 'galleySmallFeed', 'navFeed'
    ],
    [
      '440 V emergency switchboard',
      'eSteerFeed', 'eFireFeed', 'eLightFeed', 'eRadioFeed', 'navEmFeed'
    ]
  ];
  document.querySelector('#feeders')!.innerHTML=groups.map(([title,...ids])=>{const closedCount=ids.filter(id=>state.closed[id]).length;return `<div class="feeder-group"><div class="feeder-label"><span>${title}</span><span class="feeder-count">${closedCount}/${ids.length} closed</span></div>${ids.map(id=>{const c=edgeById[id];const spec=Object.values(LOAD_SPECS).find(ls=>ls.breakerId===id);return `<div class="feeder-row"><button class="feeder-name" data-select="${id}" type="button">${c.name.replace(' feeder breaker','').replace(' breaker','')}${spec?` <small class="feeder-kw-tag">${spec.ratedKw} kW</small>`:''}</button><button class="feeder-state ${state.closed[id]?'closed':''}" data-breaker="${id}" type="button" aria-label="${state.closed[id]?'Open':'Close'} ${c.name}">${state.closed[id]?'CLOSED':'OPEN'}</button></div>`;}).join('')}</div>`;}).join('');
  document.querySelector('#emergencyControls')!.innerHTML=sourceRow('eg')+`
    <div class="ups-test-box">
      <div class="ups-test-info">
        <span class="eyebrow">SOLAS II-1/43 TRANSITIONAL POWER</span>
        <strong>24 V DC UPS: ${simEngine.upsBatterySoc.toFixed(1)}% (${simEngine.upsMode === 'DISCHARGING_BATTERY' ? '0ms ACTIVE' : 'FLOAT'})</strong>
      </div>
      <button type="button" class="button button-secondary" id="btnTestUpsSwitchover">Test UPS 0ms transfer</button>
    </div>
    <p class="micro-copy">Starts and closes onto the 440 V emergency bus automatically if the main switchboard blacks out. Vital bridge electronics & GMDSS bridged by 24V UPS battery (0 ms break).</p>`;

  document.querySelector<HTMLButtonElement>('#btnTestUpsSwitchover')?.addEventListener('click',()=>{
    setMessage(simEngine.testUpsSwitchover(state));
    renderControls();
    renderInspector();
  });

  document.querySelector('#tieSwitch')!.addEventListener('click',()=>toggleBreaker('tie'));
  document.querySelector('#lvTieSwitch')?.addEventListener('click',()=>toggleBreaker('lvTie'));
  document.querySelector('#consumerTieSwitch')?.addEventListener('click',()=>toggleBreaker('consumerTie'));
  document.querySelector<HTMLButtonElement>('#btnGalleyShuntTrip')?.addEventListener('click',()=>{
    setMessage(simEngine.tripGalleyShunt(state));
    refresh();
  });
  document.querySelector<HTMLButtonElement>('#btnGalleyShuntReset')?.addEventListener('click',()=>{
    setMessage(simEngine.resetGalleyShunt());
    refresh();
  });
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
  // --- 6.6 kV Generation Sources (Straight vertical lines down to 6.6 kV bus) ---
  gb1: {
    points: [[110, 134], [110, 180]],
    breaker: { pos: [110, 155], orientation: 'v' }
  },
  gb2: {
    points: [[240, 134], [240, 180]],
    breaker: { pos: [240, 155], orientation: 'v' }
  },
  shoreBreaker: {
    points: [[380, 134], [380, 180]],
    breaker: { pos: [380, 155], orientation: 'v' }
  },
  gb3: {
    points: [[1190, 134], [1190, 180]],
    breaker: { pos: [1190, 155], orientation: 'v' }
  },
  gb4: {
    points: [[1320, 134], [1320, 180]],
    breaker: { pos: [1320, 155], orientation: 'v' }
  },

  // --- 6.6 kV Bus Tie ---
  tie: {
    points: [[710, 180], [790, 180]],
    breaker: { pos: [750, 180], orientation: 'h' }
  },

  // --- 6.6 kV Feeders & Heavy Machinery ---
  propFeed: {
    points: [[480, 180], [480, 251]],
    breaker: { pos: [480, 215], orientation: 'v' }
  },
  driveMotor: {
    points: [[480, 299], [480, 324]]
  },
  shaft: {
    points: [[480, 356], [480, 383]]
  },

  // Reefer Distribution Transformers A & B (6.6 kV / 440 V, 1.5 MVA)
  reeferAFeed: {
    points: [[580, 180], [580, 246]],
    breaker: { pos: [580, 215], orientation: 'v' }
  },
  txReeferAOut: {
    points: [[580, 274], [580, 326]]
  },
  reeferPlugA: {
    points: [[580, 354], [580, 381]]
  },

  // Main Step-Down Transformers A & B (6.6 kV / 440 V, 2.5 MVA)
  txAFeed: {
    points: [[680, 180], [680, 246]],
    breaker: { pos: [680, 215], orientation: 'v' }
  },
  txAOut: {
    points: [[680, 274], [680, 440]],
    breaker: { pos: [680, 350], orientation: 'v' }
  },

  txBFeed: {
    points: [[820, 180], [820, 246]],
    breaker: { pos: [820, 215], orientation: 'v' }
  },
  txBOut: {
    points: [[820, 274], [820, 440]],
    breaker: { pos: [820, 350], orientation: 'v' }
  },

  reeferBFeed: {
    points: [[920, 180], [920, 246]],
    breaker: { pos: [920, 215], orientation: 'v' }
  },
  txReeferBOut: {
    points: [[920, 274], [920, 326]]
  },
  reeferPlugB: {
    points: [[920, 354], [920, 381]]
  },

  bowFeed: {
    points: [[1250, 180], [1250, 251]],
    breaker: { pos: [1250, 215], orientation: 'v' }
  },

  // --- 440 V Bus Tie ---
  lvTie: {
    points: [[710, 440], [790, 440]],
    breaker: { pos: [750, 440], orientation: 'h' }
  },

  // --- 440 V Bus A Feeders & Control TX A ---
  galley440Feed: {
    points: [[110, 440], [110, 514]],
    breaker: { pos: [110, 478], orientation: 'v' }
  },
  fire1Feed: {
    points: [[230, 440], [230, 514]],
    breaker: { pos: [230, 478], orientation: 'v' }
  },
  cooling1Feed: {
    points: [[350, 440], [350, 514]],
    breaker: { pos: [350, 478], orientation: 'v' }
  },
  craneFeed: {
    points: [[470, 440], [470, 514]],
    breaker: { pos: [470, 478], orientation: 'v' }
  },
  conAAcb: {
    points: [[600, 440], [600, 546]],
    breaker: { pos: [600, 492], orientation: 'v' }
  },
  txConAOut: {
    points: [[600, 574], [600, 650]]
  },
  esbTieFeed: {
    points: [[80, 440], [80, 840]],
    breaker: { pos: [80, 640], orientation: 'v' }
  },

  // --- 440 V Bus B Feeders & Control TX B ---
  conBAcb: {
    points: [[900, 440], [900, 546]],
    breaker: { pos: [900, 492], orientation: 'v' }
  },
  txConBOut: {
    points: [[900, 574], [900, 650]]
  },
  fire2Feed: {
    points: [[1030, 440], [1030, 514]],
    breaker: { pos: [1030, 478], orientation: 'v' }
  },
  cooling2Feed: {
    points: [[1150, 440], [1150, 514]],
    breaker: { pos: [1150, 478], orientation: 'v' }
  },
  ballastFeed: {
    points: [[1270, 440], [1270, 514]],
    breaker: { pos: [1270, 478], orientation: 'v' }
  },
  bilgeFeed: {
    points: [[1390, 440], [1390, 514]],
    breaker: { pos: [1390, 478], orientation: 'v' }
  },

  // --- 220 V Bus Tie & Feeders ---
  consumerTie: {
    points: [[710, 650], [790, 650]],
    breaker: { pos: [750, 650], orientation: 'h' }
  },
  lightAFeed: {
    points: [[520, 650], [520, 706]],
    breaker: { pos: [520, 678], orientation: 'v' }
  },
  galleySmallFeed: {
    points: [[650, 650], [650, 706]],
    breaker: { pos: [650, 678], orientation: 'v' }
  },
  navFeed: {
    points: [[900, 650], [900, 706]],
    breaker: { pos: [900, 678], orientation: 'v' }
  },

  // --- 440 V SOLAS Emergency Switchboard (ESB) Connections ---
  egBreaker: {
    points: [[150, 804], [150, 840]],
    breaker: { pos: [150, 818], orientation: 'v' }
  },
  eSteerFeed: {
    points: [[260, 840], [260, 901]],
    breaker: { pos: [260, 870], orientation: 'v' }
  },
  eFireFeed: {
    points: [[400, 840], [400, 899]],
    breaker: { pos: [400, 870], orientation: 'v' }
  },
  eLightFeed: {
    points: [[540, 840], [540, 901]],
    breaker: { pos: [540, 870], orientation: 'v' }
  },
  eRadioFeed: {
    points: [[680, 840], [680, 901]],
    breaker: { pos: [680, 870], orientation: 'v' }
  },
  navEmFeed: {
    points: [[900, 840], [900, 736]],
    breaker: { pos: [900, 788], orientation: 'v' }
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

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (ctm) {
    try {
      return pt.matrixTransform(ctm.inverse());
    } catch (_) {}
  }
  return { x: SVG_BASE_WIDTH / 2, y: SVG_BASE_HEIGHT / 2 };
}

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
  const oldZoom = schematicState.zoom;
  const newZoom = Math.max(0.4, Math.min(5.0, oldZoom * factor));
  if (Math.abs(newZoom - oldZoom) < 0.001) return;
  
  const oldW = SVG_BASE_WIDTH / oldZoom;
  const oldH = SVG_BASE_HEIGHT / oldZoom;
  const newW = SVG_BASE_WIDTH / newZoom;
  const newH = SVG_BASE_HEIGHT / newZoom;
  
  const cursorSvgX = schematicState.panX + 0.5 * oldW;
  const cursorSvgY = schematicState.panY + 0.5 * oldH;
  
  schematicState.panX = cursorSvgX - 0.5 * newW;
  schematicState.panY = cursorSvgY - 0.5 * newH;
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

  const activePointers = new Map<number, { x: number; y: number }>();
  let initialPinchDist = 0;
  let initialPinchZoom = 1.0;

  host.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = schematicState.panX;
      startPanY = schematicState.panY;
      hasMoved = false;
      try { host.setPointerCapture(e.pointerId); } catch (_) {}
    } else if (activePointers.size === 2) {
      isDown = false;
      const pts = Array.from(activePointers.values());
      initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom = schematicState.zoom;
    }
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (initialPinchDist > 5) {
        const factor = dist / initialPinchDist;
        const newZoom = Math.max(0.4, Math.min(5.0, initialPinchZoom * factor));
        schematicState.zoom = newZoom;
        updateSchematicViewBox();
      }
      return;
    }

    if (!isDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!hasMoved && Math.hypot(dx, dy) > 4) {
      hasMoved = true;
      host.classList.add('is-panning');
    }
    if (hasMoved) {
      const svg = host.querySelector<SVGSVGElement>('svg');
      const rect = svg ? svg.getBoundingClientRect() : host.getBoundingClientRect();
      const scaleX = (SVG_BASE_WIDTH / schematicState.zoom) / (rect.width || host.clientWidth || 1);
      const scaleY = (SVG_BASE_HEIGHT / schematicState.zoom) / (rect.height || host.clientHeight || 1);
      schematicState.panX = startPanX - dx * scaleX;
      schematicState.panY = startPanY - dy * scaleY;
      updateSchematicViewBox();
    }
  });

  const onPointerEnd = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
      if (isDown) {
        isDown = false;
        host.classList.remove('is-panning');
        try { host.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    } else if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0];
      isDown = true;
      startX = remaining.x;
      startY = remaining.y;
      startPanX = schematicState.panX;
      startPanY = schematicState.panY;
      hasMoved = false;
    }
  };

  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

  host.addEventListener('click', (e: MouseEvent) => {
    if (hasMoved) {
      e.stopPropagation();
      e.preventDefault();
      hasMoved = false;
    }
  }, true);

  host.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const svg = host.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const oldZoom = schematicState.zoom;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.4, Math.min(5.0, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    const focal = clientToSvgPoint(svg, e.clientX, e.clientY);
    const oldW = SVG_BASE_WIDTH / oldZoom;
    const oldH = SVG_BASE_HEIGHT / oldZoom;
    const newW = SVG_BASE_WIDTH / newZoom;
    const newH = SVG_BASE_HEIGHT / newZoom;

    const fracX = (focal.x - schematicState.panX) / oldW;
    const fracY = (focal.y - schematicState.panY) / oldH;

    schematicState.panX = focal.x - fracX * newW;
    schematicState.panY = focal.y - fracY * newH;
    schematicState.zoom = newZoom;
    updateSchematicViewBox();
  }, { passive: false });

  host.addEventListener('dblclick', (e: MouseEvent) => {
    if ((e.target as HTMLElement)?.closest('[data-select], button')) return;
    zoomSchematic(1.5);
  });

  document.querySelector('#schematicFit')?.addEventListener('click', fitSchematicToScreen);
  document.querySelector('#schematicZoomIn')?.addEventListener('click', () => zoomSchematic(1.25));
  document.querySelector('#schematicZoomOut')?.addEventListener('click', () => zoomSchematic(0.8));
  document.querySelector('#schematicReset')?.addEventListener('click', fitSchematicToScreen);

  document.querySelector('#schematicLegendHeader')?.addEventListener('click', () => {
    document.querySelector('#schematicLegendCard')?.classList.toggle('collapsed');
  });
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
  { id: 'busA', x1: 80, x2: 710, y: 180, label: '6.6 kV MAIN SWITCHBOARD - BUS A (PORT)', voltageType: 'hv' },
  { id: 'busB', x1: 790, x2: 1420, y: 180, label: '6.6 kV MAIN SWITCHBOARD - BUS B (STARBOARD)', voltageType: 'hv' },
  { id: 'lvBusA', x1: 80, x2: 710, y: 440, label: '440 V MAIN SWITCHBOARD - BUS A (PORT)', voltageType: 'lv' },
  { id: 'lvBusB', x1: 790, x2: 1420, y: 440, label: '440 V MAIN SWITCHBOARD - BUS B (STARBOARD)', voltageType: 'lv' },
  { id: 'consumerA', x1: 480, x2: 710, y: 650, label: '220 V SUB-BOARD - BUS A (PORT)', voltageType: 'consumer' },
  { id: 'consumerB', x1: 790, x2: 1020, y: 650, label: '220 V SUB-BOARD - BUS B (STARBOARD)', voltageType: 'consumer' },
  { id: 'eBus', x1: 80, x2: 920, y: 840, label: '440 V EMERGENCY SWITCHBOARD (ESB)', voltageType: 'emergency' }
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
  { id: 'txB', name: 'TX B', ratio: '(6.6kV/440V)', rating: '2.5 MVA', labelSide: 'right' },
  { id: 'txReeferA', name: 'TX REEFER A', ratio: '(6.6kV/440V)', rating: '1.5 MVA', labelSide: 'left' },
  { id: 'txReeferB', name: 'TX REEFER B', ratio: '(6.6kV/440V)', rating: '1.5 MVA', labelSide: 'right' },
  { id: 'txConA', name: 'TX CON A', ratio: '(440V/220V)', rating: '500 kVA', labelSide: 'left' },
  { id: 'txConB', name: 'TX CON B', ratio: '(440V/220V)', rating: '500 kVA', labelSide: 'right' }
];

const BREAKER_LABELS: Record<string, { label: string; offset: [number, number]; anchor: 'start' | 'end' | 'middle' }> = {
  tie: { label: '6.6kV BUS TIE', offset: [0, -16], anchor: 'middle' },
  lvTie: { label: '440V BUS TIE', offset: [0, -16], anchor: 'middle' },
  consumerTie: { label: '220V BUS TIE', offset: [0, -16], anchor: 'middle' },
  txAFeed: { label: 'TX A VCB', offset: [-14, 4], anchor: 'end' },
  txAOut: { label: 'TX A 440V ACB', offset: [16, 4], anchor: 'start' },
  txBFeed: { label: 'TX B VCB', offset: [16, 4], anchor: 'start' },
  txBOut: { label: 'TX B 440V ACB', offset: [16, 4], anchor: 'start' },
  reeferAFeed: { label: 'REEFER A VCB', offset: [-14, 4], anchor: 'end' },
  reeferBFeed: { label: 'REEFER B VCB', offset: [16, 4], anchor: 'start' },
  propFeed: { label: 'DRIVE 1 VCB', offset: [16, 4], anchor: 'start' },
  bowFeed: { label: 'THRUSTER VCB', offset: [16, 4], anchor: 'start' },
  galley440Feed: { label: 'GALLEY 440V ACB', offset: [-14, 4], anchor: 'end' },
  conAAcb: { label: 'CON A ACB', offset: [-14, 4], anchor: 'end' },
  conBAcb: { label: 'CON B ACB', offset: [16, 4], anchor: 'start' },
  esbTieFeed: { label: 'ESB TIE ACB (Norm. Closed)', offset: [16, 4], anchor: 'start' },
  egBreaker: { label: 'EDG CB', offset: [16, 4], anchor: 'start' },
  navEmFeed: { label: 'NAV ABT (ESB FEED)', offset: [16, 4], anchor: 'start' }
};

function connectionVoltageType(c: Connection): 'hv' | 'lv' | 'consumer' | 'emergency' {
  if (['esbTieFeed', 'egBreaker', 'eSteerFeed', 'eFireFeed', 'eLightFeed', 'eRadioFeed', 'navEmFeed'].includes(c.id)) {
    return 'emergency';
  }
  if (['txConAOut', 'txConBOut', 'consumerTie', 'lightAFeed', 'galleySmallFeed', 'navFeed'].includes(c.id)) {
    return 'consumer';
  }
  if (['txAOut', 'txBOut', 'lvTie', 'galley440Feed', 'fire1Feed', 'cooling1Feed', 'craneFeed', 'conAAcb', 'conBAcb', 'fire2Feed', 'cooling2Feed', 'ballastFeed', 'bilgeFeed'].includes(c.id)) {
    return 'lv';
  }
  return 'hv';
}

function renderSchematic(){
  const host=document.querySelector('#schematicHost')!;

  // 1. Compartment / Fire Bulkhead Enclosures (Rev A Architecture)
  const compartmentsSvg = `
    <g class="compartment-boundaries">
      <rect x="50" y="145" width="1400" height="495" class="boundary-box a60" rx="8" />
      <text x="750" y="162" class="boundary-label a60" text-anchor="middle">[A-60 FIRE BULKHEAD] ENGINE CONTROL ROOM &amp; MAIN SWITCHBOARD ENCLOSURE</text>

      <path d="M 750 145 L 750 88" class="arc-duct-line" />
      <rect x="715" y="68" width="70" height="20" class="arc-cowl-box" rx="3" />
      <text x="750" y="82" class="arc-cowl-label" text-anchor="middle">[ARC DUCT] → OPEN AIR</text>

      <rect x="1185" y="215" width="135" height="150" class="boundary-box watertight" rx="6" />
      <text x="1252" y="232" class="boundary-label watertight" text-anchor="middle">[WATERTIGHT] BOW THRUSTER</text>

      <rect x="50" y="745" width="780" height="200" class="boundary-box solas-eg" rx="8" />
      <text x="440" y="762" class="boundary-label solas-eg" text-anchor="middle">EMERGENCY GENERATOR ROOM (ABOVE BULKHEAD DECK · SOLAS II-1)</text>
    </g>
  `;

  // 2. Busbars (Bold horizontal lines matching Rev A standard)
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

  // 3. Generators (Circular symbols with sine waves)
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

  // 4. Shore Connection (Purple header & symbol)
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

  // 5. Transformers (Dual interlocking circles with ratings)
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

  // 6. Equipment Nodes: Motor (M) circles for Pumps/Cranes, Boxes for Boards, Shunt Trip Station for Galley
  const skipEquipmentIds = new Set([
    ...BUSBARS.map(b => b.id),
    ...GENERATOR_IDS,
    'shore',
    ...TRANSFORMERS.map(t => t.id)
  ]);

  let shuntStationSvg = '';

  const equipmentSvg = equipment.filter(e => !skipEquipmentIds.has(e.id)).map(e => {
    const isLive = live.has(e.id);
    const isSel = selected === e.id;
    const isPumpOrCrane = e.kind === 'pump' || e.id === 'crane';

    // Pumps & Cranes: Circular motor symbol (M) with ~ wave per standard single-line CAD
    if (isPumpOrCrane) {
      const r = 16;
      const vType = e.id === 'eFire' ? 'emergency' : 'lv';
      return `
        <g class="diagram-node motor-symbol ${vType} ${isLive ? 'live' : 'dead'} ${isSel ? 'selected' : ''}" data-select="${e.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(e.name)}">
          <circle cx="${e.sx}" cy="${e.sy}" r="${r}" />
          <text class="motor-symbol-m" x="${e.sx}" y="${e.sy + 2}" text-anchor="middle">M</text>
          <text class="motor-symbol-tilde" x="${e.sx}" y="${e.sy + 8}" text-anchor="middle">~</text>
          <text class="node-single-label" x="${e.sx}" y="${e.sy + 28}" text-anchor="middle">${svgEsc(e.short)}</text>
          <title>${svgEsc(e.name)} · ${isLive ? 'POWERED' : 'NOT POWERED'}</title>
        </g>
      `;
    }

    // 440 V Galley Primary Board: Include adjacent Emergency Remote Shunt Trip Pushbutton
    if (e.id === 'galley440') {
      shuntStationSvg = `
        <g class="sld-shunt-station ${simEngine.galleyShuntTripped ? 'tripped' : 'armed'}" id="sldShuntTripBtn" data-select="galley440Feed" tabindex="0" role="button" aria-label="Emergency Shunt Trip Pushbutton (SOLAS II-2 Reg 9.2)">
          <rect x="156" y="508" width="46" height="44" rx="5" class="shunt-station-housing" />
          <circle cx="179" cy="526" r="12" class="shunt-mushroom-btn" />
          <circle cx="179" cy="526" r="7" class="shunt-mushroom-center" />
          <text x="179" y="546" text-anchor="middle" class="shunt-station-label">${simEngine.galleyShuntTripped ? 'RESET' : 'TRIP'}</text>
          <title>440 V Galley Emergency Remote Shunt Trip (SOLAS II-2 Reg 9.2 / BV NR467) · Click to ${simEngine.galleyShuntTripped ? 'Reset' : 'Trip'}</title>
        </g>
      `;
    }

    const isDriveOrBow = e.id === 'drive' || e.id === 'bow';
    const isMotorOrProp = e.id === 'motor' || e.id === 'prop';
    const w = isDriveOrBow ? 116 : isMotorOrProp ? 84 : 88;
    const h = isDriveOrBow ? 48 : isMotorOrProp ? 24 : 32;
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

  // 7. Power Paths and Breakers (Single clean line per equipment, color-coded by voltage)
  const paths = connections.map(c => {
    const a = byId[c.from], b = byId[c.to];
    const status = connectionState(c, state, live);
    const route = getRoute(c, a, b);
    const d = 'M ' + route.points.map(p => `${p[0]} ${p[1]}`).join(' L ');
    const vType = connectionVoltageType(c);
    const isDashed = vType === 'emergency';

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
        <g class="breaker-symbol ${status} ${vType} ${isClosed ? 'closed' : 'open'} ${selected === c.id ? 'selected' : ''}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}">
          <rect x="${bx - 10}" y="${by - 10}" width="20" height="20" rx="3" />
          ${symbolContent}
          ${labelSvg}
          <title>${svgEsc(c.name)} · ${isClosed ? 'CLOSED' : 'OPEN'} · ${status}</title>
        </g>
      `;
    }

    return `
      <g class="diagram-path ${status} ${vType} ${isDashed ? 'dashed-tie' : ''} ${selected === c.id ? 'selected' : ''}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}">
        <path class="power-line-base" d="${d}" />
        ${status === 'live' && !isDashed ? `<path class="power-flow-anim" d="${d}" />` : ''}
        <title>${svgEsc(c.name)} · ${status}</title>
      </g>
      ${breaker}
    `;
  }).join('');

  // 8. Header
  const headerSvg = `
    <g class="diagram-header">
      <text class="diagram-main-title" x="750" y="44" text-anchor="middle">Main power distribution — single-line diagram</text>
      <text class="diagram-subtitle" x="750" y="66" text-anchor="middle">Split 6.6 kV / 440 V / 220 V switchboards with SOLAS emergency supply</text>
    </g>
  `;

  const vbW = SVG_BASE_WIDTH / schematicState.zoom;
  const vbH = SVG_BASE_HEIGHT / schematicState.zoom;
  host.innerHTML = `
    <div class="diagram-wrap">
      <svg viewBox="${schematicState.panX} ${schematicState.panY} ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dual-Bus Redundant Marine Power System Single Line Diagram">
        <rect width="${SVG_BASE_WIDTH}" height="${SVG_BASE_HEIGHT}" fill="#071220" />
        ${headerSvg}
        ${compartmentsSvg}
        ${paths}
        ${busbarSvg}
        ${txSvg}
        ${genSvg}
        ${shoreSvg}
        ${equipmentSvg}
        ${shuntStationSvg}
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

  // Wire interactive Emergency Shunt Trip Pushbutton on SLD
  host.querySelector('#sldShuntTripBtn')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (simEngine.galleyShuntTripped) {
      setMessage(simEngine.resetGalleyShunt());
    } else {
      setMessage(simEngine.tripGalleyShunt(state));
    }
    refresh();
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
      url: resolveAssemblyUrl('universal_viewer.html?eq=bowThruster'),
      title: 'HI-SEA Marine Bow Thruster — 3D Explodable CAD Assembly',
      subtitle: 'Right-Angle Spiral Bevel Drive · 4-Blade Kaplan Bronze Propeller · Bridge Joystick · Hydrodynamic Flow · Bill of Materials',
      tag: 'HI-SEA CAD ASSEMBLY & SPECS'
    };
  }
  if (model === 'hv-board' || model === 'lv-board' || selectedId === 'busA' || selectedId === 'busB' || selectedId === 'tie') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=eBus'),
      title: 'IEC 60092-302 Marine Main Switchboard & Bus-Tie Assembly',
      subtitle: 'Cubicle 1 Open 115° · Center Withdrawable Bus-Tie ACB · Three-Phase Copper Busbars · IP22 Canopy · Engineering BOM',
      tag: 'IEC 60092-302 CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'prop' || model === 'propeller') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=propeller'),
      title: 'Marine Propeller & Stern Tube — 3D Explodable Assembly',
      subtitle: 'Controllable Pitch / Fixed Pitch Propeller · Stern Tube Bearings · Lip Seals · Intermediate Coupling · Exploded View & BOM',
      tag: 'PROPULSION CAD ASSEMBLY & SPECS'
    };
  }
  if (['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(selectedId) || model === 'transformer') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=transformer'),
      title: 'Marine Distribution Transformer — 3D Explodable CAD Assembly',
      subtitle: '3-Phase Laminated Core · Concentric Primary & Secondary Windings · Class H Nomex Insulation · Porcelain Bushings · Forced Air Cooling',
      tag: 'TRANSFORMER CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'drive' || model === 'drive') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=propulsionDrive'),
      title: 'Marine Propulsion Drive / Converter — 3D Explodable CAD Assembly',
      subtitle: 'Medium-Voltage Frequency Converter · Multi-Pulse Input Stage · Water-Cooled IGBT Inverter Stacks · DC Link Capacitor Bank · Control & Protection Casing',
      tag: 'PROPULSION DRIVE CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'motor' || model === 'motor') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=propulsionMotor'),
      title: 'Marine Electric Propulsion Motor — 3D Explodable CAD Assembly',
      subtitle: '6.6 kV Squirrel-Cage Induction Motor · Low-Loss Laminated Stator & Rotor · Form-Wound Copper Coils · Heavy-Duty Bearings · Bi-Directional Cooling Fan',
      tag: 'PROPULSION MOTOR CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'steering' || selectedId === 'eSteer') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=steeringGear'),
      title: 'Marine Steering Gear — 3D Explodable CAD Assembly',
      subtitle: 'Twin-Ram Electro-Hydraulic Steering Gear · Forged Rudder Stock · Double-Acting Crosshead Tiller · Axial Piston Pump · SOLAS Steering Standard',
      tag: 'STEERING GEAR CAD ASSEMBLY & SPECS'
    };
  }
  if (['reefer', 'reeferA', 'reeferB', 'reeferAFeed', 'reeferBFeed', 'reeferUnitA', 'reeferUnitB'].includes(selectedId) || model === 'reefer') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=reefer'),
      title: 'Reefer Distribution Panel — 3D Explodable CAD Assembly',
      subtitle: 'Marine Container Bay Distribution · 440 V / 60 Hz 3-Phase · 4 × 32 A CEE Sockets · Individual MCCB Protection · Solid Copper Hull Grounding',
      tag: 'REEFER DISTRIBUTION CAD ASSEMBLY & SPECS'
    };
  }
  if (['esb', 'eBus'].includes(selectedId)) {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=eBus'),
      title: '440 V Emergency Switchboard Cubicle & Interlock Panel',
      subtitle: 'SOLAS Emergency Bus Section · Bus-Tie Interlock ACB · Automatic Bus Transfer (ABT) · Generator Incomer',
      tag: 'SOLAS EMERGENCY SWITCHBOARD CAD ASSEMBLY & SPECS'
    };
  }
  if (['eRadio', 'battery'].includes(selectedId)) {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=battery'),
      title: '24 V DC Battery Bank & GMDSS/UPS Charger Cabinet',
      subtitle: 'SOLAS Emergency Radio Battery Bank · Dual Thyristor Float/Boost Rectifier · Acid-Resistant Marine Rack',
      tag: 'BATTERY & CHARGER CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'airCompressor') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=airCompressor'),
      title: 'Main Starting Air Compressor & Air Receiver Skid',
      subtitle: '30 bar Two-Stage Water-Cooled Starting Air Compressor · 30 kW Induction Motor · Vertical Receiver Bottle',
      tag: 'COMPRESSOR SKID CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'ventFan') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=ventFan'),
      title: 'Engine Room Heavy Axial Ventilation Fan & Starter Box',
      subtitle: '45 kW Reversible High-Pressure Axial Fan · Aerofoil Impeller · Star-Delta Starter · Fire Damper Flange',
      tag: 'VENTILATION FAN CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'ballast') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=ballastPump'),
      title: 'Ballast Pump & Oily Water Separator (OWS) Skid',
      subtitle: '110 kW Centrifugal Ballast Pump · IMO MEPC 107(49) 15 ppm Separator · Turbidity Coalescer · Tri-Lobe Bilge Pump',
      tag: 'BALLAST & OWS CAD ASSEMBLY & SPECS'
    };
  }
  if (['galley440', 'galley'].includes(selectedId)) {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=galley440'),
      title: '440 V Galley Primary Board & Emergency Shunt Trip Box',
      subtitle: 'SOLAS Ch. II-2 Galley Power Feeder · Dual Heavy Cooking Ranges · Remote Shunt Trip Pushbutton Box',
      tag: 'GALLEY 440 V CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'shore') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=shore'),
      title: '6.6 kV High-Voltage Shore Connection (HVSC) Box & Cable Reel',
      subtitle: 'IEC/ISO/IEEE 80005-1 Cold Ironing Interface · Motorized Reel · Safety Interlock Earthing Switch · Pilot Wire Pin',
      tag: 'SHORE POWER HVSC CAD ASSEMBLY & SPECS'
    };
  }
  if (selectedId === 'nav') {
    return {
      url: resolveAssemblyUrl('universal_viewer.html?eq=navBridge'),
      title: 'Navigation Bridge COLREG Console & S-Band Radar Suite',
      subtitle: 'SOLAS Bridge NavCom & Wheelhouse Distribution Console · 24 RPM Slotted Waveguide Scanner · Dual Feed',
      tag: 'BRIDGE NAVCOM CAD ASSEMBLY & SPECS'
    };
  }
  if (['cooling', 'cooling1', 'cooling2', 'fire', 'fire1', 'fire2', 'bilge', 'eFire'].includes(selectedId) || model === 'pump') {
    const pumpVariant = (['fire', 'fire1', 'fire2', 'eFire'].includes(selectedId)) ? 'fire' : selectedId === 'bilge' ? 'bilge' : 'cooling';
    return {
      url: resolveAssemblyUrl(`universal_viewer.html?eq=${pumpVariant}Pump`),
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

let lotoModalTarget: string | null = null;

function renderLotoModalContent(targetId: string) {
  const modal = document.querySelector<HTMLElement>('#lotoModal');
  if (!modal || modal.classList.contains('hidden')) return;

  const body = document.querySelector<HTMLElement>('#lotoModalBody');
  const subtitle = document.querySelector<HTMLElement>('#lotoModalSubtitle');
  const badge = document.querySelector<HTMLElement>('#lotoModalBadge');
  if (!body || !subtitle || !badge) return;

  const e = byId[targetId];
  const map = HV_EQUIPMENT_VCB_MAP[targetId];
  if (!map) return;

  const lotoRec = hvLotoManager.getRecord(targetId);
  const vcbIds = map.vcbIds;
  const anyVcbClosed = vcbIds.some(id => !!state.closed[id]);
  const vcbNames = vcbIds.map(id => edgeById[id]?.name || id).join(', ');
  const isIsolated = hvLotoManager.isFullyIsolated(targetId, state.closed);

  subtitle.textContent = `${map.label} (${e?.name || targetId}) · interlocked with ${vcbNames}`;
  badge.textContent = `Permit ${lotoRec.ptwNumber} · ${isIsolated ? 'isolated and earthed, safe to work' : `step ${lotoRec.completedSteps} of 5`}`;

  body.innerHTML = `
    <div class="loto-status-strip">
      <div><span>Feeder VCB (${vcbIds.join('/')})</span><strong class="${anyVcbClosed ? 'is-live' : 'is-safe'}">${anyVcbClosed ? 'CLOSED · LIVE' : 'OPEN / TRIPPED'}</strong></div>
      <div><span>VCB truck</span><strong>${lotoRec.completedSteps >= 2 ? 'TEST / ISOLATED' : 'SERVICE'}</strong></div>
      <div><span>Voltage test</span><strong class="${lotoRec.completedSteps >= 4 ? 'is-safe' : 'is-warn'}">${lotoRec.completedSteps >= 4 ? '0.00 kV · DEAD' : 'NOT PROVEN'}</strong></div>
      <div><span>Circuit main earth</span><strong class="${lotoRec.completedSteps >= 5 ? 'is-safe' : ''}">${lotoRec.completedSteps >= 5 ? 'EARTHED TO HULL' : 'OPEN'}</strong></div>
    </div>

    ${lotoRec.arcFlashViolation ? `
      <div class="arc-flash-violation-badge">
        <span class="arc-flash-badge-icon">${icon('warning')}</span>
        <div>
          <strong>Enclosure not isolated</strong>
          <p>${lotoRec.violationMessage || 'Complete all five LOTO steps before opening or exploding a 6.6 kV enclosure.'}</p>
        </div>
      </div>
    ` : ''}

    <div class="loto-modal-steps-grid">
      ${HV_LOTO_STEPS.map(st => {
        const done = lotoRec.completedSteps >= st.stepNumber;
        const isNext = lotoRec.completedSteps === st.stepNumber - 1;
        return `
          <div class="loto-modal-step-card ${done ? 'done' : isNext ? 'next' : 'locked'}">
            <div class="loto-modal-step-left">
              <span class="loto-modal-step-num">${done ? icon('check') : st.stepNumber}</span>
              <div>
                <h4 class="loto-modal-step-title">${st.shortLabel}</h4>
                <p class="loto-modal-step-desc">${st.detail}</p>
              </div>
            </div>
            <div class="loto-modal-step-action">
              <button type="button" class="loto-step-btn ${done ? 'done' : isNext ? 'primary' : ''}" data-modal-loto-step="${st.stepNumber}" ${done ? 'disabled' : ''}>
                ${done ? 'Completed' : st.actionLabel}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="loto-card-footer">
      <span class="loto-vcb-ref">Interlocked: ${vcbNames}</span>
      <button type="button" class="button button-quiet" id="btnModalResetLoto">Reset permit</button>
    </div>
  `;

  body.querySelectorAll<HTMLButtonElement>('[data-modal-loto-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepNum = parseInt(btn.dataset.modalLotoStep || '0', 10);
      const res = hvLotoManager.executeStep(targetId, stepNum, state.closed);
      if (res.success) {
        document.querySelector('#arcFlashBanner')?.classList.add('hidden');
        simEngine.pushAlarm('INFO', 'HV LOTO', res.message);
      } else {
        simEngine.pushAlarm('WARNING', 'HV LOTO', res.message);
      }
      setMessage(res.message);
      refresh();
      renderLotoModalContent(targetId);
    });
  });

  body.querySelector<HTMLButtonElement>('#btnModalResetLoto')?.addEventListener('click', () => {
    const msg = hvLotoManager.resetEquipmentLoto(targetId);
    document.querySelector('#arcFlashBanner')?.classList.add('hidden');
    const model = modelForSelection();
    if (['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(targetId) || model === 'transformer') transformerAssembly.setExplosionFactor(0);
    if (targetId === 'drive' || model === 'drive') driveAssembly.setExplosionFactor(0);
    if (targetId === 'motor' || model === 'motor') motorAssembly.setExplosionFactor(0);
    if (targetId === 'shore') shorePowerAssembly.setExplosionFactor(0);
    if (exploded.isExploded()) exploded.setExploded(false);
    setMessage(msg);
    refresh();
    renderLotoModalContent(targetId);
  });
}

function openLotoModal(targetId: string) {
  lotoModalTarget = targetId;
  const modal = document.querySelector<HTMLElement>('#lotoModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('has-loto-modal');
    renderLotoModalContent(targetId);
  }
}

function closeLotoModal() {
  const modal = document.querySelector<HTMLElement>('#lotoModal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('has-loto-modal');
    lotoModalTarget = null;
  }
}

document.querySelector('#lotoModalClose')?.addEventListener('click', closeLotoModal);
document.querySelector('#lotoModalBackdrop')?.addEventListener('click', closeLotoModal);

function modelForSelection():ModelType|undefined {return byId[selected]?.model||edgeById[selected]?.model;}

function verifyHvIsolationOrWarn(equipmentId: string): boolean {
  const access = hvLotoManager.verify3dInspectAccess(equipmentId, state.closed);
  const banner = document.querySelector<HTMLElement>('#arcFlashBanner');
  const bannerText = document.querySelector<HTMLElement>('#arcFlashBannerText');
  if (!access.allowed) {
    const warnMsg = access.violationMessage || 'Complete the five-step 6.6 kV lockout / tagout before opening or exploding an HV panel.';
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

function renderAssemblyControlsCard(
  title: string,
  microCopy: string,
  targetFactor: number,
  prefix: string,
  isHv: boolean = false
): string {
  const pct = Math.round(targetFactor * 100);
  return `
    <div class="cad-card ${prefix}-controls-card">
      <div class="card-header">
        <div>
          <div class="eyebrow">3D assembly${isHv ? ' · LOTO required to explode' : ''}</div>
          <h4>${title}</h4>
        </div>
        <span id="${prefix}-explosion-val" class="cad-val">${pct}%</span>
      </div>
      <p class="micro-copy">${microCopy}</p>
      <div class="cad-slider-row">
        <label for="${prefix}-explosion-slider">Explode</label>
        <input type="range" id="${prefix}-explosion-slider" min="0" max="1" step="0.01" value="${targetFactor}">
      </div>
      <div class="cad-presets">
        <button type="button" class="preset-btn" data-${prefix}-preset="0">Assembled</button>
        <button type="button" class="preset-btn" data-${prefix}-preset="0.45">Partial</button>
        <button type="button" class="preset-btn" data-${prefix}-preset="1.0">Exploded</button>
      </div>
    </div>`;
}

function wireAssemblyControls(
  pane: Element,
  prefix: string,
  assembly: { setExplosionFactor: (f: number) => void; targetExplosionFactor: number },
  isHv: boolean = false,
  selectedId: string = ''
) {
  const slider = pane.querySelector<HTMLInputElement>(`#${prefix}-explosion-slider`);
  const label = pane.querySelector<HTMLElement>(`#${prefix}-explosion-val`);
  slider?.addEventListener('input', (ev) => {
    const factor = parseFloat((ev.target as HTMLInputElement).value);
    if (isHv && factor > 0 && !verifyHvIsolationOrWarn(selectedId)) {
      slider.value = '0';
      assembly.setExplosionFactor(0);
      return;
    }
    assembly.setExplosionFactor(factor);
    if (label) label.textContent = `${Math.round(factor * 100)}%`;
  });

  pane.querySelectorAll<HTMLButtonElement>(`[data-${prefix}-preset]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const factor = parseFloat(btn.getAttribute(`data-${prefix}-preset`) || '0');
      if (isHv && factor > 0 && !verifyHvIsolationOrWarn(selectedId)) {
        if (slider) slider.value = '0';
        assembly.setExplosionFactor(0);
        return;
      }
      assembly.setExplosionFactor(factor);
      if (slider) slider.value = String(factor);
      if (label) label.textContent = `${Math.round(factor * 100)}%`;
    });
  });
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
        <h3 class="block-title">Electrical rating</h3>
        <div class="eto-elec-grid">
          <div><span>Rated power</span><strong>${loadSpec.ratedKw} kW · PF ${loadSpec.powerFactor}</strong></div>
          <div><span>Present draw</span><strong>${activeKw} kW / ${activeKvar} kVAr (${activeAmps} A)</strong></div>
          <div><span>Starting / inrush</span><strong>${loadSpec.startingMethod} (${loadSpec.inrushMultiplier}× Iₙ)</strong></div>
          <div><span>PMS priority</span><strong>${loadSpec.priority}${loadSpec.preferentialTripStage?` (shed stage ${loadSpec.preferentialTripStage})`:''}</strong></div>
        </div>
      </div>`;
  } else if(genSpec){
    electricalSpecCard=`
      <div class="eto-elec-card">
        <h3 class="block-title">Governor and AVR</h3>
        <div class="eto-elec-grid">
          <div><span>Rating</span><strong>${genSpec.ratedKw} kW / ${genSpec.ratedKva} kVA</strong></div>
          <div><span>Output</span><strong>${Math.round(genSpec.kw)} kW · ${Math.round(genSpec.kvar)} kVAr (${genSpec.loadPercent}%)</strong></div>
          <div><span>Terminal V / Hz</span><strong>${Math.round(genSpec.voltageV)} V · ${genSpec.frequencyHz.toFixed(2)} Hz</strong></div>
          <div><span>Governor / AVR reference</span><strong>Gov ${genSpec.govSetpointHz.toFixed(2)} Hz · AVR ${genSpec.relays.fieldLossInjected?'FIELD LOSS':`${Math.round(genSpec.avrSetpointPu*100)}%`}</strong></div>
        </div>
      </div>`;
  } else if(busSpec){
    const isHvBus=selected==='busA'||selected==='busB';
    const earthing=simEngine.hvEarthing;
    electricalSpecCard=`
      <div class="eto-elec-card">
        <h3 class="block-title">Bus readings</h3>
        <div class="eto-elec-grid">
          <div><span>Voltage / frequency</span><strong>${Math.round(busSpec.voltageV)} V · ${busSpec.frequencyHz.toFixed(2)} Hz</strong></div>
          <div><span>Load</span><strong>${busSpec.kw} kW · ${busSpec.kvar} kVAr (PF ${busSpec.powerFactor})</strong></div>
          <div><span>Current / THD</span><strong>${Math.round(busSpec.currentAmps)} A · THD ${busSpec.thdPercent}%</strong></div>
          <div><span>${isHvBus?`Earthing (${simEngine.earthingArchitecture})`:'Insulation (IMD)'}</span><strong>${isHvBus&&simEngine.earthingArchitecture==='HRE'?(simEngine.earthFaultHv?`V_N=${earthing.neutralDisplacementV}V · I_ef=${earthing.groundFaultCurrentAmps.toFixed(1)}A`:'381 Ω NER (V_N=0V)'):(busSpec.insulationKohm>=1000?`${(busSpec.insulationKohm/1000).toFixed(1)} MΩ`:`${busSpec.insulationKohm} kΩ FAULT`)}</strong></div>
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
        <h3 class="block-title">Generator protection</h3>
        <div class="relay-functions-list">
          <div class="relay-fn-row ${tripped32?'tripped':r.reversePowerTimer>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>32 · Reverse power</strong>
              <span class="relay-pill">${tripped32?'TRIPPED':r.reversePowerTimer>0?`PICKUP ${r.reversePowerTimer.toFixed(1)}s / 3.0s`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Pickup: P &lt; −5% P_rated (−${Math.round(genSpec.ratedKw*0.05)} kW) for &gt; 3.0 s · Live P: ${Math.round(genSpec.kw)} kW</div>
          </div>
          <div class="relay-fn-row ${tripped40?'tripped':r.lossOfFieldTimer>0||r.fieldLossInjected?'pickup':''}">
            <div class="relay-fn-head">
              <strong>40 · Loss of field</strong>
              <span class="relay-pill">${tripped40?'TRIPPED':r.lossOfFieldTimer>0?`PICKUP ${r.lossOfFieldTimer.toFixed(1)}s / 1.5s`:r.fieldLossInjected?'ARMED':'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Pickup: Q &lt; −20% Q_rated (−${Math.round(ratedQ*0.20)} kVAr) &amp; V &lt; 85% (5.61 kV) for 1.5 s · Live Q: ${Math.round(genSpec.kvar)} kVAr, V: ${(genSpec.voltageV/1000).toFixed(2)} kV</div>
          </div>
          <div class="relay-fn-row ${tripped51?'tripped':r.idmtProgress>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>51 · IDMT overcurrent</strong>
              <span class="relay-pill">${tripped51?'TRIPPED':r.idmtProgress>0?`DIAL ${(r.idmtProgress*100).toFixed(0)}%`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">IEC Standard Inverse: t = 0.14 / ((I / I_s)^0.02 − 1) · Live I: ${Math.round(genSpec.currentAmps)} A</div>
          </div>
        </div>
        <div class="relay-test-actions">
          <button type="button" class="button button-secondary relay-test-btn ${r.fieldLossInjected?'fault-active':''}" id="btnInspectorFieldLoss">${r.fieldLossInjected?'Restore field':'Inject field loss (40)'}</button>
          <button type="button" class="button button-secondary relay-test-btn" id="btnInspectorMotorize">Lower governor 0.4 Hz (32)</button>
        </div>
      </div>`;
  } else if(feederRelay && c){
    const fTripped=Boolean(feederRelay.lastTripReason);
    protectionRelayCard=`
      <div class="relay-engine-card">
        <h3 class="block-title">Feeder protection</h3>
        <div class="relay-functions-list">
          <div class="relay-fn-row ${fTripped?'tripped':feederRelay.idmtProgress>0?'pickup':''}">
            <div class="relay-fn-head">
              <strong>51 · IEC standard inverse</strong>
              <span class="relay-pill">${fTripped?'TRIPPED':feederRelay.idmtProgress>0?`DIAL ${(feederRelay.idmtProgress*100).toFixed(0)}%`:'NORMAL'}</span>
            </div>
            <div class="relay-fn-sub">Curve: t = k / ((I / I_s)^α − 1) [k=0.14, α=0.02] · Pickup I_s = ${feederRelay.pickupAmps} A · Live I = ${Math.round(feederRelay.currentAmps)} A</div>
          </div>
        </div>
        <div class="relay-test-actions">
          <button type="button" class="button button-secondary relay-test-btn ${feederRelay.overcurrentInjected?'fault-active':''}" id="btnInspectorFeederOverload">${feederRelay.overcurrentInjected?'Clear overload':'Inject 185% overload (51)'}</button>
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
          <h4>Lockout / tagout</h4>
          <div class="hv-loto-meta">
            <span class="ptw-badge ${isIsolated?'safe':'live'}">${lotoRec.ptwNumber} · ${isIsolated?'isolated and earthed':`step ${lotoRec.completedSteps} of 5`}</span>
            <button type="button" class="btn-expand-ptw" id="btnExpandLoto" title="Open the full permit-to-work view">${icon('maximize')}Full view</button>
          </div>
        </div>
        <div class="arc-flash-violation-badge ${lotoRec.arcFlashViolation?'':'hidden'}" id="inspectorArcFlashBadge" role="alert">
          <span class="arc-flash-badge-icon">${icon('warning')}</span>
          <div>
            <strong>Enclosure not isolated</strong>
            <p>${lotoRec.violationMessage||'Complete all five LOTO steps before opening or exploding a 6.6 kV enclosure.'}</p>
          </div>
        </div>
        <div class="loto-status-strip">
          <div><span>Feeder VCB (${vcbIds.join('/')})</span><strong class="${anyVcbClosed?'is-live':'is-safe'}">${anyVcbClosed?'CLOSED · LIVE':'OPEN'}</strong></div>
          <div><span>VCB truck</span><strong>${lotoRec.completedSteps>=2?'TEST / ISOLATED':'SERVICE'}</strong></div>
          <div><span>Voltage test</span><strong class="${lotoRec.completedSteps>=4?'is-safe':'is-warn'}">${lotoRec.completedSteps>=4?'0.0 kV · DEAD':'NOT PROVEN'}</strong></div>
          <div><span>Circuit main earth</span><strong class="${lotoRec.completedSteps>=5?'is-safe':''}">${lotoRec.completedSteps>=5?'EARTHED':'OPEN'}</strong></div>
        </div>
        <div class="loto-steps-list">
          ${HV_LOTO_STEPS.map(st=>{
            const done=lotoRec.completedSteps>=st.stepNumber;
            const isNext=lotoRec.completedSteps===st.stepNumber-1;
            return `<div class="loto-step-row ${done?'done':isNext?'next':'locked'}">
              <div class="loto-step-info">
                <span class="loto-step-num">${done?icon('check'):st.stepNumber}</span>
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
          <span class="loto-vcb-ref">Interlocked: ${vcbNames}</span>
          <button type="button" class="button button-quiet loto-reset-btn" id="btnResetLoto">Reset permit</button>
        </div>
      </div>`;
  }

  // Galley 440 V Emergency Remote Shunt Trip Pushbutton Card (SOLAS II-2 Reg 9.2)
  let galleyShuntCard = '';
  if (selected === 'galley440' || selected === 'galley440Feed') {
    galleyShuntCard = `
      <div class="galley-shunt-card ${simEngine.galleyShuntTripped ? 'is-tripped' : 'is-armed'}">
        <div class="hv-loto-header">
          <h4>Galley remote shunt trip</h4>
          <span class="ptw-badge ${simEngine.galleyShuntTripped ? 'live' : 'safe'}">SOLAS II-2 Reg 9.2 · ${simEngine.galleyShuntTripped ? 'TRIPPED' : 'ARMED'}</span>
        </div>
        <p class="micro-copy">
          A trip station at the galley entrance de-energizes cooking appliances, fryers and exhaust ventilation in a fire (SOLAS II-2 Reg 9.2, BV NR467).
        </p>
        <div class="galley-shunt-actions">
          <button type="button" class="button button-danger" id="btnInspectorGalleyTrip">Press trip button</button>
          <button type="button" class="button button-secondary" id="btnInspectorGalleyReset" ${simEngine.galleyShuntTripped ? '' : 'disabled'}>Reset to armed</button>
        </div>
      </div>`;
  }

  // SOLAS Navigation & 24 V DC UPS Telemetry Card
  let upsBridgeCard = '';
  if (['nav', 'eRadio', 'battery', 'navFeed', 'navEmFeed', 'eRadioFeed'].includes(selected)) {
    const abtState = simEngine.navAbtState;
    const upsMode = simEngine.upsMode;
    const soc = simEngine.upsBatterySoc.toFixed(1);
    const autonomy = simEngine.upsAutonomyMin;
    const dischargeAmps = simEngine.upsDischargeAmps.toFixed(1);
    const sourceLabel = abtState === 'UPS_BATTERY' 
      ? '⚡ 24V DC UPS Battery (0 ms Break)' 
      : abtState === 'EMERGENCY_ESB' 
        ? '🚨 Emergency Switchboard (ESB / EDG via ABT)' 
        : '✓ Normal 220 V Bus B';
    const sourceClass = abtState === 'UPS_BATTERY' ? 'status-amber' : abtState === 'EMERGENCY_ESB' ? 'status-blue' : 'status-green';
    const modeLabel = upsMode === 'DISCHARGING_BATTERY' 
      ? `DISCHARGING (${dischargeAmps} A DC · 0 ms)` 
      : upsMode === 'EDG_SUSTAINED' 
        ? 'EDG FLOAT CHARGE' 
        : 'MAINS FLOAT CHARGE';

    upsBridgeCard = `
      <div class="eto-elec-card solas-ups-card">
        <h3 class="block-title">SOLAS II-1/42 &amp; 43 Navigation &amp; UPS Telemetry</h3>
        <div class="eto-elec-grid">
          <div><span>Active Power Source</span><strong class="${sourceClass}">${sourceLabel}</strong></div>
          <div><span>UPS Inverter Mode</span><strong class="${upsMode === 'DISCHARGING_BATTERY' ? 'status-amber' : 'status-green'}">${modeLabel}</strong></div>
          <div><span>Battery Bank Reserve</span><strong>${soc}% (${autonomy} min autonomy)</strong></div>
          <div><span>SOLAS Compliance</span><strong>Reg II-1/43.2.3 (&ge; 30 min vital navigation)</strong></div>
        </div>
        <div class="ups-card-actions">
          <button type="button" class="button button-secondary" id="btnInspectorUpsTest">Test 0ms UPS battery switchover</button>
        </div>
      </div>`;
  }

  pane.innerHTML=`<div class="inspector-header"><h2>${title}</h2><div class="zone">${sub}</div><span class="status-pill ${status.startsWith('POWERED')||status==='ENERGIZED'?'live':status.startsWith('OPEN')?'open':'dead'}">${status}</span></div>
    <div class="inspector-scroll"><div class="facts"><div><span>Voltage / type</span><strong>${e?.voltage||'Vacuum circuit breaker'}</strong></div><div><span>Normal state</span><strong>${normal}</strong></div></div>
    ${electricalSpecCard}
    ${protectionRelayCard}
    ${hvLotoCard}
    ${galleyShuntCard}
    ${upsBridgeCard}
    <div class="detail-copy"><h3>Purpose</h3><p>${purpose}</p><h3>Power path</h3><p>${path}</p><h3>How it works</h3><p>${lesson}</p></div>
    ${e&&allSupplyIds.includes(e.id)?`<div class="inspector-actions"><button class="button button-primary" data-source="${e.id}" type="button">${state.running[e.id]?'Stop':'Start'} ${e.id==='shore'?'shore supply':'generator'}</button></div>`:''}
    ${c?.breaker?`<div class="inspector-actions"><button class="button button-primary" data-breaker="${c.id}" type="button">${state.closed[c.id]?'Open':'Close'} breaker</button></div>`:''}
    ${e?relatedControls(e.id):''}
    ${assemblyInfo?`<div class="inspector-actions"><button id="openCadAssembly" type="button" class="button button-secondary">${icon('external')}Open assembly and specs</button></div>`:''}
    ${selected === 'prop' || e?.kind === 'propeller' ? renderAssemblyControlsCard('Propeller and stern tube', 'Nickel-aluminium bronze hub, four blades, thrust washer, retaining nut, seals, aft gland and stern tube cutaway.', propellerAssembly.targetExplosionFactor, 'propeller') : ''}
    ${['txA', 'txB', 'txReeferA', 'txReeferB', 'txConA', 'txConB'].includes(selected) || e?.kind === 'transformer' || model === 'transformer' ? renderAssemblyControlsCard('6.6 kV / 440 V distribution transformer', 'CRGO laminated core, concentric LV and HV resin coils, Nomex barriers, bushings and radiator banks.', transformerAssembly.targetExplosionFactor, 'transformer', true) : ''}
    ${selected === 'drive' || e?.kind === 'drive' || model === 'drive' ? renderAssemblyControlsCard('Propulsion frequency converter', 'MV input switchgear, DC-link capacitor bank, water-cooled IGBT stacks, cooling loop and control rack.', driveAssembly.targetExplosionFactor, 'drive', true) : ''}
    ${selected === 'motor' || e?.kind === 'motor' || model === 'motor' ? renderAssemblyControlsCard('Propulsion motor', 'Ribbed stator frame, form-wound 6.6 kV coils, squirrel-cage rotor, shaft, bearings and cooling fan.', motorAssembly.targetExplosionFactor, 'motor', true) : ''}
    ${selected === 'steering' || selected === 'eSteer' || e?.id === 'steering' || e?.id === 'eSteer' ? renderAssemblyControlsCard('Electro-hydraulic steering gear', 'Bedplate, rudder stock, crosshead tiller, port and starboard rams, pistons and hydraulic power pack.', steeringAssembly.targetExplosionFactor, 'steering') : ''}
    ${['reefer', 'reeferA', 'reeferB', 'reeferAFeed', 'reeferBFeed', 'reeferUnitA', 'reeferUnitB'].includes(selected) || e?.id === 'reefer' || model === 'reefer' ? renderAssemblyControlsCard('Reefer distribution panel', 'Steel cabinet, 440 V incomer, MCCB panel, four 32 A container sockets, cable transit and earth bar.', reeferAssembly.targetExplosionFactor, 'reefer') : ''}
    ${['cooling', 'cooling1', 'cooling2', 'fire', 'fire1', 'fire2', 'bilge', 'eFire'].includes(selected) || (selected !== 'ballast' && (e?.kind === 'pump' || model === 'pump')) ? renderAssemblyControlsCard('Centrifugal pump set', 'Bedplate, 440 V induction motor, flexible coupling, volute casing, impeller, flanges and mechanical seal.', pumpAssembly.targetExplosionFactor, 'pump') : ''}
    ${selected === 'eBus' || selected === 'esb' ? renderAssemblyControlsCard('Emergency switchboard cubicle', 'IP44 steel frame, 440 V draw-out ACB, three-phase busbars, ABT contactor, protection relay, earth meter and gland plate.', esbCubicleAssembly.targetExplosionFactor, 'esb') : ''}
    ${selected === 'eRadio' || selected === 'battery' ? renderAssemblyControlsCard('24 V DC battery bank and charger', 'Battery rack, 24 V VRLA cells, charger door, float/boost rectifier, DC busbars and centre-zero ammeter.', batterySystemAssembly.targetExplosionFactor, 'battery') : ''}
    ${selected === 'airCompressor' ? renderAssemblyControlsCard('Starting air compressor skid', 'I-beam skid, two-stage crankcase, 30 kW motor, V-belt drive, intercooler, 30 bar receiver and unloader valve.', airCompressorAssembly.targetExplosionFactor, 'aircomp') : ''}
    ${selected === 'ventFan' ? renderAssemblyControlsCard('Engine room ventilation fan', 'Steel casing, aerofoil impeller, 45 kW motor, inlet bellmouth, fire damper and local starter.', ventFanAssembly.targetExplosionFactor, 'ventfan') : ''}
    ${selected === 'ballast' ? renderAssemblyControlsCard('Ballast pump and OWS skid', 'Drip-tray baseplate, bronze volute, impeller, coalescing vessel, 15 ppm oil monitor, three-way valve and 110 kW motor.', ballastOwsAssembly.targetExplosionFactor, 'ballastows') : ''}
    ${selected === 'galley440' || selected === 'galley' ? renderAssemblyControlsCard('440 V galley board', 'Stainless panel, 400 A incomer MCCB with shunt-trip coil, remote trip station, latching pushbutton and range sub-MCCBs.', galleyBoardAssembly.targetExplosionFactor, 'galleyboard') : ''}
    ${selected === 'shore' ? renderAssemblyControlsCard('6.6 kV shore power reel', 'Reel chassis, motorised drum, 6.6 kV flexible cable, slip-ring collector, terminal box and key-interlocked earthing switch.', shorePowerAssembly.targetExplosionFactor, 'shorereel', true) : ''}
    ${selected === 'nav' ? renderAssemblyControlsCard('Bridge navigation console', 'Console desk, navigation-light panel, radar and ECDIS displays, GMDSS station, mast and S-band scanner.', bridgeNavComAssembly.targetExplosionFactor, 'bridgenav') : ''}
    ${model?`<div class="exploded-section${explodedExpanded?' expanded':''}"><div class="section-heading"><div><div class="eyebrow">${assemblyInfo?'3D model':'Generic 3D model'}</div><h3>${assemblyInfo?assemblyInfo.title.split('—')[0].trim():model==='generator'?'Marine diesel generator':model==='breaker'?'Vacuum circuit breaker':model==='hv-board'?'6.6 kV main switchboard':model==='lv-board'?'Low-voltage switchboard':'Inside the equipment'}</h3></div><div class="heading-tools"><span class="generic-tag ${assemblyInfo?'cad-badge':''}">${assemblyInfo?'CAD MODEL':'GENERIC'}</span><button id="explodeExpand" type="button" class="button button-secondary expand-button" aria-expanded="${explodedExpanded}" aria-label="Enlarge the equipment viewer">${assemblyInfo?'Enlarge':explodedExpanded?'Close':'Enlarge'}</button></div></div><p class="micro-copy">${assemblyInfo?`${assemblyInfo.subtitle.split('·')[0].trim()}. ${modelParts[model].length} parts; Enlarge opens the full assembly with its bill of materials.`:`Simplified teaching model with ${modelParts[model].length} parts. Explode it, pick a part, then focus to inspect.`}</p><div class="exploded-host" id="explodedHost"></div><div class="exploded-actions"><button id="explodeToggle" type="button" class="button button-secondary">Explode</button><button id="focusPart" type="button" class="button button-secondary" disabled>Focus part</button><button id="resetModelView" type="button" class="button button-secondary">Fit all</button><span>Drag to rotate, scroll to zoom</span></div><div class="parts-list" id="partsList"></div><div id="partDescription" class="part-description">Select a part to see what it does.</div></div>`:''}
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
  pane.querySelector<HTMLButtonElement>('#btnInspectorUpsTest')?.addEventListener('click',()=>{
    setMessage(simEngine.testUpsSwitchover(state));
    renderControls();
    renderInspector();
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
    if(selected==='shore')shorePowerAssembly.setExplosionFactor(0);
    if(exploded.isExploded())exploded.setExploded(false);
    setMessage(msg);
    refresh();
  });
  pane.querySelector<HTMLButtonElement>('#btnExpandLoto')?.addEventListener('click',()=>{
    openLotoModal(selected);
  });

  pane.querySelector<HTMLButtonElement>('#btnInspectorGalleyTrip')?.addEventListener('click',()=>{
    setMessage(simEngine.tripGalleyShunt(state));
    refresh();
  });
  pane.querySelector<HTMLButtonElement>('#btnInspectorGalleyReset')?.addEventListener('click',()=>{
    setMessage(simEngine.resetGalleyShunt());
    refresh();
  });

  if(assemblyInfo){
    pane.querySelector<HTMLButtonElement>('#openCadAssembly')?.addEventListener('click',()=>{
      if(needsLoto && !verifyHvIsolationOrWarn(selected))return;
      openAssemblyModal(assemblyInfo);
    });
  }

  wireAssemblyControls(pane, 'propeller', propellerAssembly);
  wireAssemblyControls(pane, 'transformer', transformerAssembly, true, selected);
  wireAssemblyControls(pane, 'drive', driveAssembly, true, selected);
  wireAssemblyControls(pane, 'motor', motorAssembly, true, selected);
  wireAssemblyControls(pane, 'steering', steeringAssembly);
  wireAssemblyControls(pane, 'reefer', reeferAssembly);
  wireAssemblyControls(pane, 'pump', pumpAssembly);
  wireAssemblyControls(pane, 'esb', esbCubicleAssembly);
  wireAssemblyControls(pane, 'battery', batterySystemAssembly);
  wireAssemblyControls(pane, 'aircomp', airCompressorAssembly);
  wireAssemblyControls(pane, 'ventfan', ventFanAssembly);
  wireAssemblyControls(pane, 'ballastows', ballastOwsAssembly);
  wireAssemblyControls(pane, 'galleyboard', galleyBoardAssembly);
  wireAssemblyControls(pane, 'shorereel', shorePowerAssembly, true, selected);
  wireAssemblyControls(pane, 'bridgenav', bridgeNavComAssembly);

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
      button.textContent=exploded.isExploded()?'Assemble':'Explode';
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
    button.textContent=value?'Close':'Enlarge';
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
  if(topBtn){
    topBtn.classList.toggle('active',open);
    topBtn.setAttribute('aria-expanded',String(open));
  }
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
    expBtn.innerHTML=expanded?`${icon('minimize')}<span>Narrow</span>`:`${icon('maximize')}<span>Widen</span>`;
  }
  window.dispatchEvent(new Event('resize'));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),260);
}

function setRightPanel(open:boolean){
  rightPanelOpen=open;
  const ws=document.querySelector('#workspace');
  ws?.classList.toggle('right-collapsed',!open);
  const topBtn=document.querySelector<HTMLButtonElement>('#toggleRightPanel');
  if(topBtn){
    topBtn.classList.toggle('active',open);
    topBtn.setAttribute('aria-expanded',String(open));
  }
  window.dispatchEvent(new Event('resize'));
  setTimeout(()=>window.dispatchEvent(new Event('resize')),260);
}

document.addEventListener('keydown',e=>{
  const isInput=['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
  if(e.key==='Escape'){
    closeAssemblyModal();
    closeLotoModal();
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
        relayEl.textContent=tags.join(' · ');
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
  if(autoBtn)autoBtn.textContent=s.autoSyncActive?'Synchronizing…':'Auto-sync and close';

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
    ansi67n.textContent=ansi67nMsg;
  }

  // 3b. Update Phase 3 SOLAS Blackout Recovery 5-Stage Sequential Waterfall HUD Progress Bar
  const wfHud=document.getElementById('solasWaterfallHud');
  const wf=simEngine.waterfall;
  if(wfHud){
    const showWf=wf.active || wf.completed || activeScenario==='emergency';
    wfHud.classList.toggle('hidden',!showWf);
    if(showWf){
      const curTitle=wf.currentStage?`Stage ${wf.currentStage.stageNumber}: ${wf.currentStage.shortTitle}`:(wf.completed?'All five stages restored':'Waiting to start');
      wfHud.innerHTML=`
        <div class="solas-wf-header">
          <div class="solas-wf-title">
            <span class="solas-wf-badge">${wf.active?'SOLAS blackout recovery':'SOLAS recovery complete'}</span>
            <strong>${curTitle}</strong><span class="solas-wf-badge num">T+${wf.elapsedSec.toFixed(1)} s</span>
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
                <span class="solas-wf-stage-state">${isDone?'done':isCur?'running':'queued'}</span>
              </div>
              <strong class="solas-wf-stage-name" title="${st.shortTitle}">${st.stageNumber}. ${st.shortTitle}</strong>
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
        <span class="bus-tele-title">6.6 kV bus A · ${simEngine.earthingArchitecture}</span>
        <strong>${bA.live?`${(bA.voltageV/1000).toFixed(2)} kV · ${bA.frequencyHz.toFixed(2)} Hz`:'DEAD BUS'}</strong>
        <span>${bA.kw} kW · PF ${bA.powerFactor} · THD ${bA.thdPercent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${bB.live?'live':'dead'}" data-bus-jump="busB">
        <span class="bus-tele-title">6.6 kV bus B · ${simEngine.earthingArchitecture}</span>
        <strong>${bB.live?`${(bB.voltageV/1000).toFixed(2)} kV · ${bB.frequencyHz.toFixed(2)} Hz`:'DEAD BUS'}</strong>
        <span>${bB.kw} kW · PF ${bB.powerFactor} · THD ${bB.thdPercent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${lvA.live?'live':'dead'}" data-bus-jump="lvBusA">
        <span class="bus-tele-title">440 V bus A · port</span>
        <strong>${lvA.live?`${Math.round(lvA.voltageV)} V · ${lvA.frequencyHz.toFixed(1)} Hz`:'DEAD BUS'}</strong>
        <span>${lvA.kw} kW · TxA ${txA.percent}% · RefA ${txReeferA.percent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${lvB.live?'live':'dead'}" data-bus-jump="lvBusB">
        <span class="bus-tele-title">440 V bus B · stbd</span>
        <strong>${lvB.live?`${Math.round(lvB.voltageV)} V · ${lvB.frequencyHz.toFixed(1)} Hz`:'DEAD BUS'}</strong>
        <span>${lvB.kw} kW · TxB ${txB.percent}% · RefB ${txReeferB.percent}%</span>
      </button>
      <button type="button" class="bus-tele-card ${conA.live||conB.live?'live':'dead'}" data-bus-jump="consumerA">
        <span class="bus-tele-title">220 V sub-boards</span>
        <strong>${conA.live||conB.live?`${Math.round(conA.live?conA.voltageV:conB.voltageV)} V · 60 Hz`:'DEAD BUS'}</strong>
        <span>A ${conA.kw} kW · B ${conB.kw} kW</span>
      </button>
      <button type="button" class="bus-tele-card ${bEm.live?'live':'dead'}" data-bus-jump="eBus">
        <span class="bus-tele-title">440 V emergency</span>
        <strong>${bEm.live?`${Math.round(bEm.voltageV)} V · ${bEm.frequencyHz.toFixed(1)} Hz`:'STANDBY'}</strong>
        <span>${bEm.kw} kW · essential</span>
      </button>
      <button type="button" class="bus-tele-card ${simEngine.upsMode==='DISCHARGING_BATTERY'?'warn':live.has('nav')?'live':'dead'}" data-bus-jump="nav">
        <span class="bus-tele-title">SOLAS bridge UPS</span>
        <strong>${simEngine.upsMode==='DISCHARGING_BATTERY'?'0ms BATTERY ACTIVE':`${simEngine.upsBatterySoc.toFixed(0)}% · FLOAT`}</strong>
        <span>Nav: ${simEngine.navAbtState}</span>
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
  if(lotoModalTarget)renderLotoModalContent(lotoModalTarget);
  const s=scenarios.find(s=>s.id===activeScenario);
  document.querySelector('#lessonTitle')!.textContent=s?.title||'Free exploration';
  document.querySelector('#lessonText')!.textContent=s?.instruction||'Change a source or breaker and trace which loads remain connected to an active source.';
  const runningSources=allSupplyIds.filter(id=>state.running[id]).length;
  const suppliedLoads=equipment.filter(e=>['load','pump','thruster','motor','propeller'].includes(e.kind)&&live.has(e.id)).length;
  document.querySelector('#statusCount')!.textContent=`${runningSources} sources active · ${suppliedLoads} load groups supplied`;
  document.querySelector('.small-index')!.textContent=s?`${String(scenarios.indexOf(s)+1).padStart(2,'0')} / ${String(scenarios.length).padStart(2,'0')}`:'Free mode';
  setMessage(message);
}

document.querySelector('#openTutorialBtn')?.addEventListener('click',()=>{
  openAssemblyModal({
    url: resolveAssemblyUrl('tutorial.html'),
    title: 'Tutorial',
    subtitle: 'Paralleling and synchroscope · PMS load sharing · blackout recovery · earth faults',
    tag: 'Guide'
  });
});
document.querySelector('#openUniversalCatalog')?.addEventListener('click',()=>{
  openAssemblyModal({
    url: resolveAssemblyUrl('universal_viewer.html?eq=coolingPump'),
    title: 'Equipment catalog',
    subtitle: 'Exploded 3D assemblies, electrical ratings and bills of materials',
    tag: 'Catalog'
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
document.querySelector('#toggleShell')!.addEventListener('click',e=>{showShell=!showShell;vessel.setShell(showShell);(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(showShell));});
document.querySelector('#toggleLabels')!.addEventListener('click',e=>{showLabels=!showLabels;vessel.setLabels(showLabels);(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(showLabels));});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{
  view=b.dataset.view as View;
  document.querySelector('#vesselHost')!.classList.toggle('hidden',view!=='vessel');
  document.querySelector('#schematicHost')!.classList.toggle('hidden',view!=='schematic');
  document.querySelector('#viewTools')!.classList.toggle('hidden',view!=='vessel');
  document.querySelector('#schematicTools')?.classList.toggle('hidden',view!=='schematic');
  document.querySelector('#schematicLegendCard')?.classList.toggle('hidden',view!=='schematic');
  document.querySelector('#viewTitle')!.textContent=view==='vessel'?'Vessel overview':'Single-line diagram';
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-selected',String(t===b));});
  if(view==='schematic') {
    fitSchematicToScreen();
  }
});
initSchematicInteractions();
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

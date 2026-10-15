import './style.css';
import { byId, connections, edgeById, equipment, initialState, powered, connectionState, scenarios, sourceIds, VOLTAGES, type SimState, type Equipment, type ModelType } from './network';
import { modelParts } from './models';
import { VesselView, ExplodedView } from './scene';

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

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <header class="topbar">
    <div class="brand"><span class="brand-symbol">◈</span><div><div class="eyebrow">INTERACTIVE LEARNING LAB · V1</div><h1>Marine Power System <span>Simulator</span></h1></div></div>
    <div class="top-actions"><span class="mode-chip">GENERIC CONTAINER SHIP</span><button class="button button-quiet" id="resetAll" type="button">↺ Reset simulation</button></div>
  </header>
  <main class="workspace">
    <aside class="left-panel panel">
      <div class="panel-heading"><div><div class="eyebrow">LEARNING PATH</div><h2>Explore the system</h2></div><span class="small-index">01 / 04</span></div>
      <div class="scenario-list" id="scenarios"></div>
      <section class="control-section"><div class="section-heading"><h3>Generation</h3><span class="subtle">${VOLTAGES.hv} main</span></div><div id="generators"></div></section>
      <section class="control-section"><div class="section-heading"><h3>Bus section tie</h3><span class="subtle">A ↔ B</span></div><div id="tieControl"></div></section>
      <section class="control-section"><div class="section-heading"><h3>Representative feeders</h3><span class="subtle">Tap to switch</span></div><div id="feeders"></div></section>
      <section class="control-section emergency-control"><div class="section-heading"><h3>Emergency supply</h3><span class="subtle">Independent</span></div><div id="emergencyControls"></div></section>
    </aside>
    <section class="center-panel">
      <div class="view-header"><div><div class="eyebrow">POWER FLOW EXPLORER</div><h2 id="viewTitle">Vessel overview</h2></div><div class="tabs" role="tablist" aria-label="System views"><button class="tab active" data-view="vessel" role="tab" aria-selected="true">◈ 3D vessel</button><button class="tab" data-view="schematic" role="tab" aria-selected="false">⌁ Single-line</button></div></div>
      <div class="visual-stage" id="visualStage"><div class="vessel-host" id="vesselHost" aria-label="Interactive 3D vessel view"></div><div class="schematic-host hidden" id="schematicHost" aria-label="Interactive single-line diagram"></div>
        <div class="view-tools" id="viewTools"><button id="resetCamera" type="button">⌖ Reset view</button><button id="focusEquipment" type="button">◎ Focus item</button><button id="toggleShell" type="button">▧ Shell on</button><button id="toggleLabels" type="button">T Labels on</button></div>
      </div>
      <div class="status-strip"><div class="legend"><span><i class="legend-line live"></i> Energized</span><span><i class="legend-line dead"></i> De-energized</span><span><i class="legend-line open"></i> Open / disconnected</span></div><div class="status-count" id="statusCount"></div></div>
      <div class="lesson-banner"><span class="lesson-icon">i</span><div><strong id="lessonTitle">Current lesson</strong><p id="lessonText"></p></div></div>
      <div class="notice" id="notice" role="status" aria-live="polite"></div>
    </section>
    <aside class="right-panel panel" id="inspector"></aside>
  </main>
  <footer class="footer"><span>MARINE POWER SYSTEM SIMULATOR · EDUCATIONAL CONNECTIVITY MODEL</span><span>Generic geometry · Provisional LV labels · No electrical calculations</span></footer>
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

function setMessage(text:string){message=text;document.querySelector('#notice')!.textContent=text;}
function statusText(id:string){return live.has(id)?'POWERED':'NOT POWERED';}
function toggleBreaker(id:string){state.closed[id]=!state.closed[id];activeScenario='';const c=edgeById[id];setMessage(`${c.name} ${state.closed[id]?'closed':'opened'}. ${state.closed[id]?'The path can carry power if its upstream source is active.':'The downstream path is isolated unless another route supplies it.'}`);refresh();}
function toggleSource(id:string){state.running[id]=!state.running[id];activeScenario='';setMessage(`${byId[id].name} ${state.running[id]?'started':'stopped'}. A running generator supplies its bus only through a closed generator breaker.`);refresh();}
function select(id:string){if(!byId[id]&&!edgeById[id])return;selected=id;selectedPart=undefined;renderInspector();renderSchematic();vessel.update(state,live,selected);}
function scenario(id:string){const item=scenarios.find(s=>s.id===id);if(!item)return;state=item.apply();activeScenario=id;selected=item.focus;selectedPart=undefined;setMessage(item.instruction);refresh();}
function reset(){scenario('main');vessel.resetCamera();setMessage('Simulation reset. DG 1 and the main bus are energized.');}

function renderScenarios(){const el=document.querySelector('#scenarios')!;el.innerHTML=scenarios.map(s=>`<button type="button" class="scenario ${activeScenario===s.id?'active':''}" data-scenario="${s.id}"><span class="scenario-number">${s.title.slice(0,2)}</span><span>${s.title.slice(5)}</span><span class="scenario-arrow">↗</span></button>`).join('');el.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.onclick=()=>scenario(b.dataset.scenario!));}
function sourceRow(id:string){const e=byId[id],breaker=id==='eg'?'egBreaker':`gb${id.slice(2)}`;return `<div class="generator-row"><button class="item-name" data-select="${id}" type="button"><span class="state-dot ${state.running[id]?'on':''}"></span>${e.short}</button><button class="mini-toggle ${state.running[id]?'on':''}" data-source="${id}" type="button" aria-label="${state.running[id]?'Stop':'Start'} ${e.name}">${state.running[id]?'RUNNING':'STOPPED'}</button><button class="mini-toggle ${state.closed[breaker]?'closed':''}" data-breaker="${breaker}" type="button" aria-label="${state.closed[breaker]?'Open':'Close'} ${edgeById[breaker].name}">CB ${state.closed[breaker]?'CLOSED':'OPEN'}</button></div>`;}
function renderControls(){document.querySelector('#generators')!.innerHTML=['dg1','dg2','dg3','dg4'].map(sourceRow).join('');
  document.querySelector('#tieControl')!.innerHTML=`<div class="tie-row"><button class="item-name" data-select="tie" type="button">Main bus A ↔ B</button><button class="switch ${state.closed.tie?'on':''}" id="tieSwitch" type="button" role="switch" aria-checked="${state.closed.tie}" aria-label="Bus tie breaker"><span></span></button><strong>${state.closed.tie?'CLOSED':'OPEN'}</strong></div>`;
  const groups=[[VOLTAGES.hv,'propFeed','bowFeed','sternFeed','txAFeed','txBFeed'],[VOLTAGES.lv,'reeferFeed','reeferPlug','craneFeed','fireFeed','ballastFeed','bilgeFeed','coolingFeed','steerFeed','tx220Feed'],[VOLTAGES.consumer,'galleyFeed','lightFeed','outletFeed']];
  document.querySelector('#feeders')!.innerHTML=groups.map(([title,...ids])=>`<div class="feeder-group"><div class="feeder-label">${title}</div>${ids.map(id=>{const c=edgeById[id];return `<div class="feeder-row"><button class="feeder-name" data-select="${id}" type="button">${c.name.replace(' feeder breaker','').replace(' breaker','')}</button><button class="feeder-state ${state.closed[id]?'closed':''}" data-breaker="${id}" type="button" aria-label="${state.closed[id]?'Open':'Close'} ${c.name}">${state.closed[id]?'CLOSED':'OPEN'}</button></div>`;}).join('')}</div>`).join('');
  document.querySelector('#emergencyControls')!.innerHTML=sourceRow('eg')+`<p class="micro-copy">No automatic transfer is modeled. Start the emergency generator and close its breaker to energize the separate board.</p>`;
  document.querySelector('#tieSwitch')!.addEventListener('click',()=>toggleBreaker('tie'));
  document.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b=>b.onclick=()=>toggleSource(b.dataset.source!));
  document.querySelectorAll<HTMLButtonElement>('[data-breaker]').forEach(b=>b.onclick=()=>toggleBreaker(b.dataset.breaker!));
  document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(b=>b.onclick=()=>select(b.dataset.select!));
}
function nodeClass(e:Equipment){return e.kind==='generator'||e.kind==='emergency-generator'?'source':e.kind==='bus'||e.kind==='emergency-bus'?'bus':e.kind==='future'?'future':'equipment';}
function svgEsc(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function renderSchematic(){const host=document.querySelector('#schematicHost')!;
  const paths=connections.map(c=>{const a=byId[c.from],b=byId[c.to];const status=connectionState(c,state,live);const ax=a.sx,ay=a.sy,bx=b.sx,by=b.sy;
    const mx=(ax+bx)/2,my=(ay+by)/2;const breaker=c.breaker?`<g class="breaker-symbol ${status}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}"><rect x="${mx-10}" y="${my-10}" width="20" height="20" rx="3"/><path d="M${mx-5} ${my+4} L${mx+5} ${my-4}"/><title>${svgEsc(c.name)} · ${state.closed[c.id]?'closed':'open'}</title></g>`:'';
    return `<g class="diagram-path ${status} ${selected===c.id?'selected':''}" data-select="${c.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(c.name)}"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><title>${svgEsc(c.name)} · ${status}</title></g>${breaker}`;
  }).join('');
  const nodes=equipment.map(e=>{const s=e.kind==='bus'||e.kind==='emergency-bus'?122:96,h=43;const cls=nodeClass(e);return `<g class="diagram-node ${cls} ${live.has(e.id)?'live':'dead'} ${selected===e.id?'selected':''}" transform="translate(${e.sx-s/2} ${e.sy-h/2})" data-select="${e.id}" tabindex="0" role="button" aria-label="Inspect ${svgEsc(e.name)}"><rect width="${s}" height="${h}" rx="8"/><text x="${s/2}" y="17" text-anchor="middle" class="node-label">${svgEsc(e.short)}</text><text x="${s/2}" y="32" text-anchor="middle" class="node-voltage">${svgEsc(e.voltage)}</text><title>${svgEsc(e.name)} · ${live.has(e.id)?'powered':'not powered'}</title></g>`;}).join('');
  host.innerHTML=`<div class="diagram-wrap"><svg viewBox="0 0 1100 830" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Single-line diagram of ship electrical connections"><text class="diagram-heading" x="32" y="34">NORMAL DISTRIBUTION</text><text class="diagram-heading" x="32" y="550">SEPARATE EMERGENCY DISTRIBUTION</text><path class="section-rule" d="M30 560 H1070"/>${paths}${nodes}</svg></div>`;
  host.querySelectorAll<SVGGElement>('[data-select]').forEach(g=>{g.addEventListener('click',()=>select(g.dataset.select!));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(g.dataset.select!);}});});
}
function relatedControls(id:string){const related=connections.filter(c=>c.from===id||c.to===id).filter(c=>c.breaker);if(!related.length)return '';return `<div class="inspector-related"><h4>Connected breakers</h4>${related.map(c=>`<div class="related-row"><button data-select="${c.id}" type="button">${c.name}</button><button class="feeder-state ${state.closed[c.id]?'closed':''}" data-breaker="${c.id}" type="button">${state.closed[c.id]?'CLOSED':'OPEN'}</button></div>`).join('')}</div>`;}
interface AssemblyPageInfo {
  url: string;
  title: string;
  subtitle: string;
  tag: string;
}

function resolveAssemblyUrl(filename: string): string {
  const base = import.meta.env.BASE_URL;
  if (base && base.startsWith('/') && base !== '/') {
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${window.location.origin}${cleanBase}assemblies/${filename}`;
  }
  let path = window.location.pathname;
  if (!path.endsWith('/')) {
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      path = path.substring(0, path.lastIndexOf('/') + 1);
    } else {
      path = `${path}/`;
    }
  }
  return `${window.location.origin}${path}assemblies/${filename}`;
}

function getAssemblyPage(selectedId: string, model: ModelType | undefined): AssemblyPageInfo | null {
  if (model === 'thruster' || selectedId === 'bow' || selectedId === 'stern') {
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

  pane.innerHTML=`<div class="inspector-header"><div class="eyebrow">EQUIPMENT INSPECTOR</div><span class="inspector-icon">◈</span><h2>${title}</h2><div class="zone">${sub}</div><span class="status-pill ${status.startsWith('POWERED')||status==='ENERGIZED'?'live':status.startsWith('OPEN')?'open':'dead'}">${status}</span></div>
    <div class="inspector-scroll"><div class="facts"><div><span>VOLTAGE / TYPE</span><strong>${e?.voltage||'Vacuum circuit breaker'}</strong></div><div><span>NORMAL STATE</span><strong>${normal}</strong></div></div><div class="detail-copy"><h3>Purpose</h3><p>${purpose}</p><h3>Power path</h3><p>${path}</p><h3>Understand it</h3><p>${lesson}</p></div>
    ${e&&sourceIds.includes(e.id)?`<div class="inspector-actions"><button class="button button-primary" data-source="${e.id}" type="button">${state.running[e.id]?'Stop':'Start'} generator</button></div>`:''}
    ${c?.breaker?`<div class="inspector-actions"><button class="button button-primary" data-breaker="${c.id}" type="button">${state.closed[c.id]?'Open':'Close'} breaker</button></div>`:''}
    ${e?relatedControls(e.id):''}
    ${assemblyInfo?`<div class="inspector-actions" style="margin-top:14px;"><button id="openCadAssembly" type="button" class="button button-primary open-cad-btn" style="width:100%;">⚡ Open 3D Engineering Assembly & Specs ↗</button></div>`:''}
    ${model?`<div class="exploded-section${explodedExpanded?' expanded':''}"><div class="section-heading"><div><div class="eyebrow">${assemblyInfo?'3D CAD ENGINEERING MODEL':'INTERACTIVE 3D MODEL'}</div><h3>${assemblyInfo?assemblyInfo.title.split('—')[0].trim():model==='generator'?'Marine diesel generator':model==='breaker'?'Vacuum circuit breaker':model==='hv-board'?'6.6 kV main switchboard':model==='lv-board'?'Low-voltage switchboard':'Inside the equipment'}</h3></div><div class="heading-tools"><span class="generic-tag ${assemblyInfo?'cad-badge':''}">${assemblyInfo?'CAD MODEL':'GENERIC'}</span><button id="explodeExpand" type="button" class="button button-secondary expand-button" aria-expanded="${explodedExpanded}" aria-label="Enlarge the equipment viewer">${assemblyInfo?'⤢ Enlarge & Specs':explodedExpanded?'✕ Close':'⤢ Enlarge'}</button></div></div><p class="micro-copy">${assemblyInfo?`${assemblyInfo.subtitle.split('·')[0].trim()} · ${modelParts[model].length} selectable subassemblies. Click Enlarge to open full interactive assembly with BOM and specifications.`:`Reference-inspired teaching model · ${modelParts[model].length} selectable assemblies. Explode, select a name or a 3D part, then focus to inspect it.`}</p><div class="exploded-host" id="explodedHost"></div><div class="exploded-actions"><button id="explodeToggle" type="button" class="button button-secondary">↗ Explode view</button><button id="focusPart" type="button" class="button button-secondary" disabled>Focus part</button><button id="resetModelView" type="button" class="button button-secondary">Fit all</button><span>Drag to rotate · Scroll to zoom</span></div><div class="parts-list" id="partsList"></div><div id="partDescription" class="part-description">Select a part to see what it does.</div></div>`:''}
    </div>`;

  pane.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b=>b.onclick=()=>toggleSource(b.dataset.source!));
  pane.querySelectorAll<HTMLButtonElement>('[data-breaker]').forEach(b=>b.onclick=()=>toggleBreaker(b.dataset.breaker!));
  pane.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(b=>b.onclick=()=>select(b.dataset.select!));

  if(assemblyInfo){
    pane.querySelector<HTMLButtonElement>('#openCadAssembly')?.addEventListener('click',()=>openAssemblyModal(assemblyInfo));
  }

  if(model){
    pane.querySelector<HTMLButtonElement>('#explodeExpand')!.onclick=()=>{
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
    button.onclick=()=>{exploded.setExploded(!exploded.isExploded());button.textContent=exploded.isExploded()?'↙ Assemble view':'↗ Explode view';};
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

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeAssemblyModal();
    if(explodedExpanded)setExpanded(false);
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
function refresh(){live=powered(state);renderScenarios();renderControls();renderSchematic();renderInspector();vessel.update(state,live,selected);
  const s=scenarios.find(s=>s.id===activeScenario);document.querySelector('#lessonTitle')!.textContent=s?.title||'Free exploration';document.querySelector('#lessonText')!.textContent=s?.instruction||'Change a source or breaker and trace which loads remain connected to an active source.';
  document.querySelector('#statusCount')!.textContent=`${sourceIds.filter(id=>state.running[id]).length} sources running · ${equipment.filter(e=>['load','pump','thruster','motor','propeller'].includes(e.kind)&&live.has(e.id)).length} load groups supplied`;
  document.querySelector('.small-index')!.textContent=s?`${String(scenarios.indexOf(s)+1).padStart(2,'0')} / 04`:'FREE MODE';setMessage(message);
}

document.querySelector('#resetAll')!.addEventListener('click',reset);
document.querySelector('#resetCamera')!.addEventListener('click',()=>vessel.resetCamera());
document.querySelector('#focusEquipment')!.addEventListener('click',()=>vessel.focusSelection());
document.querySelector('#toggleShell')!.addEventListener('click',e=>{showShell=!showShell;vessel.setShell(showShell);(e.currentTarget as HTMLElement).textContent=`▧ Shell ${showShell?'on':'off'}`;});
document.querySelector('#toggleLabels')!.addEventListener('click',e=>{showLabels=!showLabels;vessel.setLabels(showLabels);(e.currentTarget as HTMLElement).textContent=`T Labels ${showLabels?'on':'off'}`;});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view as View;document.querySelector('#vesselHost')!.classList.toggle('hidden',view!=='vessel');document.querySelector('#schematicHost')!.classList.toggle('hidden',view!=='schematic');document.querySelector('#viewTools')!.classList.toggle('hidden',view!=='vessel');document.querySelector('#viewTitle')!.textContent=view==='vessel'?'Vessel overview':'Single-line diagram';document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-selected',String(t===b));});});
refresh();
(window as any).app = { vessel, exploded, select, toggleBreaker, toggleSource, reset, refresh, getState: () => state, getLive: () => live };

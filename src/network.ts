export type NodeKind = 'generator' | 'emergency-generator' | 'bus' | 'emergency-bus' | 'transformer' | 'drive' | 'motor' | 'propeller' | 'thruster' | 'pump' | 'load' | 'future';
export type ModelType = 'generator' | 'breaker' | 'hv-board' | 'transformer' | 'lv-board' | 'drive' | 'motor' | 'thruster' | 'reefer' | 'pump';
export interface Equipment {
  id: string;
  name: string;
  short: string;
  kind: NodeKind;
  voltage: string;
  zone: string;
  purpose: string;
  path: string;
  normal: string;
  lesson: string;
  model?: ModelType;
  sx: number; sy: number;
  label3d?: boolean;
}
export interface Connection {
  id: string;
  from: string;
  to: string;
  name: string;
  breaker?: boolean;
  normalClosed?: boolean;
  model?: ModelType;
  purpose?: string;
  lesson?: string;
}
export interface SimState {
  running: Record<string, boolean>;
  closed: Record<string, boolean>;
}

// Electrical topology is independent from the drawing coordinates and Three.js geometry.
// Edit labels here when confirmed ship reference material becomes available.
export const VOLTAGES = { hv: '6.6 kV', lv: '440 V', consumer: '220 V' };

const n = (id: string, name: string, short: string, kind: NodeKind, voltage: string, zone: string, purpose: string, path: string, normal: string, lesson: string, sx: number, sy: number, model?: ModelType, label3d = false): Equipment =>
  ({ id, name, short, kind, voltage, zone, purpose, path, normal, lesson, sx, sy, model, label3d });

export const equipment: Equipment[] = [
  n('dg1','Diesel-generator 1','DG 1','generator',VOLTAGES.hv,'Engine room','A diesel engine turns an alternator to make electrical power.','Source → generator breaker → main bus A','Running; breaker closed','The engine supplies mechanical energy; the alternator converts it to electricity. This engine does not turn the propeller shaft.',80,80,'generator',true),
  n('dg2','Diesel-generator 2','DG 2','generator',VOLTAGES.hv,'Engine room','Second main electrical source.','Source → generator breaker → main bus A','Standby; breaker open','Any available generator can feed its bus section when its breaker is closed.',80,145,'generator',true),
  n('dg3','Diesel-generator 3','DG 3','generator',VOLTAGES.hv,'Engine room','Third main electrical source.','Source → generator breaker → main bus B','Standby; breaker open','Bus B can be supplied independently of bus A when the tie is open.',880,80,'generator',true),
  n('dg4','Diesel-generator 4','DG 4','generator',VOLTAGES.hv,'Engine room','Fourth main electrical source.','Source → generator breaker → main bus B','Standby; breaker open','This is a representative four-set arrangement, not a particular ship design.',880,145,'generator',true),
  n('busA','Main switchboard · A','BUS A','bus',VOLTAGES.hv,'Engine control room','Receives main generators and distributes medium-voltage power.','DG 1/2 → bus A → propulsion and transformer A','Energized when DG 1 feeds it','A busbar is a common electrical connection inside a switchboard.',260,125,'hv-board',true),
  n('busB','Main switchboard · B','BUS B','bus',VOLTAGES.hv,'Engine control room','Second section of the main medium-voltage switchboard.','DG 3/4 → bus B → thrusters and transformer B','Joined to bus A by closed tie','Opening the bus tie separates the two sections.',700,125,'hv-board',true),
  n('drive','Propulsion drive / converter','DRIVE','drive',VOLTAGES.hv,'Aft machinery space','Conditions electrical supply and controls motor speed and torque.','Bus A → drive → propulsion motor','Feeder closed','The drive sits between the switchboard and motor. It is shown as a functional block; no power-electronic calculations are performed.',195,265,'drive',true),
  n('motor','Electric propulsion motor','MOTOR','motor',VOLTAGES.hv,'Aft machinery space','Turns the propeller shaft using electrical power from the drive.','Drive → motor → propeller','Available when drive is powered','The diesel generators supply electricity; this motor drives the main propeller.',195,355,'motor',true),
  n('prop','Main propeller','PROP','propeller','Mechanical','Stern','Converts motor shaft rotation into thrust.','Motor → propeller','Turns when propulsion motor is supplied','The propeller is mechanically linked to the electric motor only.',195,440,undefined,true),
  n('bow','Bow thruster','BOW','thruster',VOLTAGES.hv,'Forward tunnel','Helps maneuver the bow sideways at low speed.','Bus B → feeder → thruster drive/motor','Feeder open','A simplified thruster assembly represents its motor, shaft, and propeller.',880,265,'thruster',true),
  n('txA','Main transformer A','TX A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space','Steps power down for main low-voltage distribution.',`Bus A → transformer A → ${VOLTAGES.lv} board`,'Connected','Its windings transfer energy magnetically while changing the voltage level.',330,245,'transformer',true),
  n('txB','Main transformer B','TX B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space','Second path to low-voltage distribution.',`Bus B → transformer B → ${VOLTAGES.lv} board`,'Connected',`The two transformer inputs are shown as separate paths to the same provisional ${VOLTAGES.lv} board.`,770,245,'transformer'),
  n('lvBus','Main LV switchboard',VOLTAGES.lv,'bus',VOLTAGES.lv,'Machinery space','Distributes provisional low-voltage power to machinery and services.',`Transformers → ${VOLTAGES.lv} board → feeders`,'Available when either transformer is supplied','This voltage and grouping are provisional teaching assumptions.',550,320,'lv-board',true),
  n('reefer','Reefer distribution','REEFERS','load',VOLTAGES.lv,'Container bays','Feeds grouped refrigerated-container outlets.',`${VOLTAGES.lv} board → reefer feeder → container sockets`,'Feeder open','Reefer sockets are grouped to keep the first-version diagram readable.',405,450,'reefer',true),
  n('reeferUnit','Reefer container · refrigeration unit','REEFER 1','load',VOLTAGES.lv,'Forward cargo bay, outer row','Refrigeration unit of one refrigerated container. Its compressor, condenser fan and controller keep the cargo cold.',`${VOLTAGES.lv} board → reefer feeder → container socket → refrigeration unit`,'Socket breaker closed; supplied when the reefer feeder is closed','A dry container needs no power, but a reefer must be supplied for the whole voyage or its cargo spoils. When the unit is powered its condenser fan turns and its status light turns green.',405,520,undefined,true),
  n('crane','Cargo crane','CRANE','load',VOLTAGES.lv,'Cargo deck','Representative electrically supplied cargo crane.',`${VOLTAGES.lv} board → crane feeder`,'Feeder open','Not every container ship carries its own crane; this is a teaching example.',520,450),
  n('fire','Fire pump','FIRE PUMP','pump',VOLTAGES.lv,'Machinery space','Main-service pump for the ship fire main.',`${VOLTAGES.lv} board → fire-pump feeder`,'Feeder open','This normal fire pump is distinct from the emergency fire pump.',635,450,'pump'),
  n('ballast','Ballast pump','BALLAST','pump',VOLTAGES.lv,'Lower machinery space','Moves ballast water for vessel trim and stability.',`${VOLTAGES.lv} board → ballast feeder`,'Feeder open','The simulator only shows whether supply is connected, not whether a pump is commanded to run.',750,450,'pump'),
  n('bilge','Bilge pump','BILGE','pump',VOLTAGES.lv,'Lower machinery space','Moves collected water from bilge spaces.',`${VOLTAGES.lv} board → bilge feeder`,'Feeder open','Real bilge systems have controls and safeguards beyond this connectivity model.',860,450,'pump'),
  n('cooling','Cooling pump','COOLING','pump',VOLTAGES.lv,'Machinery space','Circulates cooling water for machinery.',`${VOLTAGES.lv} board → cooling feeder`,'Feeder open','Cooling is a representative auxiliary load.',975,450,'pump'),
  n('steering','Steering gear','STEERING','load',VOLTAGES.lv,'Aft steering compartment','Moves the rudder for steering.',`${VOLTAGES.lv} board → steering feeder`,'Feeder open','The emergency scenario includes a separate essential steering service branch.',285,535),
  n('tx220','Consumer transformer','TX CON','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation','Steps power down to the provisional consumer board.',`${VOLTAGES.lv} board → transformer → ${VOLTAGES.consumer} board`,'Connected','Voltage labels are centralized so confirmed references can replace these assumptions.',555,535,'transformer'),
  n('consumer','Consumer distribution',VOLTAGES.consumer,'bus',VOLTAGES.consumer,'Accommodation','Distributes power to ordinary domestic and service loads.',`Consumer transformer → ${VOLTAGES.consumer} board → loads`,`Available when ${VOLTAGES.lv} board is powered`,'This is a simplified single consumer board.',555,615,'lv-board'),
  n('galley','Galley','GALLEY','load',VOLTAGES.consumer,'Accommodation','Representative galley appliances.',`${VOLTAGES.consumer} board → galley feeder`,'Feeder open','Galley equipment is grouped as one representative load.',350,700),
  n('lights','Cabin lights (group)','LIGHTS','load',VOLTAGES.consumer,'Accommodation','Four representative lighting circuits.',`${VOLTAGES.consumer} board → lighting feeder`,'Feeder open','This group represents cabin, corridor, deck, and machinery-space lights.',495,700),
  n('outlets','Service outlets (group)','OUTLETS','load',VOLTAGES.consumer,'Accommodation','Three representative convenience-outlet circuits.',`${VOLTAGES.consumer} board → outlet feeder`,'Feeder open','This group represents cabin, workshop, and bridge outlets.',640,700),
  n('eg','Emergency generator','EM GEN','emergency-generator',VOLTAGES.lv,'Upper deck, separated space','Independent source for selected essential services.','Emergency generator → emergency breaker → emergency board','Standby; breaker open','In this simplified lesson, start it and close its breaker after loss of main power.',80,585,'generator',true),
  n('eBus','Emergency switchboard','EM BUS','emergency-bus',VOLTAGES.lv,'Protected upper-deck space','Distributes emergency-generator power to selected essentials.','Emergency generator → emergency board → essential feeders','Dead until emergency generator connects','The emergency board has no automatic backfeed from the main board in V1.',115,665,'lv-board',true),
  n('eFire','Emergency fire pump','EM FIRE','pump',VOLTAGES.lv,'Separated emergency location','Provides a separate fire-main pumping option.','Emergency board → emergency fire-pump feeder','Feeder closed','Its separate location and supply illustrate resilience.',80,755,'pump'),
  n('eSteer','Essential steering service','EM STEER','load',VOLTAGES.lv,'Aft steering compartment','Representative emergency steering support circuit.','Emergency board → essential steering feeder','Feeder closed','Actual steering requirements depend on vessel design and rules.',220,755),
  n('nav','Bridge / navigation','BRIDGE','load',VOLTAGES.lv,'Bridge','Representative essential bridge and navigation supply.','Emergency board → bridge feeder','Feeder closed','Real navigation supplies can include batteries and UPS units not shown here.',360,755),
  n('eLights','Emergency lighting','EM LIGHT','load',VOLTAGES.lv,'Escape routes','Representative essential lighting circuit.','Emergency board → lighting feeder','Feeder closed','Emergency lighting is kept separate from the ordinary lighting group.',500,755),
  n('shore','Shore connection · future','SHORE','future',VOLTAGES.hv,'Port side deck','Placeholder for a future shore-power lesson.','Not connected in V1','Unavailable','This is deliberately disconnected. Shore connection design needs interlocks, voltage matching, and operating rules before it can be simulated.',80,360,undefined,true)
];

const edge = (id: string, from: string, to: string, name: string, breaker = false, normalClosed = true, model?: ModelType, purpose?: string, lesson?: string): Connection => ({id,from,to,name,breaker,normalClosed,model,purpose,lesson});
export const connections: Connection[] = [
  edge('gb1','dg1','busA','DG 1 breaker',true,true,'breaker'), edge('gb2','dg2','busA','DG 2 breaker',true,false,'breaker'),
  edge('gb3','dg3','busB','DG 3 breaker',true,false,'breaker'), edge('gb4','dg4','busB','DG 4 breaker',true,false,'breaker'),
  edge('tie','busA','busB','Bus-tie vacuum breaker',true,true,'breaker','Joins or separates the two main bus sections.','A closed tie can energize both sections from one running generator. Open it to isolate the sections.'),
  edge('propFeed','busA','drive','Propulsion feeder breaker',true,false,'breaker'), edge('driveMotor','drive','motor','Drive output'), edge('shaft','motor','prop','Propeller shaft'),
  edge('bowFeed','busB','bow','Bow-thruster feeder breaker',true,false,'breaker'),
  edge('txAFeed','busA','txA','Transformer A feeder breaker',true,true,'breaker'), edge('txBFeed','busB','txB','Transformer B feeder breaker',true,true,'breaker'),
  edge('txAOut','txA','lvBus','Transformer A output'), edge('txBOut','txB','lvBus','Transformer B output'),
  edge('reeferFeed','lvBus','reefer','Reefer feeder breaker',true,false,'breaker'), edge('reeferPlug','reefer','reeferUnit','Reefer container socket breaker',true,true,'breaker','Switches the supply to one reefer container through its socket and plug.','Opening this breaker isolates only this container. The reefer feeder and the other sockets are unaffected.'), edge('craneFeed','lvBus','crane','Cargo-crane feeder breaker',true,false,'breaker'),
  edge('fireFeed','lvBus','fire','Fire-pump feeder breaker',true,false,'breaker'), edge('ballastFeed','lvBus','ballast','Ballast-pump feeder breaker',true,false,'breaker'),
  edge('bilgeFeed','lvBus','bilge','Bilge-pump feeder breaker',true,false,'breaker'), edge('coolingFeed','lvBus','cooling','Cooling-pump feeder breaker',true,false,'breaker'),
  edge('steerFeed','lvBus','steering','Steering-gear feeder breaker',true,false,'breaker'),
  edge('tx220Feed','lvBus','tx220','Consumer-transformer feeder breaker',true,true,'breaker'), edge('tx220Out','tx220','consumer','Consumer transformer output'),
  edge('galleyFeed','consumer','galley','Galley feeder breaker',true,false,'breaker'), edge('lightFeed','consumer','lights','Ordinary-lighting feeder breaker',true,false,'breaker'), edge('outletFeed','consumer','outlets','Service-outlet feeder breaker',true,false,'breaker'),
  edge('egBreaker','eg','eBus','Emergency generator breaker',true,false,'breaker'),
  edge('eFireFeed','eBus','eFire','Emergency fire-pump feeder',true,true,'breaker'), edge('eSteerFeed','eBus','eSteer','Essential steering feeder',true,true,'breaker'),
  edge('navFeed','eBus','nav','Bridge / navigation feeder',true,true,'breaker'), edge('eLightFeed','eBus','eLights','Emergency-lighting feeder',true,true,'breaker')
];

export const byId = Object.fromEntries(equipment.map(item => [item.id, item])) as Record<string, Equipment>;
export const edgeById = Object.fromEntries(connections.map(item => [item.id, item])) as Record<string, Connection>;
export const sourceIds = ['dg1','dg2','dg3','dg4','eg'];

export function initialState(): SimState {
  return {
    running: Object.fromEntries(sourceIds.map(id => [id, id === 'dg1'])),
    closed: Object.fromEntries(connections.filter(c => c.breaker).map(c => [c.id, !!c.normalClosed]))
  };
}

export function powered(state: SimState): Set<string> {
  const live = new Set<string>();
  const queue = sourceIds.filter(id => state.running[id]);
  queue.forEach(id => live.add(id));
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    for (const c of connections) {
      if (c.breaker && !state.closed[c.id]) continue;
      // Flow is directional through converters, transformers, and loads.
      // Only the bus tie is bidirectional in this introductory model.
      const next = c.from === here ? c.to : c.id === 'tie' && c.to === here ? c.from : null;
      if (!next || live.has(next) || (sourceIds.includes(next) && !state.running[next])) continue;
      live.add(next);
      queue.push(next);
    }
  }
  return live;
}

export function connectionState(c: Connection, state: SimState, live: Set<string>): 'open'|'live'|'dead' {
  if (c.breaker && !state.closed[c.id]) return 'open';
  return live.has(c.from) && live.has(c.to) ? 'live' : 'dead';
}

export const scenarios = [
  {id:'main', title:'01 · Energize the main bus', instruction:`DG 1 is running with its breaker and the bus tie closed. Both ${VOLTAGES.hv} sections are live.`, apply:():SimState => initialState(), focus:'busA'},
  {id:'propulsion', title:'02 · Supply propulsion', instruction:'Trace DG 1 → bus A → propulsion feeder → drive → electric motor → propeller.', apply:():SimState => {const s=initialState();s.closed.propFeed=true;return s;}, focus:'drive'},
  {id:'tie', title:'03 · Open the bus tie', instruction:'With only DG 1 running, bus B loses power when the tie opens. Start DG 3 and close its breaker to restore bus B independently.', apply:():SimState => {const s=initialState();s.closed.tie=false;return s;}, focus:'tie'},
  {id:'emergency', title:'04 · Restore essentials', instruction:'All main generators are stopped. The separate emergency generator and board supply only their selected essential feeders.', apply:():SimState => {const s=initialState();for(const id of ['dg1','dg2','dg3','dg4'])s.running[id]=false;s.running.eg=true;s.closed.egBreaker=true;return s;}, focus:'eBus'}
] as const;

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { connections, equipment, type SimState, type ModelType, connectionState } from './network';
import { createModel, type ModelInstance } from './models';
import { createVessel, createVesselEquipment } from './vessel';
import { vesselLayout, SHIP, halfBeamAt, hullStart, hullEnd } from './vessel-layout';

const C = { live: 0x0f9b72, dead: 0x6b7f8f, open: 0xdf8a1c, selected: 0x0b2a3b };
const BG = { vessel: 0xdfeaf1, exploded: 0xe9f1f6 };

function renderer(host: HTMLElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
  r.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(r.domElement);
  return r;
}
function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa6b4, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-5, 12, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd8e6, 1); fill.position.set(8, 3, -8); scene.add(fill);
}
function lineBetween(a: THREE.Vector3, b: THREE.Vector3, radius = .024): THREE.Mesh {
  const diff = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(.001, diff.length()), 6), new THREE.MeshBasicMaterial({ color: C.dead, transparent: true, opacity: .5, depthWrite: false }));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
  mesh.userData.path = true;
  return mesh;
}

const SEA_SAMPLES = 80;
/** Animated, translucent sea at the waterline. It is cut out inside the hull outline so the interior stays visible. */
function createSea(): THREE.Mesh {
  const x0 = hullStart - 1, x1 = 19.8, hull: number[] = [];
  for (let i = 0; i < SEA_SAMPLES; i++) {
    const x = x0 + (x1 - x0) * i / (SEA_SAMPLES - 1);
    let hb = halfBeamAt(x, SHIP.waterline);
    if (x >= 14.5 && x <= 19.3) {
      const u = Math.max(0, Math.min(1, (x - 14.5) / 4.8));
      const bulbHb = 0.72 * Math.sin(Math.pow(u, 0.62) * Math.PI);
      hb = Math.max(hb, bulbHb);
    }
    hull.push(hb);
  }
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uHull: { value: hull }, uX0: { value: x0 }, uX1: { value: x1 } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      float wave(vec2 p) {
        return sin(p.x * .42 + uTime * .8) * .5 + sin(p.y * .55 - uTime * .65) * .35 + sin((p.x * .7 + p.y * .9) * .8 + uTime * 1.1) * .25;
      }
      void main() {
        vec3 p = position;
        vWave = wave(p.xz);
        p.y += vWave * .07;
        vec4 world = modelMatrix * vec4(p, 1.);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime, uX0, uX1;
      uniform float uHull[${SEA_SAMPLES}];
      varying vec3 vWorld;
      varying float vWave;
      float hullHalfBeam(float x) {
        float f = (x - uX0) / (uX1 - uX0) * ${SEA_SAMPLES - 1}.;
        if (f < 0. || f > ${SEA_SAMPLES - 1}.) return 0.;
        int i = int(floor(f));
        return mix(uHull[i], uHull[min(i + 1, ${SEA_SAMPLES - 1})], f - float(i));
      }
      void main() {
        vec2 p = vWorld.xz;
        float hb = hullHalfBeam(p.x);
        float d = abs(p.y) - hb;
        if (hb > .02 && d < 0.) discard;
        // Flowing crest lines that drift across the surface.
        float flowA = sin(p.x * 1.1 + sin(p.y * .6 + uTime * .45) * 1.6 - uTime * .9);
        float flowB = sin(p.y * 1.4 - sin(p.x * .5 - uTime * .35) * 1.4 + uTime * .7);
        float crest = smoothstep(.93, 1., flowA) * .55 + smoothstep(.94, 1., flowB) * .45;
        float swell = .5 + .5 * vWave;
        vec3 col = mix(vec3(.13, .43, .62), vec3(.45, .78, .9), swell * .7 + crest * .5);
        // Foam where the water meets the hull.
        float foam = hb > .02 ? (1. - smoothstep(0., .45, d)) * (.55 + .45 * sin(p.x * 4. + p.y * 3. + uTime * 2.)) : 0.;
        float fade = 1. - smoothstep(26., 62., length(p));
        float alpha = (.15 + .08 * swell + crest * .34 + foam * .45) * fade;
        col = mix(col, vec3(.95, 1., 1.), clamp(foam * .8 + crest * .2, 0., 1.));
        gl_FragColor = vec4(col, alpha);
      }`
  });
  const geometry = new THREE.PlaneGeometry(150, 150, 220, 220); geometry.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geometry, material);
  sea.position.y = SHIP.waterline; sea.renderOrder = 2; sea.frustumCulled = false;
  return sea;
}

export class VesselView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(43, 1, .1, 160);
  private controls: OrbitControls;
  private hull = createVessel();
  private objects = new Map<string, THREE.Group>();
  private paths = new Map<string, THREE.Group>();
  private labels = new Map<string, HTMLDivElement>();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown = new THREE.Vector2();
  private live = new Set<string>();
  private state!: SimState;
  private selection = 'busA';
  private labelsVisible = true;
  private phase = 0;
  private sea = createSea();
  private lastTime = 0;
  onSelect: (id: string) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = renderer(host);
    this.scene.background = new THREE.Color(BG.vessel);
    lights(this.scene);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, .5, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 95;
    this.controls.maxPolarAngle = Math.PI * .62;
    this.scene.add(this.hull);
    this.scene.add(this.sea);
    for (const e of equipment) {
      const group = createVesselEquipment(e);
      const placement = vesselLayout[e.id], size = placement.size, inContainer = placement.space === 'cargo';
      const radius = inContainer ? .3 : Math.max(.16, Math.max(size[0], size[2]) / 2 + .06);
      const halo = new THREE.Mesh(new THREE.RingGeometry(radius, radius + .035, 32), new THREE.MeshBasicMaterial({ color: C.dead, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = .012; halo.userData.halo = true;
      // A container's ring sits just outside its refrigeration end, which faces -x when the container is rotated half a turn.
      if (inContainer) halo.position.x = (placement.rotation === Math.PI ? -1 : 1) * (size[0] / 2 + .2);
      group.add(halo);
      this.objects.set(e.id, group); this.scene.add(group);
      const label = document.createElement('div'); label.className = 'vessel-label'; label.textContent = e.short;
      label.dataset.defaultVisible = String(!!e.label3d);
      this.host.appendChild(label); this.labels.set(e.id, label);
    }
    for (const c of connections) {
      const a = this.endpoint(c.from), b = this.endpoint(c.to);
      const group = new THREE.Group();
      // Cable runs follow a longitudinal internal route with short branch connections.
      const points = c.id === 'shaft' || c.id === 'tie' ? [a, b]
        : c.id === 'reeferPlug' ? [a, new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) - .1, (a.z + b.z) / 2), b]
        : [a, new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, a.y, 0),
        new THREE.Vector3(b.x, b.y, 0), b];
      const route = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < points.length; i++) {
        if (points[i - 1].distanceTo(points[i]) < .015) continue;
        route.add(new THREE.LineCurve3(points[i - 1], points[i]));
        group.add(lineBetween(points[i - 1], points[i], c.id === 'shaft' ? .06 : .024));
      }
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(.063, 8, 6), new THREE.MeshBasicMaterial({ color: 0x055a41 }));
      pulse.userData.pulse = true; pulse.userData.route = route; group.add(pulse);
      const gap = new THREE.Mesh(new THREE.TorusGeometry(.095, .021, 6, 14), new THREE.MeshBasicMaterial({ color: C.open, side: THREE.DoubleSide }));
      gap.position.copy(route.getPoint(.45)); gap.userData.gap = true; group.add(gap);
      this.paths.set(c.id, group); this.scene.add(group);
    }
    this.renderer.domElement.addEventListener('pointerdown', e => this.pointerDown.set(e.clientX, e.clientY));
    this.renderer.domElement.addEventListener('click', e => this.click(e));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize(); this.resetCamera(); this.animate(0);
  }
  private endpoint(id: string) {
    const object = this.objects.get(id)!;
    if (id === 'reeferUnit') {
      // The supply plugs into the inlet on the refrigeration end of the container.
      const placement = vesselLayout[id], direction = placement.rotation === Math.PI ? -1 : 1;
      return object.position.clone().add(new THREE.Vector3(direction * (placement.size[0] / 2 + .05), .28, 0));
    }
    const point = object.position.clone(); point.y += object.userData.height * (id === 'motor' ? .45 : .5); return point;
  }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }
  private click(event: MouseEvent) {
    if (this.pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects([...this.objects.values()], true).find(h => h.object.userData.eqId);
    if (hit) this.onSelect(hit.object.userData.eqId as string);
  }
  update(state: SimState, live: Set<string>, selection: string) {
    this.state = state; this.live = live; this.selection = selection;
    for (const [id, group] of this.objects) {
      const halo = group.children.find(o => o.userData.halo) as THREE.Mesh;
      (halo.material as THREE.MeshBasicMaterial).color.setHex(id === selection ? C.selected : live.has(id) ? C.live : C.dead);
      (halo.material as THREE.MeshBasicMaterial).opacity = id === selection ? .95 : .48;
    }
    const reeferOn = live.has('reeferUnit');
    this.objects.get('reeferUnit')?.traverse(o => {
      if (!o.userData.statusLight) return;
      const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      material.color.setHex(reeferOn ? 0x41ff9a : 0x7a2a2a); material.emissive.setHex(reeferOn ? 0x1fb868 : 0x000000);
    });
    for (const c of connections) {
      const status = connectionState(c, state, live);
      for (const child of this.paths.get(c.id)!.children) {
        if (child.userData.pulse) { child.visible = status === 'live' && c.id !== 'shaft'; continue; }
        if (child.userData.gap) { child.visible = status === 'open'; continue; }
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.setHex(c.id === 'shaft' ? 0x5f7a8b : status === 'live' ? C.live : status === 'open' ? C.open : C.dead);
        mat.opacity = c.id === 'shaft' ? .95 : status === 'live' ? .86 : status === 'open' ? .10 : .23;
      }
    }
  }
  setShell(visible: boolean) { this.hull.visible = visible; }
  setLabels(visible: boolean) { this.labelsVisible = visible; }
  focusSelection() {
    const id = this.objects.has(this.selection) ? this.selection : connections.find(c => c.id === this.selection)?.to;
    if (!id) return;
    const bounds = new THREE.Box3().setFromObject(this.objects.get(id)!);
    const target = bounds.getCenter(new THREE.Vector3());
    const distance = Math.max(4.2, bounds.getSize(new THREE.Vector3()).length() * 2.5);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(target); this.camera.position.copy(target).addScaledVector(direction, distance); this.controls.update();
  }
  resetCamera() {
    const distance = Math.max(19.5 / (Math.max(.6, this.camera.aspect) * Math.tan(THREE.MathUtils.degToRad(21.5))), 29);
    this.controls.target.set(0, .5, 0);
    this.camera.position.copy(new THREE.Vector3(-.55, .70, 1).normalize().multiplyScalar(distance).add(this.controls.target));
    this.controls.update();
  }
  private updateLabels() {
    const occupied: { x: number; y: number }[] = [];
    const entries = [...this.labels.entries()].sort(([a], [b]) => Number(b === this.selection) - Number(a === this.selection));
    for (const [id, label] of entries) {
      if (!this.labelsVisible || (label.dataset.defaultVisible !== 'true' && id !== this.selection)) { label.style.display = 'none'; continue; }
      const object = this.objects.get(id)!;
      const point = object.position.clone(); point.y += object.userData.height + .22; point.project(this.camera);
      const x = (point.x + 1) * this.host.clientWidth / 2, y = (-point.y + 1) * this.host.clientHeight / 2;
      const occluded = occupied.some(p => Math.abs(p.x - x) < 57 && Math.abs(p.y - y) < 19);
      const visible = point.z < 1 && x > 18 && x < this.host.clientWidth - 18 && y > 25 && y < this.host.clientHeight - 12 && !occluded;
      label.style.display = visible ? '' : 'none'; if (visible) occupied.push({ x, y });
      label.style.left = `${x}px`; label.style.top = `${y}px`;
      label.classList.toggle('is-live', this.live.has(id)); label.classList.toggle('is-selected', id === this.selection);
    }
  }
  private animate = (time: number) => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(.05, (time - this.lastTime) / 1000);
    this.phase += dt; this.lastTime = time;
    if (!this.host.clientWidth || !this.host.clientHeight) return;
    (this.sea.material as THREE.ShaderMaterial).uniforms.uTime.value = this.phase;
    // The reefer's condenser fan turns only while the container is supplied.
    if (this.live.has('reeferUnit')) this.objects.get('reeferUnit')?.traverse(o => { if (o.userData.spin) o.rotation.x += dt * 9; });
    // Main propulsion propeller spins when propulsion is energized
    if (this.live.has('prop') || this.live.has('motor')) {
      this.objects.get('prop')?.traverse(o => { if (o.userData.spinProp) o.rotation.x += dt * 14; });
    }
    // Bow and stern thrusters spin when energized
    if (this.live.has('bow')) {
      this.objects.get('bow')?.traverse(o => { if (o.userData.spinImpeller) o.rotation.x += dt * 18; });
    }
    if (this.live.has('stern')) {
      this.objects.get('stern')?.traverse(o => { if (o.userData.spinImpeller) o.rotation.x += dt * 18; });
    }
    this.controls.update(); this.updateLabels();
    if (this.state) for (const c of connections) {
      if (connectionState(c, this.state, this.live) !== 'live') continue;
      for (const child of this.paths.get(c.id)!.children) if (child.userData.pulse && child.visible) {
        const route = child.userData.route as THREE.CurvePath<THREE.Vector3>;
        child.position.copy(route.getPoint((this.phase * .22) % 1));
      }
    }
    this.renderer.render(this.scene, this.camera);
  };
}

export class ExplodedView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private instance?: ModelInstance;
  private exploded = false;
  private selectedPart?: string;
  private focused = false;
  private partLabel = document.createElement('div');
  private pointerStart = new THREE.Vector2();
  onPart: (id: string) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = renderer(host); this.scene.background = new THREE.Color(BG.exploded); lights(this.scene);
    this.camera.position.set(5.6, 3.5, 7.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.minDistance = .5; this.controls.maxDistance = 90;
    this.partLabel.className='equipment-part-label';this.partLabel.hidden=true;host.appendChild(this.partLabel);
    this.renderer.domElement.addEventListener('pointerdown',e=>this.pointerStart.set(e.clientX,e.clientY));
    this.renderer.domElement.addEventListener('click', e => this.click(e));
    new ResizeObserver(() => this.resize()).observe(host); this.resize(); this.animate();
  }
  element() { return this.host; }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    if(this.focused)this.focusPart();else this.fitModelView();
  }
  setModel(type?: ModelType) {
    if (this.instance) {
      this.scene.remove(this.instance.group);
      this.instance.group.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose());
        }
      });
    }
    this.instance = type ? createModel(type) : undefined; this.exploded = false; this.selectedPart = undefined;
    this.partLabel.hidden=true;
    if (this.instance) this.scene.add(this.instance.group);
    this.fitModelView();
  }
  private fitModelView() {
    if (!this.instance) return;
    this.focused=false;
    const bounds = new THREE.Box3();
    const boxes:THREE.Box3[]=[];
    for (const part of this.instance.parts) {
      part.group.visible=true;
      const box = new THREE.Box3().setFromObject(part.group);
      const target = this.exploded ? part.exploded : part.base;
      box.translate(target.clone().sub(part.group.position)); bounds.union(box);boxes.push(box);
    }
    this.frameBounds(bounds,boxes);
  }
  private frameBounds(bounds: THREE.Box3,boxes:THREE.Box3[]=[bounds]) {
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(1,.6,1.6).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction,right);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    let distance = 1;
    for(const box of boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const corner=new THREE.Vector3(x,y,z).sub(center),depth=corner.dot(direction);
      distance=Math.max(distance,depth+Math.abs(corner.dot(right))/(tan*this.camera.aspect),depth+Math.abs(corner.dot(up))/tan);
    }
    distance*=1.1;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction,distance);
    this.controls.update();
  }
  resetView() { this.fitModelView(); }
  focusPart() {
    const part=this.instance?.parts.find(p=>p.spec.id===this.selectedPart);
    if(!part)return;
    this.focused=true;
    // Snap to the chosen assembly state before fitting a small component.
    for(const p of this.instance!.parts){p.group.position.copy(this.exploded?p.exploded:p.base);p.group.visible=p===part;}
    this.frameBounds(new THREE.Box3().setFromObject(part.group));
  }
  setExploded(value: boolean) { this.exploded = value; this.fitModelView(); }
  isExploded() { return this.exploded; }
  setPart(id?: string) {
    this.selectedPart = id;
    const index=this.instance?.parts.findIndex(p=>p.spec.id===id)??-1;
    this.partLabel.hidden=index<0;
    if(index>=0)this.partLabel.textContent=`${String(index+1).padStart(2,'0')} · ${this.instance!.parts[index].spec.name}`;
    if(this.focused&&index>=0)this.focusPart();
  }
  private click(event: MouseEvent) {
    if (!this.instance) return;
    if(this.pointerStart.distanceTo(new THREE.Vector2(event.clientX,event.clientY))>5)return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObject(this.instance.group, true).find(h => h.object.userData.partId && (!this.focused || h.object.userData.partId===this.selectedPart));
    const id = hit?.object.userData.partId as string | undefined;
    if (id) { this.setPart(id); this.onPart(id); }
  }
  private animate = () => {
    requestAnimationFrame(this.animate);
    if (!this.host.isConnected || !this.host.clientWidth || !this.host.clientHeight) return;
    this.controls.update();
    if (this.instance) for (const part of this.instance.parts) {
      part.group.position.lerp(this.exploded ? part.exploded : part.base, .13);
      part.group.traverse(o => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).emissive.setHex(part.spec.id === this.selectedPart ? 0x365443 : 0x000000); });
    }
    this.renderer.render(this.scene, this.camera);
  };
}

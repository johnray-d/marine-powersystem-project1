import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { connections, equipment, type SimState, type ModelType, connectionState } from './network';
import { createModel, type ModelInstance } from './models';
import { createVessel, createVesselEquipment } from './vessel';
import { vesselLayout } from './vessel-layout';

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
    const grid = new THREE.GridHelper(48, 48, 0x9db6c4, 0xc3d4de); grid.position.y = -2.85; this.scene.add(grid);
    for (const e of equipment) {
      const group = createVesselEquipment(e);
      const size = vesselLayout[e.id].size;
      const radius = Math.max(.16, Math.max(size[0], size[2]) / 2 + .06);
      const halo = new THREE.Mesh(new THREE.RingGeometry(radius, radius + .035, 32), new THREE.MeshBasicMaterial({ color: C.dead, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = .012; halo.userData.halo = true;
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
      const points = c.id === 'shaft' || c.id === 'tie' ? [a, b] : [a,
        new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, a.y, 0),
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
    this.phase += Math.min(.05, (time - this.lastTime) / 1000); this.lastTime = time;
    if (!this.host.clientWidth || !this.host.clientHeight) return;
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
  onPart: (id: string) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = renderer(host); this.scene.background = new THREE.Color(BG.exploded); lights(this.scene);
    this.camera.position.set(5.6, 3.5, 7.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.minDistance = 3; this.controls.maxDistance = 20;
    this.renderer.domElement.addEventListener('click', e => this.click(e));
    new ResizeObserver(() => this.resize()).observe(host); this.resize(); this.animate();
  }
  element() { return this.host; }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    this.fitModelView();
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
    if (this.instance) this.scene.add(this.instance.group);
    this.fitModelView();
  }
  private fitModelView() {
    if (!this.instance) return;
    const bounds = new THREE.Box3();
    for (const part of this.instance.parts) {
      const box = new THREE.Box3().setFromObject(part.group);
      const target = this.exploded ? part.exploded : part.base;
      box.translate(target.clone().sub(part.group.position)); bounds.union(box);
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(21.5)) * Math.min(1, this.camera.aspect));
    const distance = radius / Math.sin(halfFov) * 1.06;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(new THREE.Vector3(1,.6,1.6).normalize(),distance);
    this.controls.update();
  }
  setExploded(value: boolean) { this.exploded = value; this.fitModelView(); }
  isExploded() { return this.exploded; }
  setPart(id?: string) { this.selectedPart = id; }
  private click(event: MouseEvent) {
    if (!this.instance) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObject(this.instance.group, true).find(h => h.object.userData.partId);
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

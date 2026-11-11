import * as THREE from "three";
import { findModelSeat, modelSeats, modelSpec, tierRows, venueParameters, type CameraMode, type Floor, type ModelSeat, type SeatRef } from "./venue-data";

export type VisibleFloor = "all" | Floor;
export type SceneState = { mode: CameraMode; selected: SeatRef | null; floor: VisibleFloor; lens: 1 | 2 };

export function createVenueScene(canvas: HTMLCanvasElement, onPick: (seat: ModelSeat) => void, onLost: () => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9eee9");
  const camera = new THREE.PerspectiveCamera(43, 1, 0.06, 250);
  scene.add(new THREE.HemisphereLight(0xf6fff9, 0x6a746e, 0.7));
  const key = new THREE.DirectionalLight(0xfff3de, 0.85);
  key.position.set(-15, 30, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9e1ff, 0.35);
  fill.position.set(15, 12, -12);
  scene.add(fill);

  const lower = new THREE.Group(), upper = new THREE.Group(), shell = new THREE.Group();
  scene.add(lower, upper, shell);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const material = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05, ...opts });
    materials.add(m);
    return m;
  };
  const concrete = material("#bac8bf"), stageMat = material("#334b42"), fascia = material("#8d9f93");
  const lightConcrete = material("#d1dcd3"), metal = material("#657b6d", { metalness: 0.4 });
  const dark = material("#33443c"), warm = material("#edc797");
  const own = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
  function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
    const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function line(parent: THREE.Object3D, points: THREE.Vector3[], color = "#83958a") {
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }); materials.add(m);
    const l = new THREE.Line(own(new THREE.BufferGeometry().setFromPoints(points)), m); parent.add(l);
  }
  function label(text: string, x: number, y: number, z: number, width: number, parent: THREE.Object3D = shell, color = "#30493b") {
    const surface = document.createElement("canvas"); surface.width = 512; surface.height = 128;
    const ctx = surface.getContext("2d")!;
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 48px 'Microsoft YaHei', sans-serif"; ctx.fillText(text, 256, 64);
    const map = new THREE.CanvasTexture(surface); map.encoding = THREE.sRGBEncoding; textures.add(map);
    const m = new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }); materials.add(m);
    const sprite = new THREE.Sprite(m); sprite.position.set(x, y, z); sprite.scale.set(width, width / 4, 1); parent.add(sprite);
    return sprite;
  }

  // Open cutaway envelope: no roof or tall near-side wall obscures the seats.
  box(lower, modelSpec.floorWidth, 0.22, modelSpec.floorDepth, 0.975, -0.11, modelSpec.floorDepth / 2, lightConcrete);
  box(shell, 32.03, 0.22, modelSpec.stageDepth, 0, -0.11, -modelSpec.stageDepth / 2, concrete);
  for (const x of [-13.55, 15.5]) {
    box(shell, 0.18, 0.55, 38.58, x, 0.275, 10.29, concrete);
    line(shell, [new THREE.Vector3(x, 0.6, -9), new THREE.Vector3(x, 0.6, 29.58)]);
  }
  const stageShape = new THREE.Shape();
  stageShape.moveTo(-10, 0); stageShape.lineTo(10, 0); stageShape.lineTo(8.5, -4.5);
  stageShape.lineTo(6.5, -9); stageShape.lineTo(-6.5, -9); stageShape.lineTo(-8.5, -4.5); stageShape.closePath();
  // Extrusion local XY is mapped to world XZ; local depth becomes world Y.
  const stageGeometry = own(new THREE.ExtrudeGeometry(stageShape, { depth: modelSpec.stageHeight, bevelEnabled: false }));
  stageGeometry.rotateX(Math.PI / 2);
  stageGeometry.translate(0, modelSpec.stageHeight, 0);
  // rotateX(+pi/2) maps shape Y to world Z and extrusion Z to -Y.
  const stage = new THREE.Mesh(stageGeometry, stageMat); shell.add(stage);
  label("STAGE / 舞台", 0, 1.65, -2, 6, shell, "#f5e4c8");
  for (let i = 0; i < 3; i++) box(shell, 3, 0.5, 0.32, -10.8, 0.25 + i * 0.5, -1 - i * 0.32, fascia);

  const screenCanvas = document.createElement("canvas"); screenCanvas.width = 1024; screenCanvas.height = 512;
  const ctx = screenCanvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 1024, 512); gradient.addColorStop(0, "#113e35"); gradient.addColorStop(0.5, "#406455"); gradient.addColorStop(1, "#172d33");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = "#c1e6ba35"; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse(512, 260, 100 + i * 50, 40 + i * 27, -0.3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "#f1e7cc"; ctx.textAlign = "center"; ctx.font = "500 78px sans-serif"; ctx.fillText("L I V E R S E", 512, 255);
  ctx.fillStyle = "#d3e5d9"; ctx.font = "24px sans-serif"; ctx.fillText("SHANGHAI  /  LIVE IN THE MOMENT", 512, 308);
  const screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.encoding = THREE.sRGBEncoding; textures.add(screenTexture);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, side: THREE.DoubleSide }); materials.add(screenMat);
  const screenPositions: number[] = [], screenUvs: number[] = [], screenIndices: number[] = [];
  const halfAngle = modelSpec.screenWidth / (2 * modelSpec.screenRadius);
  for (let i = 0; i <= 72; i++) {
    const theta = -halfAngle + 2 * halfAngle * i / 72;
    const x = modelSpec.screenRadius * Math.sin(theta), z = -9 + modelSpec.screenRadius * (1 - Math.cos(theta));
    screenPositions.push(x, modelSpec.screenBottom, z, x, modelSpec.screenBottom + modelSpec.screenHeight, z);
    screenUvs.push(i / 72, 0, i / 72, 1);
    if (i < 72) { const j = i * 2; screenIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const screenGeometry = own(new THREE.BufferGeometry());
  screenGeometry.setAttribute("position", new THREE.Float32BufferAttribute(screenPositions, 3));
  screenGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(screenUvs, 2)); screenGeometry.setIndex(screenIndices); screenGeometry.computeVertexNormals();
  shell.add(new THREE.Mesh(screenGeometry, screenMat));

  const foh = venueParameters.foh;
  box(lower, foh.width_x_m, foh.height_y_m, foh.depth_z_m, 0, foh.height_y_m / 2, (foh.front_z_m + foh.rear_z_m) / 2, dark);
  box(lower, 2.8, 0.08, 6.7, 0, 1.24, 17.5, metal);
  for (const z of [15.4, 17.5, 19.5]) box(lower, 1.4, 0.32, 0.55, 0, 1.42, z, stageMat);
  const overviewLabels = [label("FOH / 控台", 0, 2.3, 17.5, 3.5, lower), label("1F · 800", -12.3, 1, 7, 3, lower), label("2F · 408", 12.4, 10.8, 22, 3, upper)];

  const centerZ = venueParameters.floor2.center_web_xz_m[1];
  const radiusPoint = (r: number, x: number, y: number) => new THREE.Vector3(x, y, centerZ + Math.sqrt(r * r - x * x));
  function tierStrip(inner: number, outer: number, minX: number, maxX: number, top: number, bottom: number, mat: THREE.Material) {
    const verts: number[] = [], indices: number[] = [], segments = Math.max(4, Math.ceil((maxX - minX) * 4));
    for (let i = 0; i <= segments; i++) {
      const x = minX + (maxX - minX) * i / segments;
      const a = radiusPoint(inner, x, top), b = radiusPoint(outer, x, top);
      verts.push(a.x, top, a.z, b.x, top, b.z, a.x, bottom, a.z, b.x, bottom, b.z);
      if (i < segments) { const j = i * 4; indices.push(j, j + 1, j + 4, j + 1, j + 5, j + 4, j, j + 4, j + 2, j + 2, j + 4, j + 6, j + 1, j + 3, j + 5, j + 3, j + 7, j + 5); }
    }
    // Close each end of the strip.
    const end = segments * 4; indices.push(0, 2, 1, 1, 2, 3, end, end + 1, end + 2, end + 1, end + 3, end + 2);
    const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(indices); g.computeVertexNormals();
    upper.add(new THREE.Mesh(g, mat));
  }
  for (const row of tierRows) {
    const inner = row.inner_radius_m!, outer = row.outer_radius_m!, height = row.ground_y_m;
    // Keep the two walking aisles free of chairs; subdivide each 495mm rise into three 165mm steps.
    tierStrip(inner, outer, -12.55, -5.65, height, height - 0.495, concrete);
    tierStrip(inner, outer, -4.65, 4.65, height, height - 0.495, concrete);
    tierStrip(inner, outer, 5.65, 12.55, height, height - 0.495, concrete);
    for (const [a, b] of [[-5.65, -4.65], [4.65, 5.65]]) for (let i = 0; i < 3; i++) {
      tierStrip(inner + i * 0.3, inner + (i + 1) * 0.3, a, b, height - 0.33 + i * 0.165, height - 0.495, lightConcrete);
    }
    const points = Array.from({ length: 73 }, (_, i) => radiusPoint(inner, -12.55 + 25.1 * i / 72, height + 0.007));
    line(upper, points, "#789082");
  }
  const first = tierRows[0];
  const frontRadius = first.inner_radius_m!;
  const railPoints = Array.from({ length: 73 }, (_, i) => radiusPoint(frontRadius, -12.55 + 25.1 * i / 72, 5.35));
  line(upper, railPoints, "#466352");
  for (let x = -12; x <= 12; x += 2) {
    const p = radiusPoint(frontRadius, x, 4.3);
    box(upper, 0.035, 1.05, 0.035, p.x, 4.825, p.z, metal);
  }
  // Simplified hanging equipment at source AABB centers; no fabricated detailed speaker mesh.
  for (const [x, y, z] of [[-7.8368, 12.8338, -3.5008], [8.7135, 12.8508, -2.9082]]) {
    box(shell, 1.12, 5.298, 2.161, x, y, z, dark);
    box(shell, 0.035, 4.8, 0.035, x, y + 5, z, metal);
  }
  for (const x of [-11, 11]) {
    box(shell, 0.12, 0.12, 8, x, 15.5, -4.5, metal);
    for (const z of [-7.5, -4.5, -1.5]) box(shell, 0.24, 0.35, 0.3, x, 15.22, z, dark);
  }
  const human = new THREE.Group(); shell.add(human);
  const body = new THREE.Mesh(own(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 12)), warm); body.position.set(0, 2.18, -3.8); human.add(body);
  const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.15, 12, 10)), warm); head.position.set(0, 2.88, -3.8); human.add(head);

  const seatsGroup = new THREE.Group(); scene.add(seatsGroup);
  const chairMaterial = material("#ffffff");
  const baseColor = (s: ModelSeat) => s.obstructed ? "#63706a" : s.floor === "2F" ? "#c79152" : s.row <= 12 ? "#759681" : s.row <= 19 ? "#5c8b86" : "#81928b";
  const chairParts = [
    { size: [0.52, 0.1, 0.54], offset: [0, 0.40, 0] },
    { size: [0.52, 0.45, 0.08], offset: [0, 0.675, 0.26] },
    { size: [0.065, 0.35, 0.065], offset: [-0.19, 0.175, -0.19] },
    { size: [0.065, 0.35, 0.065], offset: [0.19, 0.175, -0.19] },
    { size: [0.065, 0.35, 0.065], offset: [-0.19, 0.175, 0.19] },
    { size: [0.065, 0.35, 0.065], offset: [0.19, 0.175, 0.19] },
  ];
  const seatMeshes = chairParts.map((part) => {
    const g = own(new THREE.BoxGeometry(...part.size as [number, number, number])); g.translate(...part.offset as [number, number, number]);
    const mesh = new THREE.InstancedMesh(g, chairMaterial, modelSeats.length); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    seatsGroup.add(mesh); return mesh;
  });
  const dummy = new THREE.Object3D();
  const selectedMarker = new THREE.Mesh(own(new THREE.TorusGeometry(0.44, 0.045, 6, 40)), material("#ef653e", { emissive: "#ef653e", emissiveIntensity: 0.3 }));
  selectedMarker.rotation.x = -Math.PI / 2; scene.add(selectedMarker);
  let state: SceneState = { mode: "场馆总览", selected: null, floor: "all", lens: 1 };
  let disposed = false, frame = 0, lost = false;
  let azimuth = 0.67, polar = 0.88, distance = 66, lookYaw = 0, lookPitch = 0;
  let cameraReady = false;
  const target = new THREE.Vector3(0, 3.7, 9);
  const requestRender = () => { if (!disposed && !lost && !frame) frame = requestAnimationFrame(render); };
  function pose() {
    const selected = findModelSeat(state.selected);
    const audience = state.mode !== "场馆总览" && selected;
    if (audience) {
      camera.position.set(selected.position[0], selected.position[1] + modelSpec.eyeHeight, selected.position[2] - 0.06);
      const base = new THREE.Vector3(...modelSpec.target).sub(camera.position).normalize();
      const heading = Math.atan2(base.x, -base.z) + lookYaw;
      const pitch = Math.asin(base.y) + lookPitch;
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), -Math.cos(heading) * Math.cos(pitch))));
      camera.fov = state.mode === "手机取景" ? (state.lens === 2 ? 32 : 60) : 66;
    } else {
      camera.position.set(target.x + distance * Math.sin(polar) * Math.sin(azimuth), target.y + distance * Math.cos(polar), target.z + distance * Math.sin(polar) * Math.cos(azimuth));
      camera.lookAt(target); camera.fov = 43;
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); cameraReady = true;
    canvas.dataset.cameraPosition = camera.position.toArray().join(",");
    canvas.dataset.cameraQuaternion = camera.quaternion.toArray().join(",");
    canvas.dataset.cameraFov = String(camera.fov);
    canvas.dataset.cameraMode = audience ? state.mode : "场馆总览";
  }
  function render() {
    frame = 0; if (disposed || lost) return;
    pose(); renderer.render(scene, camera);
    canvas.dataset.ready = "true";
  }
  function update(next: SceneState) {
    const changed = state.mode !== next.mode || findModelSeat(state.selected)?.id !== findModelSeat(next.selected)?.id;
    state = next;
    if (changed) { lookYaw = 0; lookPitch = 0; }
    const selected = findModelSeat(state.selected), audience = state.mode !== "场馆总览" && !!selected;
    lower.visible = audience || state.floor !== "2F"; upper.visible = audience || state.floor !== "1F";
    for (const item of overviewLabels) item.visible = !audience;
    selectedMarker.visible = !!selected && !audience && (state.floor === "all" || state.floor === selected.floor);
    if (selected) selectedMarker.position.set(selected.position[0], selected.position[1] + 0.04, selected.position[2]);
    let visible = 0;
    modelSeats.forEach((seat, i) => {
      const show = (audience || state.floor === "all" || state.floor === seat.floor) && !(audience && selected?.id === seat.id);
      if (show) visible++;
      dummy.position.set(...seat.position); dummy.rotation.set(0, seat.yaw, 0); dummy.scale.setScalar(show ? 1 : 0); dummy.updateMatrix();
      for (const mesh of seatMeshes) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(selected?.id === seat.id ? "#ef653e" : baseColor(seat))); }
    });
    for (const mesh of seatMeshes) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    canvas.dataset.seatCount = String(modelSeats.length); canvas.dataset.visibleSeatCount = String(visible);
    canvas.dataset.selectedId = selected?.id ?? ""; canvas.dataset.floor = state.floor;
    requestRender();
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false); camera.aspect = bounds.width / bounds.height;
    if (!cameraReady) distance = overviewDistance();
    requestRender();
  }
  const raycaster = new THREE.Raycaster();
  function pick(clientX: number, clientY: number) {
    if (state.mode !== "场馆总览" || !cameraReady) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
    // Include solid geometry so seats hidden by a tread, screen or booth cannot be selected through it.
    const hits = raycaster.intersectObjects(scene.children, true);
    const hit = hits.find((h) => {
      let o: THREE.Object3D | null = h.object;
      while (o) { if (!o.visible) return false; o = o.parent; }
      return h.object instanceof THREE.Mesh && h.object !== selectedMarker;
    });
    if (hit?.instanceId !== undefined && seatMeshes.some((mesh) => mesh === hit.object)) {
      const seat = modelSeats[hit.instanceId];
      if (state.floor === "all" || state.floor === seat.floor) onPick(seat);
    }
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureStart = { x: 0, y: 0 }, moved = false, pinchDistance = 0;
  const pinch = () => { const p = [...pointers.values()]; return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; };
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { gestureStart = { x: e.clientX, y: e.clientY }; moved = false; }
    else moved = true;
    pinchDistance = pinch(); canvas.focus({ preventScroll: true });
  }
  function move(e: PointerEvent) {
    const previous = pointers.get(e.pointerId); if (!previous) return;
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - gestureStart.x, e.clientY - gestureStart.y) > 5) moved = true;
    if (!moved) return;
    if (pointers.size >= 2) {
      const next = pinch(); if (pinchDistance && state.mode === "场馆总览") distance = THREE.MathUtils.clamp(distance * pinchDistance / next, 24, 100);
      pinchDistance = next;
    } else if (state.mode === "场馆总览" || !findModelSeat(state.selected)) {
      azimuth -= dx * 0.007; polar = THREE.MathUtils.clamp(polar - dy * 0.006, 0.08, 1.46);
    } else { lookYaw -= dx * 0.004; lookPitch = THREE.MathUtils.clamp(lookPitch + dy * 0.004, -0.65, 0.65); }
    requestRender();
  }
  function up(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const click = pointers.size === 1 && !moved && e.type === "pointerup";
    pointers.delete(e.pointerId); if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (click) pick(e.clientX, e.clientY);
  }
  function zoom(factor: number) { if (state.mode === "场馆总览") { distance = THREE.MathUtils.clamp(distance * factor, 24, 100); requestRender(); } }
  function wheel(e: WheelEvent) { e.preventDefault(); zoom(Math.exp(Math.max(-150, Math.min(150, e.deltaY)) * 0.002)); }
  function keydown(e: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "Home"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Home") reset();
    else if (e.key === "+" || e.key === "-") zoom(e.key === "+" ? 0.85 : 1.15);
    else if (state.mode === "场馆总览") {
      azimuth += e.key === "ArrowLeft" ? -0.1 : e.key === "ArrowRight" ? 0.1 : 0;
      polar = THREE.MathUtils.clamp(polar + (e.key === "ArrowUp" ? -0.1 : e.key === "ArrowDown" ? 0.1 : 0), 0.08, 1.46);
    } else { lookYaw += e.key === "ArrowLeft" ? -0.08 : e.key === "ArrowRight" ? 0.08 : 0; lookPitch = THREE.MathUtils.clamp(lookPitch + (e.key === "ArrowUp" ? 0.08 : e.key === "ArrowDown" ? -0.08 : 0), -0.65, 0.65); }
    requestRender();
  }
  function overviewDistance() { return Math.min(110, 66 / Math.min(1, camera.aspect)); }
  function reset() { azimuth = 0.67; polar = 0.88; distance = overviewDistance(); lookYaw = 0; lookPitch = 0; requestRender(); }
  function topView() { azimuth = 0; polar = 0.08; distance = Math.max(58, 36 / (2 * Math.tan(43 * Math.PI / 360) * camera.aspect)); requestRender(); }
  function contextLost(e: Event) { if (disposed) return; e.preventDefault(); lost = true; canvas.dataset.ready = "false"; onLost(); }
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("webglcontextlost", contextLost);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); update(state);
  return {
    update, reset, topView, zoom,
    dispose() {
      disposed = true; if (frame) cancelAnimationFrame(frame); observer.disconnect(); pointers.clear();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}

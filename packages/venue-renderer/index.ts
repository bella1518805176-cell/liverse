import type * as Three from "three";
import type { Layout, PositionRef } from "../contracts";
import { cameraAt } from "../venue-core";
export type RendererPlatform = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  requestFrame(cb: FrameRequestCallback): number;
  cancelFrame(id: number): void;
};
export function createVenueRenderer(
  THREE: typeof Three,
  platform: RendererPlatform,
  layout: Layout,
) {
  if (!layout.demo)
    throw new Error(
      "Official model adapter requires asset calibration and device verification",
    );
  const renderer = new THREE.WebGLRenderer({
    canvas: platform.canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(platform.dpr, 2));
  renderer.setSize(platform.width, platform.height, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171b21");
  const camera = new THREE.PerspectiveCamera(
    60,
    platform.width / platform.height,
    0.1,
    150,
  );
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(0, 15, 5);
  scene.add(light);
  const geometries: Three.BufferGeometry[] = [];
  const materials: Three.Material[] = [];
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
  ) {
    const geometry = new THREE.BoxBufferGeometry(w, h, d),
      material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    return mesh;
  }
  box(33, 0.3, 44, 0, -0.3, 18, 0x303840);
  box(29, 1.3, 6, 0, 0.5, -1.5, 0x252b33);
  box(27, 6, 0.25, 0, 4, -4, 0xff5018);
  box(0.35, 10, 44, -16.5, 5, 18, 0x434a52);
  box(0.35, 10, 44, 16.5, 5, 18, 0x434a52);
  box(33, 10, 0.35, 0, 5, 40, 0x434a52);
  // Development geometry keeps balcony slabs, rails and columns in audience views.
  box(28, 0.5, 14, 0, 4.7, 30, 0x3f4853);
  box(28, 1, 0.15, 0, 5.5, 23.2, 0x6b737a);
  box(0.5, 6, 0.5, -12, 2.7, 23, 0x6b737a);
  box(0.5, 6, 0.5, 12, 2.7, 23, 0x6b737a);
  const geometry = new THREE.BoxBufferGeometry(0.72, 0.8, 0.72);
  const material = new THREE.MeshLambertMaterial({ color: 0xa1afb9 });
  geometries.push(geometry);
  materials.push(material);
  const seats = new THREE.InstancedMesh(
    geometry,
    material,
    layout.seats.length,
  );
  const matrix = new THREE.Matrix4();
  layout.seats.forEach((s, i) => {
    matrix.makeTranslation(s.x, s.y + 0.4, s.z);
    seats.setMatrixAt(i, matrix);
  });
  seats.frustumCulled = false;
  scene.add(seats);
  const marker = box(0.8, 0.12, 0.8, 0, 0, 0, 0xff5018);
  let disposed = false,
    frame = 0,
    active = false,
    lastPosition: PositionRef | null = null,
    standing = false,
    yaw = 0,
    pitch = 0;
  const render = () => {
    if (disposed || !active) return;
    renderer.render(scene, camera);
    frame = platform.requestFrame(render);
  };
  const reset = () => {
    yaw = 0;
    pitch = 0;
    camera.fov = 60;
    camera.updateProjectionMatrix();
    if (lastPosition) {
      const c = cameraAt(layout, lastPosition, standing);
      camera.position.set(c.position.x, c.position.y, c.position.z);
      camera.lookAt(new THREE.Vector3(c.target.x, c.target.y, c.target.z));
      marker.position.set(
        c.position.x,
        c.position.y - (standing ? 1.65 : 1.2) + 0.1,
        c.position.z,
      );
    } else {
      camera.position.set(28, 28, 48);
      camera.lookAt(new THREE.Vector3(0, 0, 15));
    }
  };
  const api = {
    select(p: PositionRef, isStanding = false) {
      lastPosition = p;
      standing = isStanding;
      reset();
    },
    overview() {
      lastPosition = null;
      reset();
    },
    reset,
    look(dx: number, dy: number) {
      if (!lastPosition) return;
      yaw += dx * 0.005;
      pitch = Math.max(-0.8, Math.min(0.8, pitch + dy * 0.005));
      const c = cameraAt(layout, lastPosition, standing);
      const base = Math.atan2(
        c.target.x - c.position.x,
        c.position.z - c.target.z,
      );
      camera.lookAt(
        new THREE.Vector3(
          camera.position.x + Math.sin(base + yaw) * 20,
          camera.position.y - Math.sin(pitch) * 20,
          camera.position.z - Math.cos(base + yaw) * 20,
        ),
      );
    },
    pause() {
      active = false;
      platform.cancelFrame(frame);
    },
    resume() {
      if (!active && !disposed) {
        active = true;
        render();
      }
    },
    screenshot() {
      renderer.render(scene, camera);
      return platform.canvas.toDataURL("image/png");
    },
    destroy() {
      disposed = true;
      active = false;
      platform.cancelFrame(frame);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      while (scene.children.length) scene.remove(scene.children[0]);
    },
  };
  reset();
  api.resume();
  return api;
}

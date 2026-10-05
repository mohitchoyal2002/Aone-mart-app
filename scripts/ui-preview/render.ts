import * as THREE from "three";
import {
  groceryModel,
  createGroceryScene,
} from "../../apps/mobile/src/grocery-models";
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(1024, 1024);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe0f5ed, 0x223556, 2.6));
const key = new THREE.DirectionalLight(0xffe5d0, 3.5);
key.position.set(4, 5, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8f6e1, 2);
rim.position.set(-4, 3, -2);
scene.add(rim);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
async function capture(name: string) {
  const group =
    name === "grocery-poster"
      ? createGroceryScene()
      : groceryModel(name as Parameters<typeof groceryModel>[0], 2);
  if (name !== "grocery-poster") {
    group.position.y = -0.8;
    group.rotation.y = -0.32;
  }
  scene.add(group);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const distance =
    (Math.max(size.x, size.y, size.z) /
      (2 * Math.tan(THREE.MathUtils.degToRad(17.5)))) *
    1.38;
  camera.position
    .copy(center)
    .add(new THREE.Vector3(0.48, 0.28, 1).normalize().multiplyScalar(distance));
  camera.lookAt(center);
  renderer.render(scene, camera);
  await fetch(`/capture/${name}`, {
    method: "POST",
    body: renderer.domElement.toDataURL("image/png"),
  });
  scene.remove(group);
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(
        (m) => m.dispose(),
      );
    }
  });
}
(window as any).captureAll = async () => {
  for (const name of [
    "bag",
    "carton",
    "apple",
    "banana",
    "broccoli",
    "loaf",
    "bottle-oil",
    "cookie",
    "cup-tea",
    "carrot",
    "grocery-poster",
  ])
    await capture(name);
  return "11 assets rendered at 1024 × 1024";
};

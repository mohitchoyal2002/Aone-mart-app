import * as THREE from "three";
import models from "../assets/models/groceries.json";

// Kenney Food Kit (CC0), baked to vertex colours so native Three.js needs no
// browser image decoder, remote textures or runtime asset downloads.
export function groceryModel(name: keyof typeof models, height: number) {
  const source = models[name];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(source.positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(source.normals, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(source.colors, 3),
  );
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.02,
    }),
  );
  mesh.name = name;
  mesh.scale.setScalar(height / size.y);
  return mesh;
}

export function createGroceryScene() {
  const groceries = new THREE.Group();
  const placements: [
    keyof typeof models,
    number,
    number,
    number,
    number,
    number,
  ][] = [
    ["bag", 1.55, 0, -0.65, 0, -0.12],
    ["carton", 1.25, 0.3, 0.1, -0.15, -0.15],
    ["broccoli", 1, -0.5, 0.38, -0.38, 0.28],
    ["apple", 0.6, -0.63, 0.65, 0.22, 0.1],
    ["banana", 0.63, 0.6, 0.63, 0.24, -0.35],
    ["loaf", 0.45, 1.1, -0.45, 0.3, 0.25],
  ];
  for (const [name, height, x, y, z, turn] of placements) {
    const model = groceryModel(name, height);
    model.position.set(x, y, z);
    model.rotation.z = turn;
    groceries.add(model);
  }
  return groceries;
}

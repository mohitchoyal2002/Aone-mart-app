import React, { useRef, useState, useEffect } from "react";
import { View } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import Renderer from "expo-three/build/Renderer";
import * as THREE from "three";
import { animate, engine } from "animejs";
import { BrandMark } from "./brand";
import { useMotion } from "./motion";

// Run the object animation engine from the scene's capped native frame loop.
// No browser DOM, remote models, texture downloads or continuous background loop.
engine.useDefaultMainLoop = false;

export function BasketScene({ active = true }: { active?: boolean }) {
  const { enabled } = useMotion();
  const [failed, setFailed] = useState(false);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  const start = (gl: ExpoWebGLRenderingContext) => {
    cleanup.current();
    let disposed = false,
      frame = 0;
    const scene = new THREE.Scene();
    let renderer: Renderer | undefined;
    let rotation: ReturnType<typeof animate> | undefined;
    let float: ReturnType<typeof animate> | undefined;
    const release = () => {
      disposed = true;
      cancelAnimationFrame(frame);
      rotation?.cancel();
      float?.cancel();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer?.dispose();
    };
    cleanup.current = release;
    try {
      renderer = new Renderer({
        gl,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        alpha: true,
        antialias: false,
        pixelRatio: 1,
      });
      renderer.setClearColor(0x000000, 0);
      const camera = new THREE.PerspectiveCamera(
        40,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        50,
      );
      camera.position.set(3.1, 2.5, 5.6);
      camera.lookAt(0, 0.4, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 2));
      const light = new THREE.DirectionalLight(0xfff5ce, 3);
      light.position.set(4, 5, 3);
      scene.add(light);
      const basket = new THREE.Group();
      scene.add(basket);
      const gold = new THREE.MeshStandardMaterial({
        color: 0xf4cf78,
        roughness: 0.65,
      });
      const cream = new THREE.MeshStandardMaterial({
        color: 0xfff4d6,
        roughness: 0.8,
      });
      const mint = new THREE.MeshStandardMaterial({
        color: 0x81b987,
        roughness: 0.8,
      });
      const bar = (
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        material: THREE.Material = gold,
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        basket.add(mesh);
        return mesh;
      };
      bar(2, 0.14, 1.2, 0, -0.4, 0);
      bar(2.3, 0.16, 1.45, 0, 0.65, 0);
      for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) {
        bar(0.11, 0.92, 0.1, x, 0.13, 0.62);
        bar(0.11, 0.92, 0.1, x, 0.13, -0.62);
      }
      for (const z of [-0.5, 0, 0.5]) {
        bar(0.1, 0.95, 0.12, -1, 0.13, z);
        bar(0.1, 0.95, 0.12, 1, 0.13, z);
      }
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.075, 7, 22, Math.PI),
        cream,
      );
      handle.position.set(0, 0.65, 0);
      basket.add(handle);
      const apple = new THREE.Mesh(
        new THREE.SphereGeometry(0.37, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xe97357, roughness: 0.7 }),
      );
      apple.position.set(-0.53, 0.8, 0.1);
      basket.add(apple);
      const orange = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf3b747, roughness: 0.8 }),
      );
      orange.position.set(0.52, 0.78, 0.22);
      basket.add(orange);
      const milk = bar(0.47, 1.05, 0.45, 0.05, 1, -0.3, cream);
      milk.rotation.z = -0.14;
      bar(0.49, 0.24, 0.47, 0.05, 1.06, -0.3, mint);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), mint);
      leaf.scale.set(1.5, 0.3, 0.7);
      leaf.position.set(-0.38, 1.14, 0.05);
      leaf.rotation.z = 0.5;
      basket.add(leaf);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.25, 24),
        new THREE.MeshBasicMaterial({
          color: 0x062c25,
          transparent: true,
          opacity: 0.16,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.57;
      scene.add(shadow);
      rotation = animate(basket.rotation, {
        y: [-0.28, 0.32],
        duration: 3800,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      });
      float = animate(basket.position, {
        y: [0, 0.12],
        duration: 2400,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      });
      let last = 0;
      const render = (time: number) => {
        if (disposed) return;
        frame = requestAnimationFrame(render);
        if (time - last < 33) return;
        last = time;
        try {
          engine.update();
          renderer!.render(scene, camera);
          gl.endFrameEXP();
        } catch {
          release();
          setFailed(true);
        }
      };
      render(0);
    } catch {
      release();
      setFailed(true);
    }
  };
  // Unmount the GL surface whenever motion is stopped or it scrolls out of view.
  useEffect(() => {
    if (!enabled || !active) cleanup.current();
  }, [enabled, active]);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: 160, height: 175 }}
    >
      {!enabled || !active || failed ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <BrandMark size={145} />
        </View>
      ) : (
        <GLView style={{ width: 160, height: 175 }} onContextCreate={start} />
      )}
    </View>
  );
}

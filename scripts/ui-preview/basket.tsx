import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import * as THREE from "three";
import { createGroceryScene } from "../../apps/mobile/src/grocery-models";
import { useMotion } from "../../apps/mobile/src/motion";
export function BasketScene({
  width = 230,
  height = 245,
  active = true,
  reaction = 0,
}) {
  const { enabled } = useMotion();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !enabled || !active) return;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      g = createGroceryScene();
    scene.add(g);
    scene.add(new THREE.HemisphereLight(0xe0f5ed, 0x223556, 2.6));
    const key = new THREE.DirectionalLight(0xffe5d0, 3.5);
    key.position.set(4, 5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa8f6e1, 2);
    rim.position.set(-4, 3, -2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(2.2, 1.8, 4.6);
    camera.lookAt(0.15, 0.35, 0);
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / 30) return;
      last = now;
      g.rotation.y = Math.sin(now / 3800) * 0.25;
      g.position.y = Math.sin(now / 2400) * 0.06;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, enabled, width, height]);
  return (
    <View pointerEvents="none" style={{ width, height }}>
      {active && enabled ? (
        <div ref={host} />
      ) : (
        <Image
          source={require("../../apps/mobile/assets/models/grocery-poster.png")}
          contentFit="contain"
          style={{ width, height }}
        />
      )}
    </View>
  );
}

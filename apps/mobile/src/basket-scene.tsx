import React, { useRef, useState, useEffect } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import Renderer from "expo-three/build/Renderer";
import * as THREE from "three";
import { animate, engine } from "animejs";
import { createGroceryScene } from "./grocery-models";
import { useMotion } from "./motion";

// Run the object animation engine from the scene's capped native frame loop.
// Bundled CC0 food models render without remote textures or a browser DOM.
engine.useDefaultMainLoop = false;

export function BasketScene({
  active = true,
  reaction = 0,
  width = 230,
  height = 245,
}: {
  active?: boolean;
  reaction?: number;
  width?: number;
  height?: number;
}) {
  const { enabled } = useMotion();
  const [failed, setFailed] = useState(false);
  const cleanup = useRef<() => void>(() => {});
  const sceneGroup = useRef<THREE.Group | null>(null);
  const tapAnimation = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => {
    if (!enabled || !active || !sceneGroup.current) return;
    tapAnimation.current?.cancel();
    sceneGroup.current.scale.setScalar(1);
    tapAnimation.current = animate(sceneGroup.current.scale, {
      x: [1, 1.07, 1],
      y: [1, 1.07, 1],
      z: [1, 1.07, 1],
      duration: 440,
      ease: "out(3)",
    });
    return () => {
      tapAnimation.current?.cancel();
    };
  }, [reaction, enabled, active]);
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
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      rotation?.cancel();
      float?.cancel();
      tapAnimation.current?.cancel();
      sceneGroup.current = null;
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
        antialias: true,
        pixelRatio: 1,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const camera = new THREE.PerspectiveCamera(
        40,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        50,
      );
      camera.position.set(2.2, 1.8, 4.6);
      camera.lookAt(0.15, 0.35, 0);
      scene.add(new THREE.HemisphereLight(0xe0f5ed, 0x223556, 2.6));
      const light = new THREE.DirectionalLight(0xffe5d0, 3.5);
      light.position.set(4, 5, 3);
      scene.add(light);
      const basket = createGroceryScene();
      sceneGroup.current = basket;
      scene.add(basket);
      const rim = new THREE.DirectionalLight(0xa8f6e1, 2);
      rim.position.set(-4, 3, -2);
      scene.add(rim);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.25, 24),
        new THREE.MeshBasicMaterial({
          color: 0x061121,
          transparent: true,
          opacity: 0.16,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.7;
      scene.add(shadow);
      rotation = animate(basket.rotation, {
        y: [-0.2, 0.25],
        duration: 3800,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      });
      float = animate(basket.position, {
        y: [0, 0.09],
        duration: 2400,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      });
      let last = 0;
      let reported = false;
      const render = (time: number) => {
        if (disposed) return;
        frame = requestAnimationFrame(render);
        if (time - last < 33) return;
        last = time;
        try {
          engine.update();
          renderer!.render(scene, camera);
          gl.endFrameEXP();
          if (!reported && renderer!.info.render.calls > 0) {
            reported = true;
            console.info(
              "Aone Mart basket scene rendered (Three.js + Anime.js)",
            );
          }
        } catch (error) {
          console.warn(
            "Aone Mart basket rendering failed",
            error instanceof Error ? error.message : String(error),
          );
          release();
          setFailed(true);
        }
      };
      render(0);
    } catch (error) {
      console.warn(
        "Aone Mart basket initialization failed",
        error instanceof Error ? error.message : String(error),
      );
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
      style={{ width, height }}
    >
      {!enabled || !active || failed ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Image
            source={require("../assets/models/grocery-poster.png")}
            contentFit="contain"
            style={{ width, height }}
          />
        </View>
      ) : (
        <GLView style={{ width, height }} onContextCreate={start} />
      )}
    </View>
  );
}

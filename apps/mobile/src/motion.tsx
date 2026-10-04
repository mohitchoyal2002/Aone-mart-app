import React, { useEffect, useState, createContext, useContext } from "react";
import { AccessibilityInfo, AppState, Animated, Easing } from "react-native";

const MotionContext = createContext({
  reduced: true,
  active: true,
  enabled: false,
});
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(v);
      })
      .catch(() => {});
    const reduction = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const activity = AppState.addEventListener("change", (v) =>
      setActive(v === "active"),
    );
    return () => {
      live = false;
      reduction.remove();
      activity.remove();
    };
  }, []);
  return (
    <MotionContext.Provider
      value={{ reduced, active, enabled: !reduced && active }}
    >
      {children}
    </MotionContext.Provider>
  );
}
export const useMotion = () => useContext(MotionContext);

export function usePressMotion() {
  const [scale] = useState(() => new Animated.Value(1));
  const { enabled } = useMotion();
  const press = (value: number) =>
    Animated.spring(scale, {
      toValue: enabled ? value : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 170,
    }).start();
  return { scale, press };
}

export function useEntrance() {
  const [progress] = useState(() => new Animated.Value(0));
  const { reduced } = useMotion();
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
}

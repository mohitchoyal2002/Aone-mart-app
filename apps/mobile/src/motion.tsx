import React, {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  AccessibilityInfo,
  AppState,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
} from "react-native";

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
  useEffect(() => {
    if (!enabled) {
      scale.stopAnimation();
      scale.setValue(1);
    }
  }, [enabled, scale]);
  const press = (value: number) =>
    Animated.spring(scale, {
      toValue: enabled ? value : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 170,
    }).start();
  return { scale, press };
}

export function useEntrance(delay = 0) {
  const [progress] = useState(() => new Animated.Value(0));
  const { reduced } = useMotion();
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 320,
      delay: reduced ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced, delay]);
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function ActionPressable({
  style,
  onPressIn,
  onPressOut,
  ...props
}: React.ComponentProps<typeof Pressable>) {
  const motion = usePressMotion();
  const [pressed, setPressed] = useState(false);
  const resolved = StyleSheet.flatten(
    typeof style === "function" ? style({ pressed }) : style,
  );
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        motion.press(0.96);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        motion.press(1);
        onPressOut?.(event);
      }}
      style={[
        resolved,
        {
          transform: [
            ...(Array.isArray(resolved?.transform) ? resolved.transform : []),
            { scale: motion.scale },
          ],
        },
      ]}
    />
  );
}

export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.ComponentProps<typeof Animated.View>["style"];
}) {
  const entrance = useEntrance(delay);
  return <Animated.View style={[entrance, style]}>{children}</Animated.View>;
}

export function useBounce(value: unknown) {
  const { enabled } = useMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (!enabled) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.1,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 160,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
      scale.setValue(1);
    };
  }, [value, enabled, scale]);
  return { transform: [{ scale }] };
}

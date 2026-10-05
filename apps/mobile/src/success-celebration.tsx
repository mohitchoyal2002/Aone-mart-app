import React, { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { Check } from "lucide-react-native";
import { useMotion } from "./motion";
import { C } from "./ui";

// A short, single burst after the service confirms an order. No looping timer.
export function SuccessCelebration() {
  const { enabled } = useMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, progress]);
  return (
    <View
      pointerEvents="none"
      style={{ height: 112, alignItems: "center", justifyContent: "center" }}
    >
      {enabled &&
        Array.from({ length: 10 }, (_, index) => {
          const angle = (index / 10) * Math.PI * 2;
          return (
            <Animated.View
              key={index}
              style={{
                position: "absolute",
                width: 7,
                height: 12,
                borderRadius: 3,
                backgroundColor: [C.forest, C.coral, C.gold, C.blue][index % 4],
                opacity: progress.interpolate({
                  inputRange: [0, 0.2, 0.75, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.cos(angle) * 95],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.sin(angle) * 49],
                    }),
                  },
                  { rotate: `${index * 33}deg` },
                ],
              }}
            />
          );
        })}
      <Animated.View
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: C.mint,
          alignItems: "center",
          justifyContent: "center",
          transform: [
            {
              scale: enabled
                ? progress.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0.75, 1.08, 1],
                  })
                : 1,
            },
          ],
        }}
      >
        <Check size={36} strokeWidth={2.5} color={C.forest} />
      </Animated.View>
    </View>
  );
}

import React, { useEffect, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMotion } from "./motion";

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/brand/mark.png")}
      contentFit="contain"
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLoader({ size = 52 }: { size?: number }) {
  const { enabled } = useMotion();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Aone Mart is loading"
      style={{ width: size, height: size }}
    >
      <Image
        key={enabled ? "moving" : "still"}
        source={
          enabled
            ? require("../assets/brand/loader.gif")
            : require("../assets/brand/mark.png")
        }
        autoplay={enabled}
        contentFit="contain"
        cachePolicy="memory"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

function StartupLogo() {
  const { enabled } = useMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [enabled, progress]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Opening Aone Mart"
      style={{
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.04],
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -5],
            }),
          },
        ],
      }}
    >
      <BrandMark size={160} />
    </Animated.View>
  );
}

export function Startup({
  ready,
  onFinished,
}: {
  ready: boolean;
  onFinished?: () => void;
}) {
  const { reduced, active } = useMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!ready || !onFinished || !active) return;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: reduced ? 0 : 260,
      delay: reduced ? 0 : 350,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => animation.stop();
  }, [ready, reduced, opacity, active, onFinished]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 20 }]}>
      <LinearGradient
        colors={["#14243D", "#25445D", "#08786B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 30,
        }}
      >
        <View
          style={{
            width: 200,
            height: 200,
            backgroundColor: "rgba(255,255,255,.96)",
            borderRadius: 100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <StartupLogo />
        </View>
        <Text
          style={{
            fontSize: 34,
            fontFamily: "DMSans_700Bold",
            color: "#FFFFFF",
            marginTop: 25,
          }}
        >
          aone mart
        </Text>
        <Text style={{ fontSize: 17, color: "#D6F5A3", marginTop: 9 }}>
          Apni dukaan. Apna bharosa.
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontSize: 13, color: "#D6F5A3", marginTop: 28 }}
        >
          {ready ? "Your mart is ready" : "Opening your neighbourhood mart…"}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

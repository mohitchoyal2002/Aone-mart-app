import React, { useEffect, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
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
        colors={["#FFFBF2", "#EAF3DE", "#E8F0F7"]}
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
            backgroundColor: "rgba(255,255,255,.65)",
            borderRadius: 100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BrandLoader size={160} />
        </View>
        <Text
          style={{
            fontSize: 34,
            fontFamily: "DMSans_700Bold",
            color: "#143E32",
            marginTop: 25,
          }}
        >
          aone mart
        </Text>
        <Text style={{ fontSize: 17, color: "#536858", marginTop: 9 }}>
          Apni dukaan. Apna bharosa.
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontSize: 13, color: "#536858", marginTop: 28 }}
        >
          {ready ? "Your mart is ready" : "Opening your neighbourhood mart…"}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

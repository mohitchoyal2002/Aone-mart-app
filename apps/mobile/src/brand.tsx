import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Animated,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMotion } from "./motion";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/brand/mark.webp")}
      contentFit="contain"
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLoader({ size = 52 }: { size?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Aone Mart is loading"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size={size > 40 ? "large" : "small"} color="#08786B" />
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
      duration: reduced ? 0 : 160,
      delay: 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => animation.stop();
  }, [ready, reduced, opacity, active, onFinished]);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 650 || fontScale > 1.3;
  const markSize = compact ? 88 : 120;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 20 }]}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#14243D", "#18354C", "#08786B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: Math.min(28, width * 0.07),
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 380,
            alignItems: "center",
            gap: compact ? 12 : 18,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              padding: 12,
              borderRadius: compact ? 26 : 34,
            }}
          >
            <BrandMark size={markSize} />
          </View>
          <Text
            style={{
              fontFamily: "DMSans_700Bold",
              fontSize: compact ? 28 : 34,
              lineHeight: compact ? 36 : 42,
              color: "#FFFFFF",
              textAlign: "center",
            }}
          >
            aone mart
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 23,
              color: "#D6F5A3",
              textAlign: "center",
            }}
          >
            Apni dukaan. Apna bharosa.
          </Text>
        </View>
        <View
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: insets.bottom + 28,
            alignItems: "center",
            gap: 12,
          }}
        >
          {!ready && <ActivityIndicator size="small" color="#D6F5A3" />}
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontSize: 12,
              lineHeight: 20,
              textAlign: "center",
              color: "#DCE9EF",
            }}
          >
            {ready ? "Your mart is ready" : "Opening your neighbourhood mart…"}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

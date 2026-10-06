import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { Pause, Play, ArrowUpRight } from "lucide-react-native";
import { ActionPressable, useMotion } from "./motion";
import { C, T } from "./ui";

function StoryVideo({ onError }: { onError: () => void }) {
  const player = useVideoPlayer(
    require("../assets/motion/market-loop.mp4"),
    (p) => {
      p.muted = true;
      p.loop = true;
      p.audioMixingMode = "mixWithOthers";
    },
  );
  useEffect(() => {
    const listener = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onError();
    });
    if (player.status === "error") onError();
    else player.play();
    // useVideoPlayer releases and stops the native player on unmount. Do not
    // call player methods after its SharedObject has already been released.
    return () => listener.remove();
  }, [player, onError]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
      allowsPictureInPicture={false}
    />
  );
}

export function MarketStory({ active = true, initiallyPaused = true }: { active?: boolean; initiallyPaused?: boolean }) {
  const { enabled, reduced } = useMotion();
  const focused = useIsFocused();
  const [paused, setPaused] = useState(initiallyPaused);
  const [failed, setFailed] = useState(false);
  const videoFailed = useCallback(() => setFailed(true), []);
  const playing = active && focused && enabled && !paused && !failed;
  return (
    <View
      style={{
        minHeight: 145,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: C.navy,
      }}
    >
      <Image
        source={require("../assets/motion/market-poster.jpg")}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      {playing && <StoryVideo onError={videoFailed} />}
      <LinearGradient
        colors={["rgba(12,24,40,.82)", "rgba(12,24,40,.12)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={{ padding: 22, paddingRight: 70, gap: 5 }}
      >
        <T size={10} bold color={C.lime} style={{ letterSpacing: 1.5 }}>
          THE EVERYDAY EDIT
        </T>
        <T size={23} bold color={C.white}>
          Little things. Big goodness.
        </T>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 4,
          }}
        >
          <T color="#DFE9EF" size={12}>
            From your neighbourhood, with care
          </T>
          <ArrowUpRight size={14} color={C.lime} />
        </View>
      </View>
      {!reduced && !failed && (
        <ActionPressable
          accessibilityRole="button"
          accessibilityLabel={
            paused ? "Play market video" : "Pause market video"
          }
          onPress={() => setPaused((value) => !value)}
          style={{
            position: "absolute",
            right: 14,
            bottom: 14,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "rgba(255,255,255,.18)",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,.3)",
          }}
        >
          {paused ? (
            <Play size={17} color={C.white} />
          ) : (
            <Pause size={17} color={C.white} />
          )}
        </ActionPressable>
      )}
    </View>
  );
}

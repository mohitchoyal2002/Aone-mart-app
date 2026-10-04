import React, { useState, useRef, useEffect } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react-native";
import { useIsFocused } from "@react-navigation/native";
import { api } from "./api";
import { C, T } from "./ui";
import { useMotion } from "./motion";
import { BasketScene } from "./basket-scene";
import type { Banner } from "./types";

export function BannerCarousel({
  banners = [],
  active = true,
}: {
  banners?: Banner[];
  active?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <Carousel
      key={banners.map((b) => b.id + b.imagePath).join("|") + width}
      banners={banners}
      active={active}
      width={width}
      fontScale={fontScale}
    />
  );
}
function Carousel({
  banners,
  active,
  width,
  fontScale,
}: {
  banners: Banner[];
  active: boolean;
  width: number;
  fontScale: number;
}) {
  const focused = useIsFocused();
  const { enabled } = useMotion();
  const size = Math.min(width, 1100) - 44;
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const slides = banners.length
    ? banners.slice(0, 5)
    : [
        {
          id: "default",
          title: "Your daily basket, made better.",
          altText: "Aone Mart neighbourhood shopping",
          imagePath: "",
        },
      ];
  const count = slides.length;
  const move = (next: number) => {
    const target = (next + count) % count;
    scroll.current?.scrollTo({ x: target * size, animated: enabled });
    setIndex(target);
  };
  useEffect(() => {
    if (count <= 1 || paused || !enabled || !active || !focused) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % count;
      scroll.current?.scrollTo({ x: next * size, animated: true });
      setIndex(next);
    }, 6500);
    return () => clearTimeout(timer);
  }, [count, index, paused, enabled, active, focused, size]);
  const control = {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  };
  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setPaused(true)}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / size))
        }
        style={{ borderRadius: 25 }}
      >
        {slides.map((banner, position) => (
          <View
            key={banner.id + banner.imagePath}
            accessibilityLabel={`${position + 1} of ${count}: ${banner.altText}`}
            style={{ width: size }}
          >
            {banner.imagePath && !failed[banner.id + banner.imagePath] ? (
              <View
                style={{
                  backgroundColor: C.mint,
                  borderRadius: 25,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={api.baseUrl + banner.imagePath}
                  alt={banner.altText}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={enabled ? 180 : 0}
                  style={{ width: size, height: Math.max(178, size / 2.05) }}
                  onError={() =>
                    setFailed((current) => ({
                      ...current,
                      [banner.id + banner.imagePath]: true,
                    }))
                  }
                />
                <View style={{ padding: 15, backgroundColor: "#EDF3E2" }}>
                  <T bold size={15}>
                    {banner.title}
                  </T>
                </View>
              </View>
            ) : (
              <LinearGradient
                colors={["#175542", "#276A55", "#377562"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 25,
                  padding: 21,
                  minHeight: 208,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: fontScale > 1.25 ? "100%" : "60%",
                    gap: 10,
                    zIndex: 1,
                  }}
                >
                  <T size={12} bold color="#FFF3D9">
                    APNI DUKAAN. APNA BHAROSA.
                  </T>
                  <T size={25} bold color={C.white} style={{ lineHeight: 32 }}>
                    {banner.imagePath
                      ? banner.title
                      : "Your daily basket, made better."}
                  </T>
                  <T size={14} color="#E6F0D8" style={{ lineHeight: 21 }}>
                    Choose your essentials. Pick up at the mart. Pay at the
                    counter.
                  </T>
                </View>
                {fontScale <= 1.25 && (
                  <View style={{ position: "absolute", right: -14, bottom: 5 }}>
                    <BasketScene
                      active={
                        active && focused && !paused && index === position
                      }
                    />
                  </View>
                )}
              </LinearGradient>
            )}
          </View>
        ))}
      </ScrollView>
      {count > 1 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Pressable
            style={control}
            accessibilityRole="button"
            accessibilityLabel="Previous banner"
            onPress={() => {
              setPaused(true);
              move(index - 1);
            }}
          >
            <ChevronLeft color={C.forest} size={20} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {slides.map((b, i) => (
              <Pressable
                key={b.id}
                style={{
                  minWidth: 24,
                  minHeight: 44,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel={`Banner ${i + 1}: ${b.title}`}
                accessibilityState={{ selected: i === index }}
                onPress={() => {
                  setPaused(true);
                  move(i);
                }}
              >
                <View
                  style={{
                    width: i === index ? 18 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i === index ? C.forest : "#AABDAA",
                  }}
                />
              </Pressable>
            ))}
          </View>
          <Pressable
            style={control}
            accessibilityRole="button"
            accessibilityLabel={
              paused ? "Play banner carousel" : "Pause banner carousel"
            }
            onPress={() => setPaused((v) => !v)}
          >
            {paused ? (
              <Play color={C.forest} size={17} />
            ) : (
              <Pause color={C.forest} size={17} />
            )}
          </Pressable>
          <Pressable
            style={control}
            accessibilityRole="button"
            accessibilityLabel="Next banner"
            onPress={() => {
              setPaused(true);
              move(index + 1);
            }}
          >
            <ChevronRight color={C.forest} size={20} />
          </Pressable>
        </View>
      )}
      {count === 1 && !slides[0].imagePath && enabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            paused ? "Play basket animation" : "Pause basket animation"
          }
          onPress={() => setPaused((v) => !v)}
          style={{
            minHeight: 44,
            alignSelf: "flex-start",
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            paddingHorizontal: 10,
          }}
        >
          {paused ? (
            <Play color={C.forest} size={15} />
          ) : (
            <Pause color={C.forest} size={15} />
          )}
          <T size={12} color={C.forest}>
            {paused ? "Play animation" : "Pause animation"}
          </T>
        </Pressable>
      )}
    </View>
  );
}

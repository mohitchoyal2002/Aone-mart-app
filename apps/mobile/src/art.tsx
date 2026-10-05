import React, { useState } from "react";
import { Image } from "expo-image";
import { useMotion } from "./motion";
import Svg, { Path, Rect, Ellipse, Text as SvgText, G } from "react-native-svg";
import type { Artwork } from "./types";
export const artBackground: Record<Artwork, string> = {
  rice: "#F3EFE6",
  milk: "#E9F1F8",
  oil: "#F8F0DA",
  fruit: "#F5F0D8",
  vegetable: "#EAF5EE",
  soap: "#EAF1F0",
  bread: "#F4EBD9",
  bag: "#EEF0E2",
  snack: "#F7EBD9",
  tea: "#EBEFDE",
};
const illustrationSources = {
  rice: require("../assets/models/bag.png"),
  bag: require("../assets/models/bag.png"),
  milk: require("../assets/models/carton.png"),
  oil: require("../assets/models/bottle-oil.png"),
  fruit: require("../assets/models/apple.png"),
  vegetable: require("../assets/models/broccoli.png"),
  bread: require("../assets/models/loaf.png"),
  snack: require("../assets/models/cookie.png"),
  tea: require("../assets/models/cup-tea.png"),
};

export function ProductArt({
  artwork = "bag",
  imageUrl = "",
  width = 150,
  height = 128,
}: {
  artwork?: Artwork;
  imageUrl?: string;
  width?: number;
  height?: number;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const { enabled } = useMotion();
  if (imageUrl && failedUrl !== imageUrl)
    return (
      <Image
        source={{ uri: imageUrl }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={enabled ? 160 : 0}
        style={{ width, height }}
        onError={() => setFailedUrl(imageUrl)}
        accessibilityLabel="Product image"
      />
    );
  if (artwork !== "soap")
    return (
      <Image
        source={illustrationSources[artwork]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={enabled ? 120 : 0}
        style={{ width, height }}
        accessibilityLabel={`${artwork} product illustration`}
      />
    );
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 180 150"
      accessibilityLabel="Soap product illustration"
    >
      <Ellipse cx="91" cy="133" rx="47" ry="7" fill="#183C21" opacity="0.11" />

      <G>
        <Rect
          x="41"
          y="37"
          width="101"
          height="73"
          rx="18"
          fill="#D6E8DC"
          transform="rotate(-9 91 74)"
        />
        <Rect
          x="53"
          y="48"
          width="83"
          height="62"
          rx="14"
          fill="#8EBCAB"
          transform="rotate(-9 91 74)"
        />
        <Path d="M84 75c12-24 30-23 32-19-1 20-14 28-32 19z" fill="#D6E7D8" />
        <SvgText
          x="91"
          y="91"
          textAnchor="middle"
          fontSize="10"
          fill="#315F46"
          letterSpacing="2"
        >
          GENTLE
        </SvgText>
      </G>
    </Svg>
  );
}

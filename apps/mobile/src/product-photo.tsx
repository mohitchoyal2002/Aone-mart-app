import React, { memo, useState } from "react";
import { Image } from "expo-image";
import { productPhotoKind } from "./product-images";
import type { Artwork } from "./types";

const sources = {
  rice: {
    thumb: require("../assets/products/rice-thumb.webp"),
    large: require("../assets/products/rice.webp"),
  },
  milk: {
    thumb: require("../assets/products/milk-thumb.webp"),
    large: require("../assets/products/milk.webp"),
  },
  oil: {
    thumb: require("../assets/products/oil-thumb.webp"),
    large: require("../assets/products/oil.webp"),
  },
  bread: {
    thumb: require("../assets/products/bread-thumb.webp"),
    large: require("../assets/products/bread.webp"),
  },
  soap: {
    thumb: require("../assets/products/soap-thumb.webp"),
    large: require("../assets/products/soap.webp"),
  },
  grocery: {
    thumb: require("../assets/products/grocery-thumb.webp"),
    large: require("../assets/products/grocery.webp"),
  },
  tea: {
    thumb: require("../assets/products/tea-thumb.webp"),
    large: require("../assets/products/tea.webp"),
  },
  snack: {
    thumb: require("../assets/products/snack-thumb.webp"),
    large: require("../assets/products/snack.webp"),
  },
  apple: {
    thumb: require("../assets/products/apple-thumb.webp"),
    large: require("../assets/products/apple.webp"),
  },
  broccoli: {
    thumb: require("../assets/products/broccoli-thumb.webp"),
    large: require("../assets/products/broccoli.webp"),
  },
  flour: {
    thumb: require("../assets/products/flour-thumb.webp"),
    large: require("../assets/products/flour.webp"),
  },
  lentils: {
    thumb: require("../assets/products/lentils-thumb.webp"),
    large: require("../assets/products/lentils.webp"),
  },
};

export const ProductPhoto = memo(function ProductPhoto({
  name = "",
  category = "",
  artwork = "bag",
  imageUrl = "",
  width = 150,
  height = 128,
  detail = false,
  onRepresentative,
}: {
  name?: string;
  category?: string;
  artwork?: Artwork;
  imageUrl?: string;
  width?: number;
  height?: number;
  detail?: boolean;
  onRepresentative?: (representative: boolean) => void;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const kind = productPhotoKind({ name, category, artwork });
  const remote = !!imageUrl && failedUrl !== imageUrl;
  const local = sources[kind][detail ? "large" : "thumb"];
  return (
    <Image
      source={remote ? { uri: imageUrl } : local}
      placeholder={sources[kind].thumb}
      placeholderContentFit="cover"
      contentFit={remote ? "contain" : "cover"}
      cachePolicy="memory-disk"
      allowDownscaling
      recyclingKey={`${name}|${imageUrl}|${kind}|${detail}`}
      transition={0}
      style={{ width, height }}
      accessibilityLabel={
        remote
          ? `${name || "Product"} photo`
          : `Representative image of ${name || kind}`
      }
      onError={() => {
        if (remote) {
          setFailedUrl(imageUrl);
          onRepresentative?.(true);
        }
      }}
      onLoad={() => onRepresentative?.(!remote)}
    />
  );
});

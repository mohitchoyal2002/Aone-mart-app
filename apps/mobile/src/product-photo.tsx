import React, { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { ImageOff } from "lucide-react-native";
import { productPhotoKind } from "./product-images";
import { useResolvedProductPhoto } from "./product-photo-service";
import { C, T } from "./ui";
import type { Artwork, ProductImageSource } from "./types";

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
  productId = "",
  barcode = "",
  name = "",
  unit = "",
  sku = "",
  category = "",
  artwork = "bag",
  imageUrl = "",
  imageThumbnailUrl = "",
  imageSource = null,
  width = 150,
  height = 128,
  detail = false,
  onPhotoChange,
}: {
  productId?: string;
  barcode?: string;
  name?: string;
  unit?: string;
  sku?: string;
  category?: string;
  artwork?: Artwork;
  imageUrl?: string;
  imageThumbnailUrl?: string;
  imageSource?: ProductImageSource | null;
  width?: number;
  height?: number;
  detail?: boolean;
  onPhotoChange?: (
    source: ProductImageSource | null,
    available: boolean,
  ) => void;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const resolved = useResolvedProductPhoto(
    productId,
    barcode,
    imageUrl,
    name,
    unit,
    sku,
  );
  const full = imageUrl || resolved?.imageUrl || "";
  const thumb = imageThumbnailUrl || resolved?.imageThumbnailUrl || full;
  const preferred = detail ? full : thumb;
  const remote = [preferred, full, thumb].find(
    (url) => url && !failedUrls.includes(url),
  );
  const source = imageUrl ? imageSource : resolved?.imageSource || null;
  const kind =
    productId || name.trim() ? null : productPhotoKind({ category, artwork });
  useEffect(() => {
    onPhotoChange?.(remote ? source : null, !!remote);
  }, [remote, source, onPhotoChange]);
  if (!remote && !kind)
    return (
      <View
        accessibilityLabel={`Photo unavailable for ${name || "this product"}`}
        style={{
          width,
          height,
          backgroundColor: C.subtle,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <ImageOff
          size={Math.min(width, height) < 80 ? 21 : 34}
          color={C.muted}
          strokeWidth={1.5}
        />
        {width >= 100 && height >= 100 && (
          <T size={11} color={C.muted}>
            Photo unavailable
          </T>
        )}
      </View>
    );
  const local = kind ? sources[kind][detail ? "large" : "thumb"] : undefined;
  return (
    <Image
      source={remote ? { uri: remote } : local}
      contentFit={remote ? "contain" : "cover"}
      cachePolicy="memory-disk"
      allowDownscaling
      recyclingKey={`${productId}|${name}|${remote}|${kind}|${detail}`}
      transition={0}
      style={{ width, height, backgroundColor: C.subtle }}
      accessibilityLabel={
        remote ? `${name || "Product"} photo` : `${kind} category image`
      }
      onError={() => {
        if (remote) {
          setFailedUrls((urls) => [...urls, remote]);
        }
      }}
    />
  );
});

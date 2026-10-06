import React, { useState } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ShoppingBag,
  Check,
  Store as StoreIcon,
  ShieldCheck,
} from "lucide-react-native";
import { ActionPressable } from "./motion";
import { ProductPhoto } from "./product-photo";
import { productSnapshot, rememberProducts } from "./product-cache";
import { useAuth, useCart, useLoad } from "./state";
import { api } from "./api";
import { C, T, Button, Card, ErrorView, Loading, money } from "./ui";
import { Stepper } from "./quantity-control";
import type { Product, ProductImageSource, Store } from "./types";

export function ProductDetailScreen() {
  const { id: param } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(param) ? param[0] : param || "";
  const { epoch } = useAuth();
  const cart = useCart();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cached = productSnapshot(id);
  const result = useLoad<{ product: Product; store: Store }>(async () => {
    const [p, s] = await Promise.all([
      api.get<{ product: Product }>(
        `/api/catalog/products/${encodeURIComponent(id)}`,
      ),
      api.get<{ store: Store }>("/api/catalog/store"),
    ]);
    rememberProducts([p.product]);
    return { ...p, ...s };
  }, [id, epoch]);
  const p = result.data?.product || cached;
  const [photo, setPhoto] = useState<{
    source: ProductImageSource | null;
    available: boolean;
  }>({ source: null, available: false });
  const photoChanged = React.useCallback(
    (source: ProductImageSource | null, available: boolean) =>
      setPhoto({ source, available }),
    [],
  );
  const imageSize = Math.min(Math.max(width - 40, 180), 460);
  const quantity =
    cart.lines.find((line) => line.product.id === id)?.quantity || 0;
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(customer)");
  const discount =
    p && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  const purchasable =
    !!p?.available &&
    !result.error &&
    !result.loading &&
    result.data?.store.acceptingOrders !== false;
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <ActionPressable
          accessibilityRole="button"
          accessibilityLabel="Back to products"
          onPress={goBack}
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            backgroundColor: C.white,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={22} color={C.ink} />
        </ActionPressable>
        <View style={{ flex: 1 }}>
          <T bold size={15}>
            Product details
          </T>
          <T size={11} color={C.muted}>
            Aone Mart collection
          </T>
        </View>
        <ActionPressable
          accessibilityRole="button"
          accessibilityLabel={`View basket, ${cart.count} items`}
          onPress={() => router.navigate("/(customer)/cart")}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 15,
            padding: 10,
            backgroundColor: C.mint,
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShoppingBag size={20} color={C.forest} />
          <T bold color={C.forest}>
            {cart.count}
          </T>
        </ActionPressable>
      </View>
      {!p ? (
        result.error ? (
          <ErrorView error={result.error} retry={result.refresh} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingTop: 4,
              gap: 20,
              width: "100%",
              maxWidth: 600,
              alignSelf: "center",
              paddingBottom: 28,
            }}
            showsVerticalScrollIndicator={false}
          >
            {result.error && (
              <ErrorView error={result.error} retry={result.refresh} />
            )}
            <View
              style={{
                backgroundColor: C.white,
                borderRadius: 30,
                overflow: "hidden",
                alignSelf: "center",
                width: imageSize,
              }}
            >
              <ProductPhoto
                key={id + p.imageUrl}
                productId={p.id}
                unit={p.unit}
                sku={p.sku}
                barcode={p.barcode}
                name={p.name}
                category={p.category}
                artwork={p.artwork}
                imageUrl={p.imageUrl}
                imageThumbnailUrl={p.imageThumbnailUrl}
                imageSource={p.imageSource}
                width={imageSize}
                height={imageSize}
                detail
                onPhotoChange={photoChanged}
              />
              {!!discount && (
                <View
                  style={{
                    position: "absolute",
                    left: 14,
                    top: 14,
                    backgroundColor: C.navy,
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <T size={12} bold color={C.lime}>
                    {discount}% OFF
                  </T>
                </View>
              )}
            </View>
            {!photo.available && (
              <T size={11} color={C.muted} style={{ textAlign: "center" }}>
                A verified product photo is not available yet
              </T>
            )}
            {photo.available && photo.source && (
              <T size={11} color={C.muted} style={{ textAlign: "center" }}>
                Photo: {photo.source.provider} · {photo.source.license}
                {"\n"}
                {photo.source.url}
              </T>
            )}
            <View style={{ gap: 10 }}>
              <T size={11} bold color={C.forest} style={{ letterSpacing: 1 }}>
                {p.category.toUpperCase()}
              </T>
              <T size={29} bold style={{ lineHeight: 36, letterSpacing: -0.6 }}>
                {p.name}
              </T>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    backgroundColor: C.white,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <T size={12} color={C.muted}>
                    {p.unit}
                  </T>
                </View>
                <View
                  style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
                >
                  <Check size={15} color={p.available ? C.forest : C.red} />
                  <T size={12} color={p.available ? C.forest : C.red}>
                    {p.available
                      ? p.available <= p.lowStockThreshold
                        ? `Only ${p.available} left`
                        : "In stock"
                      : "Out of stock"}
                  </T>
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                <T bold size={32}>
                  {money(p.price)}
                </T>
                {!!discount && (
                  <T
                    size={15}
                    color={C.muted}
                    style={{ textDecorationLine: "line-through" }}
                  >
                    {money(p.mrp)}
                  </T>
                )}
                {!!discount && (
                  <T size={12} bold color={C.forest}>
                    Save {money(p.mrp - p.price)}
                  </T>
                )}
              </View>
            </View>
            <Card>
              <T size={17} bold>
                Know your pick
              </T>
              {[
                ["Pack size", p.unit],
                ["Category", p.category],
                ["Product code", p.sku],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{ flexDirection: "row", gap: 16, paddingTop: 14 }}
                >
                  <T size={12} color={C.muted} style={{ flex: 1 }}>
                    {label}
                  </T>
                  <T size={12} style={{ flex: 1.5, textAlign: "right" }}>
                    {value}
                  </T>
                </View>
              ))}
            </Card>
            <View
              style={{
                backgroundColor: C.mint,
                padding: 18,
                borderRadius: 22,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <StoreIcon color={C.forest} size={24} />
              <View style={{ flex: 1, gap: 6 }}>
                <T bold size={15}>
                  Reserve now. Collect locally.
                </T>
                <T size={12} color={C.muted} style={{ lineHeight: 20 }}>
                  {result.data?.store.pickupInstructions ||
                    "Place your order, wait for the packed confirmation, then pick up and pay at the mart."}
                </T>
              </View>
            </View>
            <View
              style={{ flexDirection: "row", justifyContent: "center", gap: 7 }}
            >
              <ShieldCheck size={15} color={C.forest} />
              <T size={11} color={C.muted}>
                Pickup and payment at your neighbourhood mart
              </T>
            </View>
          </ScrollView>
          <View
            style={{
              backgroundColor: C.white,
              borderTopWidth: 1,
              borderColor: C.line,
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom, 12),
              gap: 12,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 560,
                alignSelf: "center",
                flexDirection: "row",
                gap: 18,
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <T size={10} color={C.muted}>
                  {quantity ? `${quantity} in your basket` : p.unit}
                </T>
                <T size={23} bold>
                  {money(p.price * Math.max(quantity, 1))}
                </T>
              </View>
              <View style={{ flex: 1.6 }}>
                {quantity && purchasable ? (
                  <Stepper
                    quantity={quantity}
                    onChange={(q) =>
                      q > quantity ? cart.add(p) : cart.change(p.id, q)
                    }
                  />
                ) : (
                  <Button
                    title={
                      result.loading
                        ? "Updating…"
                        : !p.available
                          ? "Out of stock"
                          : result.data?.store.acceptingOrders === false
                            ? "Orders paused"
                            : "Add to basket"
                    }
                    disabled={!purchasable}
                    onPress={() => cart.add(p)}
                    icon={<ShoppingBag size={17} color={C.white} />}
                  />
                )}
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

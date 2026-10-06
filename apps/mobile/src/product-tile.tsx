import React, { memo } from "react";
import { router } from "expo-router";
import { Animated, View } from "react-native";
import { Plus, Check } from "lucide-react-native";
import { ActionPressable, useBounce } from "./motion";
import { useCart } from "./state";
import { ProductArt, artBackground } from "./art";
import { C, T, money } from "./ui";
import { Stepper } from "./quantity-control";
import type { Product } from "./types";

export function ProductTile({
  product: p,
  width,
}: {
  product: Product;
  width: number;
  index: number;
}) {
  const cart = useCart();
  const quantity =
    cart.lines.find((line) => line.product.id === p.id)?.quantity || 0;
  return (
    <Tile
      product={p}
      width={width}
      quantity={quantity}
      add={cart.add}
      change={cart.change}
    />
  );
}
const Tile = memo(function Tile({
  product: p,
  width,
  quantity,
  add,
  change,
}: {
  product: Product;
  width: number;
  quantity: number;
  add: ReturnType<typeof useCart>["add"];
  change: ReturnType<typeof useCart>["change"];
}) {
  const bounce = useBounce(quantity);
  return (
    <View style={{ width }}>
      <View
        style={{
          backgroundColor: C.white,
          borderRadius: 25,
          borderWidth: 1,
          borderColor: quantity ? "#B8DCCE" : C.line,
          padding: 10,
          shadowColor: C.navy,
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <ActionPressable
          accessibilityRole="button"
          accessibilityLabel={`View ${p.name}`}
          onPress={() =>
            router.push({ pathname: "/product/[id]", params: { id: p.id } })
          }
        >
          <View
            style={{
              backgroundColor: artBackground[p.artwork] || C.subtle,
              borderRadius: 19,
              height: 150,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                width: 125,
                height: 125,
                borderRadius: 63,
                backgroundColor: "rgba(255,255,255,.48)",
                right: -30,
                top: -35,
              }}
            />
            <Animated.View style={bounce}>
              <ProductArt
                key={p.imageUrl}
                productId={p.id}
                unit={p.unit}
                sku={p.sku}
                barcode={p.barcode}
                artwork={p.artwork}
                name={p.name}
                category={p.category}
                imageUrl={p.imageUrl}
                imageThumbnailUrl={p.imageThumbnailUrl}
                imageSource={p.imageSource}
                width={width - 22}
                height={150}
              />
            </Animated.View>
            {p.mrp > p.price && (
              <View
                style={{
                  position: "absolute",
                  left: 8,
                  top: 8,
                  backgroundColor: C.navy,
                  borderRadius: 9,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                <T bold size={9} color={C.lime}>
                  {Math.round((1 - p.price / p.mrp) * 100)}% OFF
                </T>
              </View>
            )}
            {!!quantity && (
              <View
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 8,
                  backgroundColor: C.white,
                  borderRadius: 12,
                  width: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={14} color={C.forest} />
              </View>
            )}
          </View>
          <View style={{ paddingHorizontal: 3, paddingTop: 12, gap: 5 }}>
            <T size={11} color={C.muted}>
              {p.unit}
            </T>
            <T
              bold
              size={15}
              numberOfLines={2}
              style={{ minHeight: 42, lineHeight: 21 }}
            >
              {p.name}
            </T>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 1,
              }}
            >
              <T size={20} bold>
                {money(p.price)}
              </T>
              {p.mrp > p.price && (
                <T
                  size={11}
                  color={C.muted}
                  style={{ textDecorationLine: "line-through" }}
                >
                  {money(p.mrp)}
                </T>
              )}
            </View>
          </View>
        </ActionPressable>
        <View style={{ marginTop: 10, minHeight: 48, paddingHorizontal: 3 }}>
          {quantity ? (
            <Stepper
              quantity={quantity}
              onChange={(q) => (q > quantity ? add(p) : change(p.id, q))}
            />
          ) : (
            <ActionPressable
              disabled={!p.available}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name} to cart`}
              accessibilityState={{ disabled: !p.available }}
              onPress={() => add(p)}
              style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: p.available ? C.mint : C.subtle,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Plus size={17} color={p.available ? C.forest : C.muted} />
              <T size={13} bold color={p.available ? C.forest : C.muted}>
                {p.available ? "Add to basket" : "Out of stock"}
              </T>
            </ActionPressable>
          )}
        </View>
      </View>
    </View>
  );
});

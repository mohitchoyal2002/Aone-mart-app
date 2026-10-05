import React from "react";
import { Animated, View } from "react-native";
import { Plus, Minus } from "lucide-react-native";
import { ActionPressable as Pressable, useBounce } from "./motion";
import { C, T } from "./ui";

export function Stepper({
  quantity,
  onChange,
  compact = false,
}: {
  quantity: number;
  onChange: (n: number) => void;
  compact?: boolean;
}) {
  const bounce = useBounce(quantity);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: C.forest,
        borderRadius: 11,
        height: 48,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove one"
        onPress={() => onChange(quantity - 1)}
        style={{
          minWidth: 44,
          alignItems: "center",
          paddingHorizontal: compact ? 10 : 12,
          paddingVertical: 15,
        }}
      >
        <Minus size={14} color={C.white} />
      </Pressable>
      <Animated.View style={bounce}>
        <T bold size={14} color={C.white}>
          {quantity}
        </T>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add one"
        onPress={() => onChange(quantity + 1)}
        style={{
          minWidth: 44,
          alignItems: "center",
          paddingHorizontal: compact ? 10 : 12,
          paddingVertical: 15,
        }}
      >
        <Plus size={14} color={C.white} />
      </Pressable>
    </View>
  );
}

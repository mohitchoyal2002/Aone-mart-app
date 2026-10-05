import { ActionPressable as Pressable, useBounce } from "./motion";
import React from "react";
import { View, Animated } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import {
  House,
  ShoppingBag,
  ClipboardList,
  UserRound,
} from "lucide-react-native";
import { useCart } from "./state";
import { C, T } from "./ui";
type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];
const items = {
  index: { label: "Home", icon: House },
  cart: { label: "Cart", icon: ShoppingBag },
  orders: { label: "My Orders", icon: ClipboardList },
  profile: { label: "Profile", icon: UserRound },
};
export function BottomBar({ state, navigation }: TabBarProps) {
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const insets = useSafeAreaInsets(),
    { count } = useCart();
  const badgeMotion = useBounce(count);
  if (keyboardVisible) return null;
  return (
    <View
      style={{
        backgroundColor: C.navy,
        borderTopWidth: 0,
        borderColor: C.line,
        paddingBottom: 12,
        paddingTop: 12,
        marginHorizontal: 12,
        borderRadius: 26,
        marginBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 13,
        flexDirection: "row",
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i,
          item = items[route.name as keyof typeof items];
        if (!item) return null;
        const Icon = item.icon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={
              route.name === "cart" && count > 0
                ? `Cart, ${count} items`
                : item.label
            }
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented)
                navigation.navigate(route.name);
            }}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 5,
              paddingVertical: 7,
              borderRadius: 16,
              backgroundColor: focused ? "#29423D" : "transparent",
            }}
          >
            <Animated.View
              style={route.name === "cart" ? badgeMotion : undefined}
            >
              <Icon
                size={23}
                color={focused ? C.lime : "#B7C6D8"}
                strokeWidth={focused ? 2 : 1.6}
              />
              {route.name === "cart" && count > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: -8,
                    top: -7,
                    backgroundColor: C.coral,
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 3,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T size={9} bold color={C.navy}>
                    {count > 99 ? "99+" : count}
                  </T>
                </View>
              )}
            </Animated.View>
            <T size={10} bold={focused} color={focused ? C.lime : "#B7C6D8"}>
              {item.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

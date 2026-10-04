import React from "react";
import { View, Pressable } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets(),
    { count } = useCart();
  return (
    <View
      style={{
        backgroundColor: C.white,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 9,
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
            accessibilityLabel={item.label}
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
              backgroundColor: focused ? "#EDF3E3" : "transparent",
            }}
          >
            <View>
              <Icon
                size={23}
                color={focused ? C.forest : C.muted}
                strokeWidth={focused ? 2 : 1.6}
              />
              {route.name === "cart" && count > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: -8,
                    top: -7,
                    backgroundColor: C.forest,
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 3,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T size={8} bold color={C.white}>
                    {count > 99 ? "99+" : count}
                  </T>
                </View>
              )}
            </View>
            <T size={10} bold={focused} color={focused ? C.forest : C.muted}>
              {item.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

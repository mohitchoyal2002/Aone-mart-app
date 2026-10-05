import { useMotion } from "../../motion";
import React from "react";
import { Tabs, router } from "expo-router";
import { BottomBar } from "../../bottom-bar";
import { C } from "../../ui";
import { useRealtime } from "../../realtime";
export default function CustomerLayout() {
  const { reduced } = useMotion();
  useRealtime(() => router.navigate("/(customer)/orders"));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.canvas },
        animation: reduced ? "none" : "fade",
      }}
      tabBar={(props) => <BottomBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart" }} />
      <Tabs.Screen name="orders" options={{ title: "My Orders" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

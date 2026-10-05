import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MotionProvider } from "../../apps/mobile/src/motion";
import {
  AuthProvider,
  CartProvider,
  useAuth,
} from "../../apps/mobile/src/state";
import {
  HomeScreen,
  CartScreen,
  OrdersScreen,
  ProfileScreen,
} from "../../apps/mobile/src/customer";
import { AuthScreen } from "../../apps/mobile/src/auth-screens";
import { DashboardScreen } from "../../apps/mobile/src/admin-insights";
import { BottomBar } from "../../apps/mobile/src/bottom-bar";
import { DialogHost } from "../../apps/mobile/src/dialogs";
function Preview() {
  const { loading } = useAuth();
  const [screen, setScreen] = useState(
    new URLSearchParams(location.search).get("screen") || "index",
  );
  useEffect(() => {
    const onRoute = (e: any) => setScreen(e.detail);
    window.addEventListener("preview-route", onRoute);
    return () => window.removeEventListener("preview-route", onRoute);
  }, []);
  const routes = ["index", "cart", "orders", "profile"].map((name) => ({
    name,
    key: name,
  }));
  if (loading) return null;
  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FB" }}>
      <View key={screen} style={{ flex: 1 }}>
        {screen === "auth" ? (
          <AuthScreen />
        ) : screen === "admin" ? (
          <DashboardScreen onInventory={() => {}} onOrders={() => {}} />
        ) : screen === "cart" ? (
          <CartScreen />
        ) : screen === "orders" ? (
          <OrdersScreen />
        ) : screen === "profile" ? (
          <ProfileScreen />
        ) : (
          <HomeScreen />
        )}
      </View>
      {!["auth", "admin"].includes(screen) && (
        <BottomBar
          state={
            { index: routes.findIndex((r) => r.name === screen), routes } as any
          }
          navigation={
            {
              emit: () => ({ defaultPrevented: false }),
              navigate: setScreen,
            } as any
          }
        />
      )}
      <DialogHost />
    </View>
  );
}
createRoot(document.getElementById("root")!).render(
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: innerWidth, height: innerHeight },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    }}
  >
    <MotionProvider>
      <AuthProvider>
        <CartProvider>
          <Preview />
        </CartProvider>
      </AuthProvider>
    </MotionProvider>
  </SafeAreaProvider>,
);

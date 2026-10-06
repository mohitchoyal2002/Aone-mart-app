import { useMotion } from "../motion";
import React from "react";
import { Stack } from "expo-router";
import { AppShell } from "../app-shell";
import { useAuth } from "../state";
import { C, Loading } from "../ui";

function RootNavigator() {
  const { reduced } = useMotion();
  const { user, connected, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.canvas },
        animation: reduced ? "none" : "fade_from_bottom",
      }}
    >
      <Stack.Protected guard={!connected || !user}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={connected && user?.role === "customer"}>
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="product/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={connected && user?.role === "admin"}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <AppShell>
      <RootNavigator />
    </AppShell>
  );
}

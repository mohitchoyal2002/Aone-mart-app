import React from "react";
import { router } from "expo-router";
import { DashboardScreen } from "../../admin-insights";
export default function Dashboard() {
  return (
    <DashboardScreen
      onInventory={() => router.navigate("/(admin)/inventory")}
      onOrders={() => router.navigate("/(admin)/orders")}
    />
  );
}

import React from "react";
import { View, ScrollView, Pressable, Keyboard, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  UsersRound,
  ChartNoAxesCombined,
  TicketPercent,
  Sparkles,
  Settings,
  LogOut,
} from "lucide-react-native";
import { useAuth } from "./state";
import { C, T, Brand } from "./ui";
import { Slot, router, usePathname } from "expo-router";
import { useRealtime } from "./realtime";
const tabs = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "inventory", label: "Manage Inventory", icon: Boxes },
  { key: "orders", label: "Active Orders", icon: ClipboardList },
  { key: "customers", label: "Customers", icon: UsersRound },
  { key: "sales", label: "Sales & Invoices", icon: ChartNoAxesCombined },
  { key: "rewards", label: "Rewards & Coupons", icon: TicketPercent },
  { key: "ai", label: "AI Summary", icon: Sparkles },
  { key: "settings", label: "Store Settings", icon: Settings },
];
export function AdminLayout() {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { user, logout } = useAuth(),
    { width } = useWindowDimensions();
  const tab = usePathname().split("/").pop() || "dashboard";
  const wide = width >= 820;
  useRealtime(() => router.navigate("/(admin)/orders"));
  const nav = tabs.map((t) => {
    const Icon = t.icon,
      selected = tab === t.key;
    return (
      <Pressable
        key={t.key}
        onPress={() => {
          Keyboard.dismiss();
          router.navigate(`/(admin)/${t.key}`);
        }}
        accessibilityLabel={t.label}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: wide ? 16 : 13,
          paddingVertical: wide ? 14 : 11,
          borderRadius: 14,
          backgroundColor: selected ? C.forest : wide ? "transparent" : C.white,
          borderWidth: wide ? 0 : 1,
          borderColor: selected ? C.forest : C.line,
        }}
      >
        <Icon size={wide ? 19 : 15} color={selected ? C.mint : C.muted} />
        <T
          size={wide ? 13 : 11}
          bold={selected}
          color={selected ? C.white : C.muted}
        >
          {t.label}
        </T>
      </Pressable>
    );
  });
  return (
    <View
      style={{
        flex: 1,
        flexDirection: wide ? "row" : "column",
        backgroundColor: C.canvas,
        paddingBottom: insets.bottom,
      }}
    >
      {wide ? (
        <View
          style={{
            width: 238,
            borderRightWidth: 1,
            borderColor: C.line,
            backgroundColor: "#F1F5EC",
            padding: 18,
          }}
        >
          <View style={{ paddingVertical: 17 }}>
            <Brand small />
          </View>
          <View
            style={{
              backgroundColor: "#E1EBCF",
              alignSelf: "flex-start",
              borderRadius: 7,
              paddingHorizontal: 10,
              paddingVertical: 5,
              marginBottom: 27,
            }}
          >
            <T size={9} bold color={C.forest} style={{ letterSpacing: 1.2 }}>
              ADMIN WORKSPACE
            </T>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {nav}
          </ScrollView>
          <View
            style={{
              borderTopWidth: 1,
              borderColor: "#DDE4D5",
              paddingTop: 18,
              marginTop: 15,
              gap: 12,
            }}
          >
            <View>
              <T bold size={13}>
                {user?.name}
              </T>
              <T size={10} color={C.muted} style={{ marginTop: 5 }}>
                Store administrator
              </T>
            </View>
            <Pressable
              onPress={() => void logout()}
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                paddingVertical: 10,
              }}
            >
              <LogOut size={16} color={C.muted} />
              <T size={12} color={C.muted}>
                Log out
              </T>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={{
            padding: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderColor: C.line,
            backgroundColor: C.white,
            gap: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Brand small />
            <View
              style={{
                backgroundColor: C.mint,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
              }}
            >
              <T size={9} bold color={C.forest}>
                ADMIN
              </T>
            </View>
          </View>
          {!keyboardVisible && <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7 }}
          >
            {nav}
          </ScrollView>}
        </View>
      )}
      <View style={{ flex: 1 }} key={tab}>
        <Slot />
      </View>
    </View>
  );
}

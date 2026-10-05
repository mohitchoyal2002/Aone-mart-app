import { ActionPressable as Pressable } from "./motion";
import { LinearGradient } from "expo-linear-gradient";
import { BrandLoader } from "./brand";
import { BannerSettings } from "./banner-settings";
import { AppDialog as Alert } from "./dialog-service";
import React, { useState, useRef } from "react";
import { View, ScrollView, TextInput, Platform, Switch } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  IndianRupee,
  Boxes,
  TriangleAlert,
  UsersRound,
  Sparkles,
  Send,
  Volume2,
  Bell,
  LockKeyhole,
  LogOut,
} from "lucide-react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";
import { useAuth, useLoad, alertError } from "./state";
import {
  C,
  F,
  T,
  Button,
  Input,
  SectionTitle,
  Card,
  Page,
  Loading,
  ErrorView,
  Notice,
  Sheet,
  money,
} from "./ui";
import { AnalyticsDashboard } from "./admin-analytics";
import { StatGrid, RangeBar, rangeDays } from "./admin-common";
import { registerNotifications, notificationsEnabled } from "./realtime";
import { KEYBOARD_CLEARANCE } from "./keyboard-layout";
import type { Dashboard, Store, Session } from "./types";
export function DashboardScreen({
  onInventory,
  onOrders,
}: {
  onInventory: () => void;
  onOrders: () => void;
}) {
  const { user, epoch } = useAuth();
  const [range, setRange] = useState(rangeDays(30));
  const result = useLoad<Dashboard>(
    () =>
      api.get(`/api/admin/reports/dashboard?from=${range.from}&to=${range.to}`),
    [range.from, range.to, epoch],
  );
  const d = result.data;
  const active =
    d?.orders
      .filter((o) => ["placed", "accepted", "packed"].includes(o.status))
      .reduce((s, o) => s + o.count, 0) || 0;
  return (
    <Page refresh={result.refresh} refreshing={result.loading && !!d}>
      <LinearGradient
        colors={[C.navy, "#284963"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 24, borderRadius: 26 }}
      >
        <T size={10} color={C.lime} style={{ letterSpacing: 1.6 }}>
          YOUR STORE AT A GLANCE
        </T>
        <T bold size={30} color={C.white} style={{ marginTop: 9 }}>
          Hello, {user?.name.split(" ")[0]}.
        </T>
        <T size={13} color="#C9D8E8" style={{ marginTop: 7, lineHeight: 20 }}>
          A good day to keep your neighbourhood stocked.
        </T>
      </LinearGradient>
      <RangeBar range={range} onChange={setRange} />
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : !d ? (
        <Loading />
      ) : (
        <>
          <StatGrid
            items={[
              {
                title: "Net sales revenue",
                value: money(d.sales.stats.revenue),
                note: "Picked-up and imported sales in period",
                icon: <IndianRupee size={17} color={C.forest} />,
              },
              {
                title: "Active pickup orders",
                value: String(active),
                note: "Waiting, preparing or packed",
                icon: <Boxes size={17} color={C.forest} />,
              },
              {
                title: "Low-stock products",
                value: String(d.inventory.stats.lowStock),
                note: "Check available quantities",
                icon: <TriangleAlert size={17} color={C.amber} />,
              },
              {
                title: "Customers",
                value: String(d.customers.total),
                note: "Active customer accounts",
                icon: <UsersRound size={17} color={C.forest} />,
              },
            ]}
          />
          <AnalyticsDashboard dashboard={d} onInventory={onInventory} />
          <Card>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 17,
              }}
            >
              <T bold size={17}>
                Needs a little attention
              </T>
              <TriangleAlert size={19} color={C.amber} />
            </View>
            {d.inventory.lowStock.length ? (
              d.inventory.lowStock.slice(0, 6).map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderColor: C.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <T size={12} bold>
                      {p.name}
                    </T>
                    <T size={10} color={C.muted} style={{ marginTop: 4 }}>
                      {p.sku} · {p.unit}
                    </T>
                  </View>
                  <T bold size={12} color={C.amber}>
                    {p.available} left
                  </T>
                </View>
              ))
            ) : (
              <T size={12} color={C.muted}>
                Your shelves are in good shape. No low-stock alerts.
              </T>
            )}
            <Button
              title="Review active orders"
              variant="secondary"
              onPress={onOrders}
              style={{ marginTop: 17 }}
            />
          </Card>
        </>
      )}
    </Page>
  );
}
type ChatMessage = { role: "user" | "assistant"; text: string };
export function AiScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [composerFocused, setComposerFocused] = useState(false),
    [error, setError] = useState(""),
    [range, setRange] = useState(rangeDays(30)),
    [asOf, setAsOf] = useState("");
  const scroll = useRef<ScrollView>(null);
  const send = async (text = input) => {
    if (!text.trim() || busy) return;
    const history = messages.slice(-12);
    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", text: text.trim() }]);
    setBusy(true);
    try {
      const r = await api.post<{ answer: string; asOf: string }>(
        "/api/admin/ai/chat",
        { message: text.trim(), history, from: range.from, to: range.to },
      );
      setMessages((current) => [
        ...current,
        { role: "assistant", text: r.answer },
      ]);
      setAsOf(r.asOf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setInput(text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      behavior="padding"
      automaticOffset
      keyboardVerticalOffset={KEYBOARD_CLEARANCE}
      style={{ flex: 1, backgroundColor: C.canvas }}
    >
      <View
        style={{
          padding: composerFocused ? 12 : 22,
          gap: composerFocused ? 0 : 15,
        }}
      >
        <SectionTitle
          title="AI summary"
          caption={
            composerFocused
              ? undefined
              : "Ask about your inventory, sales, customers and coupons."
          }
        />
        {!composerFocused && <RangeBar range={range} onChange={setRange} />}
        {!composerFocused && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Sparkles size={13} color={C.forest} />
            <T size={10} color={C.muted}>
              Live mart data · Read-only ·{" "}
              {asOf
                ? "Updated " +
                  new Date(asOf).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Gemini assistant"}
            </T>
          </View>
        )}
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingBottom: 20,
          gap: 15,
          maxWidth: 950,
          width: "100%",
          alignSelf: "center",
        }}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
      >
        {!messages.length && (
          <Card style={{ padding: 25 }}>
            <View
              style={{
                height: 52,
                width: 52,
                borderRadius: 18,
                backgroundColor: C.mint,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 17,
              }}
            >
              <Sparkles size={27} color={C.forest} />
            </View>
            <T bold size={23}>
              Your store has a story.
            </T>
            <T
              size={13}
              color={C.muted}
              style={{ lineHeight: 22, marginTop: 10, marginBottom: 20 }}
            >
              Ask in English or Hindi. I’ll use your store’s actual records to
              help you understand what’s selling, what needs restocking and how
              your customers are doing.
            </T>
            <View style={{ gap: 8 }}>
              {[
                "Which products need restocking?",
                "Give me a sales summary.",
                "How are my coupons being used?",
                "Tell me about my customers.",
              ].map((p) => (
                <Button
                  key={p}
                  title={p}
                  variant="secondary"
                  onPress={() => void send(p)}
                  style={{ justifyContent: "flex-start" }}
                />
              ))}
            </View>
          </Card>
        )}
        {messages.map((m, i) => (
          <View
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "94%",
              backgroundColor: m.role === "user" ? C.forest : C.white,
              borderWidth: m.role === "assistant" ? 1 : 0,
              borderColor: C.line,
              borderRadius: 21,
              padding: 17,
              gap: 8,
            }}
          >
            {m.role === "assistant" && (
              <T size={9} bold color={C.forest} style={{ letterSpacing: 1 }}>
                AONE ASSISTANT
              </T>
            )}
            <T
              size={14}
              color={m.role === "user" ? C.white : C.ink}
              style={{ lineHeight: 23 }}
            >
              {m.text}
            </T>
          </View>
        ))}
        {busy && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 12,
            }}
          >
            <BrandLoader size={38} />
            <T size={12} color={C.muted}>
              Checking your mart’s records...
            </T>
          </View>
        )}
        {error !== "" && <Notice text={error} type="error" />}
      </ScrollView>
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderColor: C.line,
          backgroundColor: C.white,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "flex-end",
            maxWidth: 950,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <TextInput
            accessibilityLabel="Ask anything about your mart"
            multiline
            textAlignVertical="top"
            placeholder="Ask anything about your mart..."
            placeholderTextColor={C.muted}
            value={input}
            onChangeText={setInput}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            maxLength={2000}
            style={{
              flex: 1,
              fontFamily: F.regular,
              fontSize: 14,
              minHeight: 48,
              maxHeight: 120,
              padding: 13,
              backgroundColor: C.canvas,
              borderRadius: 15,
              color: C.ink,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send to AI assistant"
            disabled={busy || !input.trim()}
            onPress={() => void send()}
            style={{
              height: 48,
              width: 48,
              borderRadius: 15,
              backgroundColor: busy || !input.trim() ? C.line : C.forest,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Send size={19} color={C.white} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
export function SettingsScreen() {
  const {
    epoch,
    bump,
    deviceToken,
    setDeviceToken,
    setSession,
    logout,
    setConnected,
  } = useAuth();
  const [draft, setDraft] = useState<Store | null>(null),
    [busy, setBusy] = useState(false),
    [notificationBusy, setNotificationBusy] = useState(false),
    [passwordOpen, setPasswordOpen] = useState(false),
    [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState("");
  const result = useLoad<{
    store: Store;
    aiConfigured: boolean;
    push: { registeredDevices: number; failedNotifications: number };
  }>(() => api.get("/api/admin/settings"), [epoch]);
  const form = draft ?? result.data?.store;
  const update = (k: keyof Store, v: string | boolean | number) => {
    if (form) setDraft({ ...form, [k]: v });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const saved = await api.put<{ store: Store }>(
        "/api/admin/settings",
        form,
      );
      setDraft(saved.store);
      bump();
      Alert.alert(
        "Store updated",
        "Customers will see the latest store and pickup details.",
      );
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const notifications = async () => {
    setNotificationBusy(true);
    try {
      const token = await registerNotifications();
      setDeviceToken(token);
      if (token)
        Alert.alert(
          "Notifications ready",
          "This device can receive mart order alerts.",
        );
      else {
        const p = await Notifications.getPermissionsAsync();
        Alert.alert(
          "Notification status",
          p.status === "granted"
            ? "Foreground alerts are enabled. Background alerts need the mart’s notification service configuration."
            : "Allow notifications in Android settings to receive order alerts.",
        );
      }
    } catch (e) {
      alertError(e);
    } finally {
      setNotificationBusy(false);
    }
  };
  const testTone = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Aone Mart order tone",
          body: "This is your custom new-order alert.",
          sound: "aone_order.wav",
        },
        trigger:
          Platform.OS === "android" ? { channelId: "aone-orders-v1" } : null,
      });
    } catch (e) {
      alertError(e);
    }
  };
  const savePassword = async () => {
    setBusy(true);
    try {
      const s = await api.post<Session>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      await setSession(s);
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      Alert.alert("Password updated", "Other sessions must log in again.");
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page>
      <SectionTitle
        title="Store settings"
        caption="The details that make pickup feel easy."
      />
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : !form ? (
        <Loading />
      ) : (
        <>
          <Card>
            <T bold size={17} style={{ marginBottom: 20 }}>
              Your mart
            </T>
            <Input
              label="Store name"
              value={form.name}
              onChangeText={(v) => update("name", v)}
            />
            <Input
              label="Tagline"
              value={form.tagline}
              onChangeText={(v) => update("tagline", v)}
            />
            <Input
              label="Pickup address"
              multiline
              value={form.address}
              onChangeText={(v) => update("address", v)}
              style={{
                minHeight: 75,
                textAlignVertical: "top",
                paddingTop: 12,
              }}
            />
            <Input
              label="Mart phone"
              value={form.phone}
              onChangeText={(v) => update("phone", v)}
              keyboardType="phone-pad"
              maxLength={10}
            />
            <Input
              label="Store hours"
              value={form.hours}
              onChangeText={(v) => update("hours", v)}
            />
            <Input
              label="Pickup instructions"
              multiline
              value={form.pickupInstructions}
              onChangeText={(v) => update("pickupInstructions", v)}
              style={{
                minHeight: 80,
                textAlignVertical: "top",
                paddingTop: 12,
              }}
            />
            <Input
              label="Location link (HTTPS)"
              value={form.mapsUrl}
              onChangeText={(v) => update("mapsUrl", v)}
              keyboardType="url"
              autoCapitalize="none"
            />
            <Input
              label="Points earned per full ₹100 after pickup"
              value={String(form.pointsPer100Rupees)}
              onChangeText={(v) => update("pointsPer100Rupees", Number(v) || 0)}
              keyboardType="number-pad"
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 15,
                marginBottom: 18,
              }}
            >
              <T style={{ flex: 1 }} bold size={13}>
                Accept new pickup orders
              </T>
              <Switch
                value={form.acceptingOrders}
                onValueChange={(v) => update("acceptingOrders", v)}
                trackColor={{ true: C.forest, false: C.line }}
                thumbColor={C.white}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 15,
                marginBottom: 22,
              }}
            >
              <View style={{ flex: 1 }}>
                <T bold size={13}>
                  Show sample catalog label
                </T>
                <T size={10} color={C.muted} style={{ marginTop: 5 }}>
                  Turn off after replacing sample products with your real
                  inventory.
                </T>
              </View>
              <Switch
                value={form.demoCatalog || false}
                onValueChange={(v) => update("demoCatalog", v)}
                trackColor={{ true: C.forest, false: C.line }}
                thumbColor={C.white}
              />
            </View>
            <Button title="Save store details" onPress={save} loading={busy} />
          </Card>
          <BannerSettings />
          <Card>
            <T bold size={17} style={{ marginBottom: 10 }}>
              Order notifications
            </T>
            <T
              size={12}
              color={C.muted}
              style={{ lineHeight: 21, marginBottom: 17 }}
            >
              {!notificationsEnabled
                ? "Notifications are deferred for this build. Orders and status updates remain available inside the app."
                : deviceToken
                  ? "This device is registered for remote order alerts."
                  : "Enable alerts on this device. Background alerts require the store’s notification service to be configured."}
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                title="Enable notifications"
                disabled={!notificationsEnabled}
                variant="secondary"
                onPress={notifications}
                loading={notificationBusy}
                icon={<Bell size={15} color={C.forest} />}
              />
              <Button
                title="Test order tone"
                disabled={!notificationsEnabled}
                variant="ghost"
                onPress={testTone}
                icon={<Volume2 size={17} color={C.forest} />}
              />
            </View>
            {!!result.data?.push.failedNotifications && (
              <View style={{ marginTop: 15 }}>
                <Notice
                  text={`${result.data.push.failedNotifications} alerts are delayed. Contact the mart service administrator.`}
                  type="error"
                />
              </View>
            )}
          </Card>
          <Card>
            <T bold size={17} style={{ marginBottom: 10 }}>
              AI assistant
            </T>
            <T size={12} color={C.muted} style={{ lineHeight: 21 }}>
              {result.data?.aiConfigured
                ? "Gemini is configured on the mart service. The assistant can read reports and summarize your business."
                : "Gemini has not been configured on the mart service yet."}
            </T>
          </Card>
          <Button
            title="Change admin password"
            variant="secondary"
            onPress={() => setPasswordOpen(true)}
            icon={<LockKeyhole size={16} color={C.forest} />}
          />
          <Button
            title="Change mart connection"
            variant="ghost"
            onPress={() =>
              Alert.alert(
                "Change mart service?",
                "You will be signed out before connecting to a different mart service.",
                [
                  { text: "Keep current", style: "cancel" },
                  {
                    text: "Change service",
                    onPress: async () => {
                      await logout();
                      setConnected(false);
                    },
                  },
                ],
              )
            }
          />
          <Button
            title="Log out"
            variant="danger"
            onPress={() => void logout()}
            icon={<LogOut size={16} color={C.red} />}
          />
        </>
      )}
      <Sheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change admin password"
      >
        <Input
          label="Current password"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <Input
          label="New password"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
        />
        <Button title="Update password" loading={busy} onPress={savePassword} />
      </Sheet>
    </Page>
  );
}

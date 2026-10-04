import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";
import { useAuth } from "./state";
export const notificationsEnabled =
  Constants.expoConfig?.extra?.notificationsEnabled === true;
const received = new Set<string>(),
  displayed = new Set<string>();
function remember(set: Set<string>, id: string) {
  set.add(id);
  if (set.size > 200) set.delete(set.values().next().value!);
}
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const eventId = String(
      notification.request.content.data?.eventId ||
        notification.request.identifier,
    );
    const duplicate = displayed.has(eventId);
    if (!duplicate) remember(displayed, eventId);
    return {
      shouldShowBanner: notificationsEnabled && !duplicate,
      shouldShowList: notificationsEnabled && !duplicate,
      shouldPlaySound: notificationsEnabled && !duplicate,
      shouldSetBadge: false,
    };
  },
});
export async function registerNotifications() {
  if (!notificationsEnabled) return "";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("aone-orders-v1", {
      name: "New mart orders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "aone_order.wav",
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#1E5C43",
    });
    await Notifications.setNotificationChannelAsync("aone-updates", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted")
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return "";
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId || !Device.isDevice) return "";
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post("/api/devices", { token: data });
  return data;
}
export function useRealtime(onOrderPress?: () => void) {
  const { user, bump, setDeviceToken, refreshUser } = useAuth();
  const bumpRef = useRef(bump);
  const pressRef = useRef(onOrderPress);
  useEffect(() => {
    bumpRef.current = bump;
    pressRef.current = onOrderPress;
  }, [bump, onOrderPress]);
  const userId = user?.id,
    userRole = user?.role;
  useEffect(() => {
    if (!userId) return;
    let live = true,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempt = 0;
    registerNotifications()
      .then((token) => {
        if (live) setDeviceToken(token);
      })
      .catch(() => {});
    const connect = async () => {
      if (!live || AppState.currentState !== "active") return;
      try {
        await api.get("/api/auth/me");
        if (!live) return;
        socket = new WebSocket(
          api.baseUrl.replace(/^http/, "ws") + "/realtime",
        );
        socket.onopen = () => {
          attempt = 0;
          socket?.send(
            JSON.stringify({ type: "auth", token: api.accessToken }),
          );
        };
        socket.onmessage = (e) => {
          try {
            const n = JSON.parse(e.data);
            if (n.type !== "notification" || received.has(n.id)) return;
            remember(received, n.id);
            bumpRef.current();
            void refreshUser();
            if (notificationsEnabled)
              void Notifications.scheduleNotificationAsync({
                content: {
                  title: n.title,
                  body: n.body,
                  data: n.data,
                  sound: n.sound,
                },
                trigger:
                  Platform.OS === "android"
                    ? {
                        channelId:
                          n.sound === "aone_order.wav"
                            ? "aone-orders-v1"
                            : "aone-updates",
                      }
                    : null,
              }).catch(() => {});
          } catch {}
        };
        socket.onclose = () => {
          if (live && AppState.currentState === "active")
            retry = setTimeout(connect, Math.min(30000, 1500 * 2 ** attempt++));
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        if (live)
          retry = setTimeout(connect, Math.min(30000, 2000 * 2 ** attempt++));
      }
    };
    void connect();
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (retry) clearTimeout(retry);
        if (!socket || socket.readyState === WebSocket.CLOSED) void connect();
        bumpRef.current();
      } else {
        if (retry) clearTimeout(retry);
        socket?.close();
      }
    });
    const receivedSubscription = notificationsEnabled
      ? Notifications.addNotificationReceivedListener((n) => {
          const eid = String(n.request.content.data?.eventId || "");
          if (eid && !received.has(eid)) {
            remember(received, eid);
            bumpRef.current();
            void refreshUser();
          }
        })
      : undefined;
    const responseSubscription = notificationsEnabled
      ? Notifications.addNotificationResponseReceivedListener(() =>
          pressRef.current?.(),
        )
      : undefined;
    if (notificationsEnabled)
      void Notifications.getLastNotificationResponseAsync().then((r) => {
        if (live && r) pressRef.current?.();
      });
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
      socket?.close();
      appSubscription.remove();
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, [userId, userRole, setDeviceToken, refreshUser]);
}

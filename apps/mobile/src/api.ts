import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import type { Session } from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "",
    public details?: unknown,
  ) {
    super(message);
  }
}
let baseUrl = "",
  accessToken = "",
  refreshToken = "",
  refreshing: Promise<boolean> | undefined;
let expired = () => {};
export const api = {
  get baseUrl() {
    return baseUrl;
  },
  get accessToken() {
    return accessToken;
  },
  async init() {
    const [url, a, r] = await Promise.all([
      AsyncStorage.getItem("aone-api-url"),
      SecureStore.getItemAsync("aone-access"),
      SecureStore.getItemAsync("aone-refresh"),
    ]);
    baseUrl = url || process.env.EXPO_PUBLIC_API_URL || "";
    accessToken = a || "";
    refreshToken = r || "";
    return { configured: !!baseUrl, hasSession: !!refreshToken };
  },
  async setUrl(url: string) {
    const trimmed = url.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ApiError("Enter a valid service URL.");
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      throw new ApiError(
        "Use a base URL such as https://api.example.com, with no path.",
      );
    if (
      !__DEV__ &&
      !Constants.expoConfig?.extra?.allowHttp &&
      parsed.protocol !== "https:"
    )
      throw new ApiError("This release requires an HTTPS service URL.");
    if (baseUrl && trimmed !== baseUrl) await api.clear();
    baseUrl = trimmed;
    await AsyncStorage.setItem("aone-api-url", baseUrl);
  },
  onExpired(fn: () => void) {
    expired = fn;
  },
  async save(session: Session) {
    accessToken = session.accessToken;
    refreshToken = session.refreshToken;
    await Promise.all([
      SecureStore.setItemAsync("aone-access", accessToken),
      SecureStore.setItemAsync("aone-refresh", refreshToken),
      SecureStore.setItemAsync("aone-user", JSON.stringify(session.user)),
    ]);
  },
  async clear() {
    accessToken = "";
    refreshToken = "";
    await Promise.all([
      SecureStore.deleteItemAsync("aone-access"),
      SecureStore.deleteItemAsync("aone-refresh"),
      SecureStore.deleteItemAsync("aone-user"),
    ]);
  },
  async request<T = any>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    if (!baseUrl) throw new ApiError("Connect your mart service first.");
    const usedAccess = accessToken;
    const isForm = options.body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(!isForm ? { "Content-Type": "application/json" } : {}),
      ...(usedAccess ? { Authorization: `Bearer ${usedAccess}` } : {}),
    };
    Object.assign(headers, options.headers);
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      isForm ||
        path.includes("/ai/") ||
        path.includes("/preview") ||
        path === "/api/catalog/product-images"
        ? 60000
        : 15000,
    );
    try {
      // Expo File implements Blob through native getters. RN's global fetch
      // spreads FormData parts and loses those getters before sending them.
      const request = isForm ? expoFetch : fetch;
      response = await request(baseUrl + path, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        "Cannot reach the mart. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (
      response.status === 401 &&
      retry &&
      refreshToken &&
      !["/api/auth/login", "/api/auth/signup", "/api/auth/refresh"].includes(
        path,
      )
    ) {
      if (usedAccess !== accessToken && accessToken)
        return api.request<T>(path, options, false);
      if (!refreshing)
        refreshing = refreshSession().finally(() => {
          refreshing = undefined;
        });
      if (await refreshing) return api.request<T>(path, options, false);
      await api.clear();
      expired();
    }
    const payload = await response.json().catch(() => ({
      error: "The mart service returned an invalid response.",
    }));
    if (!response.ok) {
      const validation = Array.isArray(payload.details)
        ? payload.details
            .map((v: { message?: string }) => v.message)
            .filter(Boolean)
            .slice(0, 3)
            .join("\n")
        : "";
      throw new ApiError(
        validation || payload.error || "Request failed.",
        response.status,
        payload.code,
        payload.details,
      );
    }
    return payload as T;
  },
  get<T = any>(path: string) {
    return api.request<T>(path);
  },
  post<T = any>(path: string, data: unknown, headers?: Record<string, string>) {
    return api.request<T>(path, {
      method: "POST",
      body: JSON.stringify(data),
      headers,
    });
  },
  patch<T = any>(path: string, data: unknown) {
    return api.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  put<T = any>(path: string, data: unknown) {
    return api.request<T>(path, { method: "PUT", body: JSON.stringify(data) });
  },
  delete<T = any>(path: string) {
    return api.request<T>(path, { method: "DELETE" });
  },
  async logout(deviceToken?: string) {
    try {
      await api.get("/api/auth/me");
      await api.post("/api/auth/logout", { refreshToken, deviceToken });
    } catch {}
    await api.clear();
  },
};
async function refreshSession() {
  try {
    const session = await api.request<Session>(
      "/api/auth/refresh",
      { method: "POST", body: JSON.stringify({ refreshToken }) },
      false,
    );
    await api.save(session);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) throw error;
    return false;
  }
}

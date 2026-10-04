import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { api, ApiError } from "./api";
import type { User, Session, CartLine, Product } from "./types";
type AuthState = {
  user: User | null;
  loading: boolean;
  connected: boolean;
  epoch: number;
  deviceToken: string;
  setDeviceToken: (s: string) => void;
  setConnected: (v: boolean) => void;
  setSession: (s: Session) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  bump: () => void;
};
const AuthContext = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [epoch, setEpoch] = useState(0),
    [deviceToken, setDeviceToken] = useState("");
  useEffect(() => {
    let live = true;
    api.onExpired(() => {
      setUser(null);
    });
    (async () => {
      try {
        const initial = await api.init();
        if (!live) return;
        setConnected(initial.configured);
        if (initial.hasSession) {
          try {
            const r = await api.get<{ user: User }>("/api/auth/me");
            if (live) setUser(r.user);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              await api.clear();
            } else {
              const saved = await SecureStore.getItemAsync("aone-user");
              if (live && saved) setUser(JSON.parse(saved));
            }
          }
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const setSession = async (session: Session) => {
    await api.save(session);
    setUser(session.user);
    setConnected(true);
  };
  const refreshUser = useCallback(async () => {
    try {
      const r = await api.get<{ user: User }>("/api/auth/me");
      setUser(r.user);
      await SecureStore.setItemAsync("aone-user", JSON.stringify(r.user));
    } catch {}
  }, []);
  const logout = async () => {
    await api.logout(deviceToken || undefined);
    setUser(null);
    setDeviceToken("");
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        connected,
        epoch,
        deviceToken,
        setDeviceToken,
        setConnected,
        setSession,
        refreshUser,
        logout,
        bump: () => setEpoch((n) => n + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
type CartState = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (p: Product) => void;
  change: (pid: string, quantity: number) => void;
  clear: () => Promise<void>;
  ready: boolean;
};
const CartContext = createContext<CartState>(null!);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <SessionCartProvider key={user?.id || "signed-out"} user={user}>
      {children}
    </SessionCartProvider>
  );
}
function SessionCartProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const userId = user?.id;
  const [lines, setLines] = useState<CartLine[]>([]),
    [ready, setReady] = useState(!userId);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    AsyncStorage.getItem(`aone-cart-${userId}`)
      .then((s) => {
        if (!live) return;
        try {
          setLines(s ? JSON.parse(s) : []);
        } catch {
          setLines([]);
        }
        setReady(true);
      })
      .catch(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  useEffect(() => {
    if (ready && userId)
      void AsyncStorage.setItem(
        `aone-cart-${userId}`,
        JSON.stringify(lines),
      ).catch(() => {});
  }, [lines, ready, userId]);
  const add = (product: Product) => {
    setLines((current) => {
      const old = current.find((l) => l.product.id === product.id),
        qty = (old?.quantity || 0) + 1;
      if (qty > product.available) {
        Alert.alert(
          "Stock limit",
          `Only ${product.available} available right now.`,
        );
        return current;
      }
      void Haptics.selectionAsync().catch(() => {});
      return old
        ? current.map((l) =>
            l.product.id === product.id ? { product, quantity: qty } : l,
          )
        : [...current, { product, quantity: 1 }];
    });
  };
  const change = (pid: string, quantity: number) =>
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.product.id !== pid)
        : current.map((l) =>
            l.product.id === pid
              ? { ...l, quantity: Math.min(quantity, 999) }
              : l,
          ),
    );
  const clear = async () => {
    setLines([]);
    if (user) await AsyncStorage.removeItem(`aone-cart-${user.id}`);
  };
  return (
    <CartContext.Provider
      value={{
        lines,
        ready,
        add,
        change,
        clear,
        count: lines.reduce((s, l) => s + l.quantity, 0),
        subtotal: lines.reduce((s, l) => s + l.product.price * l.quantity, 0),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export const useCart = () => useContext(CartContext);
export function useLoad<T>(
  loader: () => Promise<T>,
  dependencies: unknown[] = [],
) {
  const [version, setVersion] = useState(0);
  const dependencyKey = JSON.stringify(dependencies);
  const requestKey = JSON.stringify([dependencyKey, version]);
  const [settled, setSettled] = useState<{
    data: T | null;
    error: string;
    dependencyKey: string;
    requestKey: string;
  }>({ data: null, error: "", dependencyKey: "", requestKey: "" });
  const load = useRef(loader);
  useEffect(() => {
    load.current = loader;
  });
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => load.current())
      .then((data) => {
        if (live) setSettled({ data, error: "", dependencyKey, requestKey });
      })
      .catch((e) => {
        if (live)
          setSettled((previous) => ({
            data:
              previous.dependencyKey === dependencyKey ? previous.data : null,
            error: e.message || "Please try again.",
            dependencyKey,
            requestKey,
          }));
      });
    return () => {
      live = false;
    };
  }, [dependencyKey, requestKey]);
  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  return {
    data: settled.dependencyKey === dependencyKey ? settled.data : null,
    error: settled.requestKey === requestKey ? settled.error : "",
    loading: settled.requestKey !== requestKey,
    refresh,
  };
}
export function usePoll(refresh: () => void, seconds = 20) {
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, seconds * 1000);
    return () => clearInterval(interval);
  }, [refresh, seconds]);
}
export const alertError = (e: unknown) =>
  Alert.alert(
    "Please check",
    e instanceof Error ? e.message : "Please try again.",
  );

import React, { useState, useEffect } from "react";
import {
  View,
  FlatList,
  ScrollView,
  Pressable,
  useWindowDimensions,
  RefreshControl,
  Alert,
  Switch,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bell,
  MapPin,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Ticket,
  Gift,
  Package,
  Check,
  LogOut,
  LockKeyhole,
  ChevronRight,
  Store as StoreIcon,
  Leaf,
} from "lucide-react-native";
import { api } from "./api";
import { useAuth, useCart, useLoad, usePoll, alertError } from "./state";
import {
  C,
  T,
  Button,
  Input,
  Card,
  SectionTitle,
  Chip,
  SearchInput,
  Empty,
  ErrorView,
  Loading,
  Sheet,
  Page,
  Notice,
  Status,
  money,
  dateLabel,
} from "./ui";
import { ProductArt, artBackground } from "./art";
import type {
  Category,
  Product,
  Store,
  Order,
  Quote,
  Coupon,
  Session,
} from "./types";
export function Stepper({
  quantity,
  onChange,
  compact = false,
}: {
  quantity: number;
  onChange: (n: number) => void;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.forest,
        borderRadius: 11,
        height: compact ? 31 : 36,
      }}
    >
      <Pressable
        accessibilityLabel="Remove one"
        onPress={() => onChange(quantity - 1)}
        style={{ padding: compact ? 7 : 9 }}
      >
        <Minus size={14} color={C.white} />
      </Pressable>
      <T bold size={12} color={C.white}>
        {quantity}
      </T>
      <Pressable
        accessibilityLabel="Add one"
        onPress={() => onChange(quantity + 1)}
        style={{ padding: compact ? 7 : 9 }}
      >
        <Plus size={14} color={C.white} />
      </Pressable>
    </View>
  );
}
function NotificationsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { epoch } = useAuth();
  const result = useLoad<{
    notifications: {
      id: string;
      title: string;
      body: string;
      createdAt: string;
    }[];
  }>(
    () =>
      open
        ? api.get("/api/devices/notifications")
        : Promise.resolve({ notifications: [] }),
    [open, epoch],
  );
  return (
    <Sheet visible={open} onClose={onClose} title="Your updates">
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : result.loading ? (
        <Loading />
      ) : result.data?.notifications.length ? (
        result.data.notifications.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => {
              onClose();
              router.navigate("/(customer)/orders");
            }}
            style={{
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: C.line,
            }}
          >
            <T bold>{n.title}</T>
            <T
              size={12}
              color={C.muted}
              style={{ lineHeight: 20, marginTop: 6 }}
            >
              {n.body}
            </T>
            <T size={10} color={C.muted} style={{ marginTop: 7 }}>
              {dateLabel(n.createdAt)}
            </T>
          </Pressable>
        ))
      ) : (
        <Empty title="All caught up" detail="Order updates will appear here." />
      )}
    </Sheet>
  );
}
export function HomeScreen() {
  const { user, epoch } = useAuth(),
    cart = useCart(),
    { width } = useWindowDimensions();
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [category, setCategory] = useState(""),
    [offset, setOffset] = useState(0),
    [notifications, setNotifications] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const meta = useLoad<{ store: Store; categories: Category[] }>(async () => {
    const [s, c] = await Promise.all([
      api.get("/api/catalog/store"),
      api.get("/api/catalog/categories"),
    ]);
    return { ...s, ...c };
  }, [epoch]);
  const result = useLoad<{ products: Product[]; total: number }>(
    () =>
      api.get(
        `/api/catalog/products?limit=30&offset=${offset}&q=${encodeURIComponent(debounced)}&categoryId=${category}`,
      ),
    [category, debounced, offset, epoch],
  );
  const columns = width >= 1000 ? 4 : width >= 650 ? 3 : 2;
  const contentWidth = Math.min(width, 1100),
    cardWidth = (contentWidth - 44 - (columns - 1) * 12) / columns;
  const header = (
    <View style={{ gap: 21, marginBottom: 20 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <T size={11} color={C.muted}>
            PICKUP AT YOUR NEIGHBOURHOOD MART
          </T>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 6,
            }}
          >
            <MapPin size={16} color={C.forest} />
            <T bold size={20}>
              {meta.data?.store.name || "Aone Mart"}
            </T>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Order notifications"
          onPress={() => setNotifications(true)}
          style={{
            height: 44,
            width: 44,
            backgroundColor: C.white,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: C.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={21} color={C.ink} />
        </Pressable>
      </View>
      <View>
        <T size={26} bold>
          Good things, {user?.name.split(" ")[0]}.
        </T>
        <T size={13} color={C.muted} style={{ marginTop: 5 }}>
          A fresh start to your everyday shopping.
        </T>
      </View>
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search rice, milk, essentials..."
      />
      {meta.data?.store.demoCatalog && (
        <Notice text="Sample catalog. The mart admin can import the actual products and prices." />
      )}
      {meta.data?.store.acceptingOrders === false && (
        <Notice text="The mart is currently not accepting new orders. You can still browse." />
      )}
      {!debounced && !category && (
        <LinearGradient
          colors={["#1E5C43", "#386C48"]}
          style={{
            borderRadius: 24,
            padding: 24,
            minHeight: 179,
            overflow: "hidden",
          }}
        >
          <View style={{ width: "64%", gap: 8 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Leaf size={12} color={C.mint} />
              <T size={9} bold color={C.mint} style={{ letterSpacing: 1.7 }}>
                FRESH PICKS. LOCAL LOVE.
              </T>
            </View>
            <T size={25} bold color={C.white} style={{ lineHeight: 29 }}>
              Your daily basket,{String.fromCharCode(10)}made better.
            </T>
            <T size={11} color="#D5E6D9" style={{ lineHeight: 18 }}>
              Shop now. Pick up when it’s packed.
            </T>
            <Pressable
              onPress={() => {
                const c = meta.data?.categories.find(
                  (x) => x.name === "Groceries",
                );
                if (c) {
                  setCategory(c.id);
                  setOffset(0);
                }
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                marginTop: 3,
              }}
            >
              <T size={12} bold color={C.mint}>
                Explore groceries
              </T>
              <ArrowRight size={15} color={C.mint} />
            </Pressable>
          </View>
          <View
            style={{
              position: "absolute",
              right: -10,
              bottom: 3,
              transform: [{ rotate: "12deg" }],
            }}
          >
            <ProductArt artwork="rice" width={175} height={160} />
          </View>
          <View
            style={{
              position: "absolute",
              right: 59,
              bottom: -34,
              transform: [{ rotate: "-14deg" }],
            }}
          >
            <ProductArt artwork="fruit" width={119} height={108} />
          </View>
        </LinearGradient>
      )}
      <View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 13,
          }}
        >
          <T bold size={18}>
            Explore categories
          </T>
          <T size={10} color={C.muted}>
            {meta.data?.categories.length || 0} categories
          </T>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <Chip
            label="All"
            selected={!category}
            onPress={() => {
              setCategory("");
              setOffset(0);
            }}
          />
          {meta.data?.categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={category === c.id}
              onPress={() => {
                setCategory(c.id);
                setOffset(0);
              }}
            />
          ))}
        </ScrollView>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <T bold size={20}>
          {debounced
            ? "Search results"
            : category
              ? meta.data?.categories.find((c) => c.id === category)?.name
              : "Everyday favourites"}
        </T>
        <T size={11} color={C.muted}>
          {result.data?.total || 0} products
        </T>
      </View>
      {result.error && (
        <ErrorView error={result.error} retry={result.refresh} />
      )}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <FlatList
        key={columns}
        data={result.error ? [] : result.data?.products || []}
        numColumns={columns}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{
          padding: 22,
          width: "100%",
          maxWidth: 1100,
          alignSelf: "center",
          paddingBottom: 24,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={result.loading && !!result.data}
            onRefresh={() => {
              result.refresh();
              meta.refresh();
            }}
            tintColor={C.forest}
          />
        }
        renderItem={({ item: p }) => {
          const quantity =
            cart.lines.find((l) => l.product.id === p.id)?.quantity || 0;
          return (
            <View
              style={{
                width: cardWidth,
                backgroundColor: C.white,
                borderRadius: 21,
                padding: 10,
                borderWidth: 1,
                borderColor: C.line,
              }}
            >
              <View
                style={{
                  backgroundColor:
                    artBackground[p.artwork] || artBackground.bag,
                  borderRadius: 15,
                  height: 128,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ProductArt
                  key={p.imageUrl}
                  artwork={p.artwork}
                  imageUrl={p.imageUrl}
                  width={Math.min(cardWidth - 24, 150)}
                  height={122}
                />
                {p.mrp > p.price && (
                  <View
                    style={{
                      position: "absolute",
                      left: 7,
                      top: 7,
                      backgroundColor: C.white,
                      borderRadius: 6,
                      padding: 5,
                    }}
                  >
                    <T bold size={8} color={C.forest}>
                      {Math.round((1 - p.price / p.mrp) * 100)}% OFF
                    </T>
                  </View>
                )}
              </View>
              <View style={{ padding: 3, paddingTop: 12, gap: 4 }}>
                <T bold size={13} numberOfLines={2} style={{ minHeight: 34 }}>
                  {p.name}
                </T>
                <T size={10} color={C.muted}>
                  {p.unit}
                </T>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <View>
                    <T bold size={17}>
                      {money(p.price)}
                    </T>
                    {p.mrp > p.price && (
                      <T
                        size={10}
                        color={C.muted}
                        style={{ textDecorationLine: "line-through" }}
                      >
                        {money(p.mrp)}
                      </T>
                    )}
                  </View>
                  {quantity > 0 ? (
                    <Stepper
                      compact
                      quantity={quantity}
                      onChange={(q) =>
                        q > quantity ? cart.add(p) : cart.change(p.id, q)
                      }
                    />
                  ) : (
                    <Pressable
                      disabled={!p.available}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${p.name} to cart`}
                      onPress={() => cart.add(p)}
                      style={{
                        backgroundColor: p.available ? C.forest : C.line,
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Plus size={19} color={C.white} />
                    </Pressable>
                  )}
                </View>
                {!p.available && (
                  <T size={9} color={C.red}>
                    Out of stock
                  </T>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          result.loading ? (
            <Loading />
          ) : result.error ? null : (
            <Empty
              title="No products found"
              detail="Try another search or category."
            />
          )
        }
        ListFooterComponent={
          <View style={{ marginTop: 22, gap: 18 }}>
            {(result.data?.total || 0) > 30 && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                <Button
                  title="Previous"
                  variant="secondary"
                  disabled={!offset}
                  onPress={() => setOffset((v) => Math.max(0, v - 30))}
                />
                <Button
                  title="Next"
                  variant="secondary"
                  disabled={offset + 30 >= (result.data?.total || 0)}
                  onPress={() => setOffset((v) => v + 30)}
                />
              </View>
            )}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 7,
              }}
            >
              <ShoppingBag size={13} color={C.muted} />
              <T size={10} color={C.muted}>
                Order online · Pay at mart · Pick up with ease
              </T>
            </View>
          </View>
        }
      />
      <NotificationsSheet
        open={notifications}
        onClose={() => setNotifications(false)}
      />
    </View>
  );
}
export function CartScreen() {
  const cart = useCart(),
    { user, refreshUser, epoch } = useAuth();
  const { coupon: incomingCoupon } = useLocalSearchParams<{
    coupon?: string;
  }>();
  const [couponInput, setCouponInput] = useState(incomingCoupon || ""),
    [coupon, setCoupon] = useState(incomingCoupon || ""),
    [redeem, setRedeem] = useState(false),
    [notes, setNotes] = useState(""),
    [placing, setPlacing] = useState(false);
  const [seenCoupon, setSeenCoupon] = useState(incomingCoupon || "");
  if ((incomingCoupon || "") !== seenCoupon) {
    setSeenCoupon(incomingCoupon || "");
    if (incomingCoupon) {
      setCoupon(incomingCoupon);
      setCouponInput(incomingCoupon);
    }
  }
  useEffect(() => {
    if (incomingCoupon) router.setParams({ coupon: "" });
  }, [incomingCoupon]);
  const payload = {
    items: cart.lines.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
    })),
    couponCode: coupon,
    redeemPoints: redeem
      ? Math.min(user?.points || 0, Math.floor(cart.subtotal / 100))
      : 0,
  };
  const signature = JSON.stringify(payload);
  const quote = useLoad<{ quote: Quote }>(
    () =>
      cart.lines.length
        ? api.post("/api/orders/quote", payload)
        : Promise.resolve({
            quote: {
              subtotal: 0,
              total: 0,
              couponDiscount: 0,
              pointsSpent: 0,
              pointsDiscount: 0,
              couponCode: null,
              items: [],
            },
          }),
    [signature, epoch],
  );
  const place = async () => {
    if (placing || !quote.data || quote.loading || quote.error) return;
    setPlacing(true);
    try {
      const full = { ...payload, notes },
        fingerprint = JSON.stringify(full),
        storageKey = `aone-checkout-${user!.id}`;
      const saved = await AsyncStorage.getItem(storageKey);
      let attempt: { key: string; fingerprint: string } | undefined;
      try {
        attempt = saved ? JSON.parse(saved) : undefined;
      } catch {}
      if (attempt?.fingerprint !== fingerprint) {
        attempt = {
          key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
          fingerprint,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(attempt));
      }
      const r = await api.post<{ order: Order }>(
        "/api/orders",
        { ...full, expectedTotal: quote.data.quote.total },
        {
          "Idempotency-Key": attempt!.key,
        },
      );
      await cart.clear();
      await AsyncStorage.removeItem(storageKey);
      await refreshUser();
      setCoupon("");
      setCouponInput("");
      setNotes("");
      setRedeem(false);
      Alert.alert(
        "Order placed",
        `${r.order.number} is with the mart. We’ll let you know when it’s ready for pickup.`,
        [
          {
            text: "View my order",
            onPress: () => router.navigate("/(customer)/orders"),
          },
        ],
      );
    } catch (e) {
      alertError(e);
      quote.refresh();
    } finally {
      setPlacing(false);
    }
  };
  if (!cart.ready) return <Loading />;
  if (!cart.lines.length)
    return (
      <Page>
        <SectionTitle title="Your basket" />
        <Empty
          title="A little empty here."
          detail="Add your everyday favourites and we’ll get them ready for pickup."
          action={
            <Button
              title="Explore the mart"
              onPress={() => router.navigate("/(customer)")}
              icon={<ArrowRight size={17} color={C.white} />}
            />
          }
        />
      </Page>
    );
  const q = quote.data?.quote;
  return (
    <Page>
      <SectionTitle
        title="Your basket"
        caption={`${cart.count} items · A little local goodness`}
      />
      <Card style={{ padding: 15 }}>
        {cart.lines.map((line, i) => (
          <View
            key={line.product.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              gap: 10,
              borderBottomWidth: i < cart.lines.length - 1 ? 1 : 0,
              borderColor: C.line,
            }}
          >
            <View
              style={{
                borderRadius: 13,
                backgroundColor: artBackground[line.product.artwork],
                width: 69,
                height: 70,
              }}
            >
              <ProductArt
                artwork={line.product.artwork}
                imageUrl={line.product.imageUrl}
                width={69}
                height={70}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <T bold size={13}>
                {line.product.name}
              </T>
              <T size={11} color={C.muted}>
                {line.product.unit} ·{" "}
                {money(
                  q?.items.find((p) => p.productId === line.product.id)
                    ?.unitPrice ?? line.product.price,
                )}
              </T>
              <T bold size={13}>
                {money(
                  q?.items.find((p) => p.productId === line.product.id)
                    ?.lineTotal ?? line.product.price * line.quantity,
                )}
              </T>
            </View>
            <Stepper
              compact
              quantity={line.quantity}
              onChange={(v) => cart.change(line.product.id, v)}
            />
          </View>
        ))}
      </Card>
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 15,
          }}
        >
          <Ticket size={19} color={C.forest} />
          <T bold>Have a little saving?</T>
        </View>
        <Input
          placeholder="Coupon code"
          value={couponInput}
          onChangeText={setCouponInput}
          autoCapitalize="characters"
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            title="Apply code"
            variant="secondary"
            onPress={() => setCoupon(couponInput.trim().toUpperCase())}
          />
          {coupon !== "" && (
            <Button
              title="Remove"
              variant="ghost"
              onPress={() => {
                setCoupon("");
                setCouponInput("");
              }}
            />
          )}
        </View>
      </Card>
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <T bold>Use reward points</T>
            <T size={12} color={C.muted}>
              {user?.points || 0} points available · 1 point = ₹1
            </T>
          </View>
          <Switch
            value={redeem}
            disabled={!user?.points}
            onValueChange={setRedeem}
            trackColor={{ true: C.forest, false: C.line }}
            thumbColor={C.white}
          />
        </View>
      </Card>
      {quote.error && <ErrorView error={quote.error} retry={quote.refresh} />}
      <Input
        label="A note for the mart (optional)"
        placeholder="Anything we should know?"
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        multiline
        style={{ minHeight: 70, textAlignVertical: "top", paddingTop: 12 }}
      />
      <Card>
        <View style={{ gap: 13 }}>
          <BillRow
            label="Items subtotal"
            value={money(q?.subtotal || cart.subtotal)}
          />
          <BillRow
            label="Coupon saving"
            value={"− " + money(q?.couponDiscount || 0)}
            color={C.forest}
          />
          <BillRow
            label="Reward saving"
            value={"− " + money(q?.pointsDiscount || 0)}
            color={C.forest}
          />
          <View style={{ height: 1, backgroundColor: C.line }} />
          <BillRow label="Pay at the mart" value={money(q?.total || 0)} bold />
          <T size={11} color={C.muted}>
            No delivery charges. This order is for pickup.
          </T>
        </View>
      </Card>
      <Button
        title={
          quote.loading
            ? "Updating basket..."
            : `Place pickup order · ${money(q?.total || 0)}`
        }
        onPress={place}
        loading={placing}
        disabled={!q || !!quote.error || quote.loading}
        icon={<ShoppingBag size={18} color={C.white} />}
      />
      <T
        size={11}
        color={C.muted}
        style={{ textAlign: "center", lineHeight: 18 }}
      >
        The mart will accept your order and notify you when it’s packed.
        {String.fromCharCode(10)}Pay at the counter when you collect it.
      </T>
    </Page>
  );
}
function BillRow({
  label,
  value,
  bold = false,
  color = C.ink,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T bold={bold} size={bold ? 16 : 13} color={bold ? C.ink : C.muted}>
        {label}
      </T>
      <T size={bold ? 20 : 13} bold color={color}>
        {value}
      </T>
    </View>
  );
}
export function OrderDetails({
  order,
  onClose,
  onUpdate,
  admin = false,
}: {
  order: Order | null;
  onClose: () => void;
  onUpdate?: (o: Order) => void;
  admin?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { refreshUser } = useAuth();
  const update = (status: "picked" | "cancelled") => {
    if (!order) return;
    Alert.alert(
      status === "picked"
        ? "Have you collected your order?"
        : "Cancel this order?",
      status === "picked"
        ? "Confirm only after collecting your items and paying at the mart."
        : "Your reserved stock, coupon and reward points will be released.",
      [
        { text: "Go back", style: "cancel" },
        {
          text: status === "picked" ? "Yes, picked up" : "Cancel order",
          style: status === "cancelled" ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            try {
              const r = await api.patch<{ order: Order }>(
                `/api/orders/${order.id}/status`,
                { status },
              );
              onUpdate?.(r.order);
              await refreshUser();
            } catch (e) {
              alertError(e);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };
  return (
    <Sheet visible={!!order} onClose={onClose} title="Order details">
      {order && (
        <View style={{ gap: 19 }}>
          <View style={{ gap: 9 }}>
            <Status value={order.status} />
            <T bold size={19}>
              {order.number}
            </T>
            <T size={11} color={C.muted}>
              {dateLabel(order.createdAt)} · {money(order.total)} · Pay at
              pickup
            </T>
          </View>
          {order.customer && (
            <T size={13}>
              {order.customer.name} · {order.customer.phone}
            </T>
          )}
          {["accepted", "packed"].includes(order.status) && (
            <Card
              style={{ backgroundColor: "#EAF3DF", borderColor: "#D9E7C6" }}
            >
              <T bold size={12} color={C.forest}>
                YOUR PICKUP CODE
              </T>
              <T
                bold
                size={36}
                color={C.forest}
                style={{ letterSpacing: 8, marginTop: 5 }}
              >
                {order.pickupCode}
              </T>
              <T size={12} color={C.forest} style={{ lineHeight: 19 }}>
                Show this at the mart when you collect your items.
              </T>
            </Card>
          )}
          {order.rejectionReason && (
            <Notice text={order.rejectionReason} type="error" />
          )}
          <Card>
            {order.items.map((p, i) => (
              <View
                key={p.productId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 9,
                  borderBottomWidth: i < order.items.length - 1 ? 1 : 0,
                  borderColor: C.line,
                }}
              >
                <ProductArt
                  artwork={p.artwork}
                  imageUrl={p.imageUrl}
                  width={49}
                  height={51}
                />
                <View style={{ flex: 1 }}>
                  <T bold size={12}>
                    {p.name}
                  </T>
                  <T size={11} color={C.muted}>
                    {p.quantity} × {money(p.unitPrice)}
                  </T>
                </View>
                <T bold size={13}>
                  {money(p.lineTotal)}
                </T>
              </View>
            ))}
            <View style={{ height: 15 }} />
            <BillRow
              label="Total after savings"
              value={money(order.total)}
              bold
            />
          </Card>
          <Card>
            <T bold style={{ marginBottom: 15 }}>
              Order journey
            </T>
            {order.events.map((e, i) => (
              <View
                key={e.status + i}
                style={{ flexDirection: "row", gap: 12, paddingBottom: 15 }}
              >
                <View
                  style={{
                    height: 23,
                    width: 23,
                    backgroundColor: C.mint,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={13} color={C.forest} />
                </View>
                <View style={{ flex: 1 }}>
                  <T size={13} bold style={{ textTransform: "capitalize" }}>
                    {e.status === "picked" ? "Picked up" : e.status}
                  </T>
                  <T size={10} color={C.muted} style={{ marginTop: 3 }}>
                    {new Date(e.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </T>
                </View>
              </View>
            ))}
          </Card>
          {order.notes !== "" && (
            <T size={12} color={C.muted}>
              Your note: {order.notes}
            </T>
          )}
          {!admin && order.status === "packed" && (
            <Button
              title="I’ve picked up my order"
              onPress={() => update("picked")}
              loading={busy}
              icon={<Check size={18} color={C.white} />}
            />
          )}{" "}
          {!admin && order.status === "placed" && (
            <Button
              title="Cancel order"
              variant="danger"
              onPress={() => update("cancelled")}
              loading={busy}
            />
          )}{" "}
          {order.status === "picked" && (
            <Notice
              text={`Thanks for shopping locally. You earned ${order.pointsEarned} reward points.`}
              type="success"
            />
          )}
        </View>
      )}
    </Sheet>
  );
}
export function OrdersScreen() {
  const { epoch } = useAuth();
  const [filter, setFilter] = useState("active"),
    [selected, setSelected] = useState<Order | null>(null),
    [offset, setOffset] = useState(0);
  const result = useLoad<{ orders: Order[]; total: number }>(
    () => api.get(`/api/orders?status=${filter}&limit=30&offset=${offset}`),
    [epoch, offset, filter],
  );
  usePoll(result.refresh, 20);
  const list = result.data?.orders || [];
  return (
    <Page refresh={result.refresh} refreshing={result.loading && !!result.data}>
      <SectionTitle
        title="My orders"
        caption="From your basket to your neighbourhood mart."
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          label="Active"
          selected={filter === "active"}
          onPress={() => {
            setOffset(0);
            setFilter("active");
          }}
        />
        <Chip
          label="Past orders"
          selected={filter === "past"}
          onPress={() => {
            setOffset(0);
            setFilter("past");
          }}
        />
        <Chip
          label="All"
          selected={filter === "all"}
          onPress={() => {
            setOffset(0);
            setFilter("all");
          }}
        />
      </View>
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : result.loading && !result.data ? (
        <Loading />
      ) : list.length ? (
        list.map((o) => (
          <Pressable key={o.id} onPress={() => setSelected(o)}>
            <Card style={{ gap: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Status value={o.status} />
                <T size={10} color={C.muted}>
                  {dateLabel(o.createdAt)}
                </T>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <T bold size={15}>
                    {o.number}
                  </T>
                  <T size={11} color={C.muted} style={{ marginTop: 5 }}>
                    {o.items.map((p) => p.name).join(", ")}
                  </T>
                </View>
                <ChevronRight size={18} color={C.muted} />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <T size={12} color={C.muted}>
                  {o.items.reduce((s, p) => s + p.quantity, 0)} items · Pickup
                </T>
                <T bold size={17}>
                  {money(o.total)}
                </T>
              </View>
              {o.status === "packed" && (
                <View
                  style={{
                    backgroundColor: "#EBF3DE",
                    borderRadius: 13,
                    padding: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                  }}
                >
                  <Package size={20} color={C.forest} />
                  <T bold size={12} color={C.forest}>
                    Ready for pickup · Code {o.pickupCode}
                  </T>
                </View>
              )}
            </Card>
          </Pressable>
        ))
      ) : (
        <Empty
          title={
            filter === "active" ? "No active orders" : "No orders here yet"
          }
          detail="Your pickup orders will appear here."
        />
      )}
      {(result.data?.total || 0) > 30 && (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            title="Previous"
            disabled={!offset}
            variant="secondary"
            onPress={() => setOffset((v) => Math.max(0, v - 30))}
          />
          <Button
            title="Next"
            disabled={offset + 30 >= (result.data?.total || 0)}
            variant="secondary"
            onPress={() => setOffset((v) => v + 30)}
          />
        </View>
      )}
      <OrderDetails
        order={
          selected
            ? result.data?.orders.find((o) => o.id === selected.id) || selected
            : null
        }
        onClose={() => setSelected(null)}
        onUpdate={(o) => {
          setSelected(o);
          result.refresh();
        }}
      />
    </Page>
  );
}
export function ProfileScreen() {
  const { user, logout, refreshUser, setSession, epoch } =
    useAuth();
  const [edit, setEdit] = useState<"name" | "password" | null>(null),
    [name, setName] = useState(user?.name || ""),
    [oldPassword, setOldPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const store = useLoad<{ store: Store }>(
    () => api.get("/api/catalog/store"),
    [epoch],
  );
  const rewards = useLoad<{
    points: number;
    coupons: Coupon[];
    ledger: {
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
    }[];
  }>(() => api.get("/api/rewards"), [epoch, user?.points]);
  const save = async () => {
    setBusy(true);
    try {
      if (edit === "name") {
        await api.patch("/api/auth/me", { name });
        await refreshUser();
      } else {
        const s = await api.post<Session>("/api/auth/change-password", {
          currentPassword: oldPassword,
          newPassword,
        });
        await setSession(s);
        setOldPassword("");
        setNewPassword("");
      }
      setEdit(null);
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page>
      <SectionTitle
        title="Your corner"
        caption="Your account, little rewards and local details."
      />
      <Card>
        <View style={{ flexDirection: "row", gap: 15, alignItems: "center" }}>
          <View
            style={{
              height: 64,
              width: 64,
              borderRadius: 22,
              backgroundColor: C.mint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T bold size={26} color={C.forest}>
              {user?.name[0]?.toUpperCase()}
            </T>
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <T bold size={21}>
              {user?.name}
            </T>
            <T color={C.muted} size={13}>
              +91 {user?.phone}
            </T>
            <T size={10} color={C.muted}>
              Aone neighbour since {user ? dateLabel(user.createdAt) : ""}
            </T>
          </View>
        </View>
        <View style={{ height: 20 }} />
        <Button
          title="Edit profile"
          variant="secondary"
          onPress={() => {
            setName(user?.name || "");
            setEdit("name");
          }}
        />
      </Card>
      <LinearGradient
        colors={["#1E5C43", "#386C48"]}
        style={{ borderRadius: 22, padding: 23 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <T size={11} bold color={C.mint} style={{ letterSpacing: 1.3 }}>
              YOUR LOCAL REWARDS
            </T>
            <T bold size={38} color={C.white} style={{ marginTop: 10 }}>
              {rewards.data?.points ?? user?.points ?? 0}
              <T size={14} color="#D3E1D6">
                {" "}
                points
              </T>
            </T>
            <T size={11} color="#D3E1D6" style={{ marginTop: 7 }}>
              1 point = ₹1 off your next order
            </T>
          </View>
          <Gift size={38} color={C.mint} strokeWidth={1.3} />
        </View>
        <T size={11} color="#D3E1D6" style={{ lineHeight: 18, marginTop: 16 }}>
          Earn {store.data?.store.pointsPer100Rupees ?? 1} point(s) for every
          full ₹100 after pickup. Points return if an order is rejected or
          cancelled.
        </T>
      </LinearGradient>
      <View>
        <SectionTitle
          title="A little extra for you"
          caption="Coupons from your neighbourhood mart."
        />
        {rewards.error ? (
          <ErrorView error={rewards.error} retry={rewards.refresh} />
        ) : rewards.data?.coupons.length ? (
          rewards.data.coupons.map((c) => (
            <Card key={c.id} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View
                  style={{
                    backgroundColor: "#F1EFD9",
                    borderRadius: 15,
                    padding: 13,
                    alignSelf: "flex-start",
                  }}
                >
                  <Ticket size={22} color={C.amber} />
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <T bold size={17}>
                    {c.kind === "percent"
                      ? `${c.value}% off`
                      : money(c.value) + " off"}
                  </T>
                  <T size={12} color={C.muted}>
                    {c.title}
                  </T>
                  <T size={11} color={C.muted}>
                    Min. {money(c.minOrder)} · Until {dateLabel(c.expiresAt)}
                  </T>
                  <T
                    bold
                    color={C.forest}
                    style={{ letterSpacing: 1, marginTop: 5 }}
                  >
                    {c.code}
                  </T>
                </View>
              </View>
              <View style={{ height: 13 }} />
              <Button
                title="Use in my basket"
                variant="secondary"
                onPress={() =>
                  router.navigate({
                    pathname: "/(customer)/cart",
                    params: { coupon: c.code },
                  })
                }
              />
            </Card>
          ))
        ) : (
          <Card>
            <T size={12} color={C.muted}>
              Your next little reward is on its way.
            </T>
          </Card>
        )}
      </View>
      {rewards.data?.ledger.length ? (
        <Card>
          <T bold style={{ marginBottom: 14 }}>
            Points activity
          </T>
          {rewards.data.ledger.slice(0, 10).map((l) => (
            <View
              key={l.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 11,
                borderBottomWidth: 1,
                borderColor: C.line,
              }}
            >
              <View>
                <T size={12} style={{ textTransform: "capitalize" }}>
                  {l.reason}
                </T>
                <T size={10} color={C.muted} style={{ marginTop: 4 }}>
                  {dateLabel(l.createdAt)}
                </T>
              </View>
              <T bold color={l.amount > 0 ? C.forest : C.red}>
                {l.amount > 0 ? "+" : ""}
                {l.amount} pts
              </T>
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 15 }}>
          <StoreIcon size={20} color={C.forest} />
          <T bold>{store.data?.store.name || "Aone Mart"}</T>
        </View>
        <T size={12} color={C.muted} style={{ lineHeight: 21 }}>
          {store.data?.store.address ||
            "Ask the mart admin for pickup location details."}
        </T>
        <T size={12} color={C.muted} style={{ lineHeight: 21, marginTop: 8 }}>
          Store hours: {store.data?.store.hours || "Contact the mart"}
        </T>
        <T size={12} color={C.muted} style={{ lineHeight: 21, marginTop: 8 }}>
          {store.data?.store.pickupInstructions}
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
          {store.data?.store.mapsUrl && (
            <Button
              title="View location"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(store.data!.store.mapsUrl).catch(
                  alertError,
                )
              }
            />
          )}
          {store.data?.store.phone && (
            <Button
              title="Call mart"
              variant="ghost"
              onPress={() =>
                void Linking.openURL("tel:" + store.data!.store.phone).catch(
                  alertError,
                )
              }
            />
          )}
        </View>
      </Card>
      <Button
        title="Change password"
        variant="ghost"
        onPress={() => setEdit("password")}
        icon={<LockKeyhole size={17} color={C.forest} />}
      />
      <Button
        title="Log out"
        variant="danger"
        onPress={() => void logout()}
        icon={<LogOut size={17} color={C.red} />}
      />
      <Sheet
        visible={!!edit}
        onClose={() => setEdit(null)}
        title={edit === "name" ? "Edit your name" : "Change password"}
      >
        {edit === "name" ? (
          <Input label="Your name" value={name} onChangeText={setName} />
        ) : (
          <>
            <Input
              label="Current password"
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <Input
              label="New password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
            />
          </>
        )}
        <Button title="Save changes" onPress={save} loading={busy} />
      </Sheet>
    </Page>
  );
}

import React, { useState } from "react";
import {
  Text,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
  RefreshControl,
} from "react-native";
import {
  Search,
  X,
  ChevronDown,
  ShoppingBasket,
  AlertCircle,
  Check,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export const C = {
  ink: "#162B25",
  forest: "#1E5C43",
  mint: "#DDECBC",
  canvas: "#F7F8F2",
  muted: "#7B8980",
  line: "#E5EAE3",
  white: "#FFFFFF",
  amber: "#B77B18",
  red: "#BC4E4E",
  blue: "#487FAD",
};
export const F = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semi: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};
export const money = (n = 0) =>
  "₹" + (n / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
export function T({
  children,
  size = 14,
  bold = false,
  color = C.ink,
  style,
  ...props
}: {
  children: React.ReactNode;
  size?: number;
  bold?: boolean;
  color?: string;
  style?: any;
  numberOfLines?: number;
  testID?: string;
}) {
  return (
    <Text
      {...props}
      className={bold ? "font-bold text-ink" : "font-sans text-ink"}
      style={[
        { fontFamily: bold ? F.bold : F.regular, fontSize: size, color },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Brand({
  small = false,
  inverse = false,
}: {
  small?: boolean;
  inverse?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: small ? 35 : 46,
          height: small ? 35 : 46,
          backgroundColor: inverse ? C.mint : C.forest,
          borderRadius: small ? 12 : 15,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ShoppingBasket
          size={small ? 21 : 27}
          color={inverse ? C.forest : C.mint}
          strokeWidth={1.8}
        />
      </View>
      <View>
        <T size={small ? 19 : 25} bold color={inverse ? C.white : C.ink}>
          aone
          <T size={small ? 19 : 25} color={inverse ? C.mint : C.forest}>
            {" "}
            mart
          </T>
        </T>
        {!small && (
          <T
            size={10}
            color={inverse ? "#C7DDD0" : C.muted}
            style={{ letterSpacing: 2 }}
          >
            LOCAL GOODNESS. EVERY DAY.
          </T>
        )}
      </View>
    </View>
  );
}
export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const bg =
    variant === "primary"
      ? C.forest
      : variant === "secondary"
        ? C.mint
        : variant === "danger"
          ? "#FCF0EC"
          : "transparent";
  const text =
    variant === "primary" ? C.white : variant === "danger" ? C.red : C.forest;
  return (
    <Pressable
      className="flex-row items-center justify-center gap-2 rounded-2xl px-[18px]"
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          backgroundColor: bg,
          minHeight: 48,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={text} />
      ) : (
        <>
          {icon}
          <T bold color={text}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}
export function Input({
  label,
  error,
  right,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="mb-[15px] gap-[7px]">
      {label && (
        <T size={12} bold color={C.muted}>
          {label}
        </T>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: error ? C.red : C.line,
          borderRadius: 15,
          backgroundColor: C.white,
        }}
      >
        <TextInput
          placeholderTextColor="#A2AAA2"
          autoCorrect={false}
          {...props}
          style={[
            {
              flex: 1,
              paddingHorizontal: 15,
              minHeight: 51,
              fontFamily: F.regular,
              fontSize: 15,
              color: C.ink,
            },
            props.style,
          ]}
        />
        {right && <View style={{ paddingRight: 15 }}>{right}</View>}
      </View>
      {error && (
        <T size={11} color={C.red}>
          {error}
        </T>
      )}
    </View>
  );
}
export function SearchInput({
  value,
  onChangeText,
  placeholder = "Search products...",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
        backgroundColor: C.white,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 17,
        minHeight: 52,
        gap: 10,
      }}
    >
      <Search size={19} color={C.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        style={{
          flex: 1,
          fontFamily: F.regular,
          color: C.ink,
          fontSize: 14,
          minHeight: 49,
        }}
      />
      {value !== "" && (
        <Pressable
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={10}
        >
          <X size={16} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? C.forest : C.white,
        borderWidth: 1,
        borderColor: selected ? C.forest : C.line,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 13,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
      }}
    >
      {icon}
      <T size={12} bold color={selected ? C.white : C.muted}>
        {label}
      </T>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: C.white,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 22,
          padding: 19,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function SectionTitle({
  title,
  caption,
  action,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 18,
      }}
    >
      <View style={{ flex: 1 }}>
        <T size={22} bold>
          {title}
        </T>
        {caption && (
          <T size={12} color={C.muted} style={{ marginTop: 5 }}>
            {caption}
          </T>
        )}
      </View>
      {action}
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 38,
        paddingHorizontal: 25,
        gap: 11,
      }}
    >
      <View
        style={{ backgroundColor: "#EAF1E3", padding: 20, borderRadius: 30 }}
      >
        <ShoppingBasket size={32} color={C.forest} strokeWidth={1.5} />
      </View>
      <T size={18} bold style={{ textAlign: "center" }}>
        {title}
      </T>
      {detail && (
        <T
          size={13}
          color={C.muted}
          style={{ textAlign: "center", lineHeight: 21 }}
        >
          {detail}
        </T>
      )}
      {action}
    </View>
  );
}
export function Notice({
  text,
  type = "info",
}: {
  text: string;
  type?: "info" | "error" | "success";
}) {
  const color =
    type === "error" ? C.red : type === "success" ? C.forest : C.amber;
  return (
    <View
      style={{
        backgroundColor:
          type === "error"
            ? "#FDF1EE"
            : type === "success"
              ? "#EDF5E8"
              : "#FBF5E7",
        borderRadius: 14,
        padding: 13,
        flexDirection: "row",
        gap: 9,
        alignItems: "flex-start",
      }}
    >
      <AlertCircle size={17} color={color} />
      <T size={12} color={color} style={{ flex: 1, lineHeight: 19 }}>
        {text}
      </T>
    </View>
  );
}
export function ErrorView({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Notice text={error} type="error" />
      <Button title="Try again" variant="secondary" onPress={retry} />
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={C.forest} />
      <T size={12} color={C.muted}>
        Just a moment...
      </T>
    </View>
  );
}
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(16,36,27,.45)",
        }}
      >
        <Pressable
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close dialog"
        />
        <View
          style={{
            maxHeight: "92%",
            width: "100%",
            maxWidth: 620,
            alignSelf: "center",
            backgroundColor: C.canvas,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: Math.max(insets.bottom, 18),
          }}
        >
          <View
            style={{
              height: 5,
              width: 40,
              borderRadius: 3,
              backgroundColor: C.line,
              alignSelf: "center",
              marginTop: 10,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 22,
            }}
          >
            <T bold size={22}>
              {title}
            </T>
            <Pressable
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={15}
            >
              <X size={22} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 15 }}>
      <T size={12} bold color={C.muted} style={{ marginBottom: 7 }}>
        {label}
      </T>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: C.white,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 15,
          minHeight: 51,
          paddingHorizontal: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <T>{options.find((o) => o.value === value)?.label || "Choose..."}</T>
        <ChevronDown size={18} color={C.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderColor: C.line,
            }}
          >
            <T>{o.label}</T>
            {value === o.value && <Check size={18} color={C.forest} />}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
export function Page({
  children,
  refresh,
  refreshing = false,
}: {
  children: React.ReactNode;
  refresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.canvas }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        refresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={C.forest}
          />
        ) : undefined
      }
      contentContainerStyle={{
        padding: 22,
        paddingBottom: 35,
        width: "100%",
        maxWidth: 1260,
        alignSelf: "center",
        gap: 18,
      }}
    >
      {children}
    </ScrollView>
  );
}
const statusColors: Record<string, [string, string]> = {
  placed: ["#FFF1D8", C.amber],
  accepted: ["#E8F1FA", C.blue],
  packed: ["#E8F3DE", C.forest],
  picked: ["#E7EEE9", C.forest],
  rejected: ["#FCECEA", C.red],
  cancelled: ["#F0F1ED", C.muted],
};
export function Status({ value }: { value: string }) {
  const [bg, color] = statusColors[value] || statusColors.placed;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 9,
        paddingHorizontal: 10,
        paddingVertical: 6,
        alignSelf: "flex-start",
      }}
    >
      <T
        bold
        size={10}
        color={color}
        style={{ textTransform: "uppercase", letterSpacing: 0.6 }}
      >
        {value === "picked" ? "Picked up" : value}
      </T>
    </View>
  );
}

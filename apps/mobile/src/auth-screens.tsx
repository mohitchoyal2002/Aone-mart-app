import React, { useRef, useState } from "react";
import {
  View,
  Keyboard,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormScroll } from "./keyboard-layout";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Wifi,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "./api";
import { useAuth } from "./state";
import { Brand, C, T, Input, Button, Chip, Notice } from "./ui";
import { ProductArt } from "./art";
import type { Role, Session } from "./types";
export function ConnectionScreen() {
  const insets = useSafeAreaInsets();
  const { setConnected } = useAuth();
  const [url, setUrl] = useState(api.baseUrl || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const connect = async () => {
    if (busy || !url.trim()) return;
    Keyboard.dismiss();
    setBusy(true);
    setError("");
    try {
      await api.setUrl(url);
      const health = await api.get<{ ok: boolean; service: string }>("/health");
      if (!health.ok || health.service !== "aone-mart-api")
        throw new Error("This is not an Aone Mart service address.");
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot connect.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: C.canvas }}
      contentContainerStyle={{
        padding: 26,
        paddingBottom: 26 + insets.bottom,
        flexGrow: 1,
        justifyContent: "center",
        width: "100%",
        maxWidth: 520,
        alignSelf: "center",
      }}
    >
      <Brand />
      <View style={{ height: 48 }} />
      <View
        style={{
          width: 66,
          height: 66,
          borderRadius: 22,
          backgroundColor: C.mint,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 22,
        }}
      >
        <Wifi color={C.forest} size={29} />
      </View>
      <T size={30} bold>
        Connect to your mart.
      </T>
      <T
        color={C.muted}
        style={{ lineHeight: 23, marginTop: 12, marginBottom: 28 }}
      >
        Enter the service address provided by your mart admin. Once connected,
        you can create an account and start shopping.
      </T>
      <Input
        label="Mart service address"
        placeholder="https://api.yourmart.com"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => void connect()}
      />
      {error !== "" && (
        <View style={{ marginBottom: 16 }}>
          <Notice text={error} type="error" />
        </View>
      )}
      <Button
        title="Connect & continue"
        onPress={connect}
        loading={busy}
        disabled={!url.trim()}
        icon={<ArrowRight size={17} color={C.white} />}
      />
      <T
        size={11}
        color={C.muted}
        style={{ textAlign: "center", lineHeight: 18, marginTop: 24 }}
      >
        Your cart and orders connect directly to the mart’s own service.
      </T>
    </FormScroll>
  );
}
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    password?: string;
  }>({});
  const { setSession, setConnected } = useAuth();
  const [role, setRole] = useState<Role>("customer"),
    [signup, setSignup] = useState(false),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    setError("");
    setFieldErrors({});
    if (signup && name.trim().length < 2) {
      setFieldErrors({ name: "Enter your name." });
      nameRef.current?.focus();
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone.replaceAll(" ", ""))) {
      setFieldErrors({ phone: "Enter your 10-digit mobile number." });
      phoneRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      setFieldErrors({ password: "Password needs at least 8 characters." });
      passwordRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      const session = await api.post<Session>(
        `/api/auth/${signup ? "signup" : "login"}`,
        signup
          ? { name: name.trim(), phone, password }
          : { phone, password, role },
      );
      await setSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormScroll
      style={{ flex: 1, backgroundColor: C.canvas }}
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 24 + insets.bottom,
          flexGrow: 1,
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
        }}
      >
        <View style={{ marginTop: 12, marginBottom: 24 }}>
          <Brand />
        </View>
        <LinearGradient
          colors={["#E8EEDB", "#DCECBA"]}
          style={{
            height: 165,
            borderRadius: 27,
            overflow: "hidden",
            marginBottom: 29,
            padding: 22,
            justifyContent: "center",
          }}
        >
          <View style={{ width: "62%" }}>
            <T size={24} bold style={{ lineHeight: 29 }}>
              A little local.{String.fromCharCode(10)}A lot of good.
            </T>
            <T
              size={11}
              color={C.forest}
              style={{ marginTop: 10, lineHeight: 17 }}
            >
              Your everyday essentials,{String.fromCharCode(10)}ready when you
              are.
            </T>
          </View>
          <View
            style={{
              position: "absolute",
              right: -18,
              bottom: -2,
              transform: [{ rotate: "-10deg" }],
            }}
          >
            <ProductArt artwork="rice" width={190} height={155} />
          </View>
        </LinearGradient>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 26 }}>
          <Chip
            label="Customer"
            selected={role === "customer"}
            onPress={() => {
              Keyboard.dismiss();
              setRole("customer");
              setSignup(false);
              setError("");
              setFieldErrors({});
            }}
            icon={
              <ShoppingBag
                size={15}
                color={role === "customer" ? C.white : C.muted}
              />
            }
          />
          <Chip
            label="Admin"
            selected={role === "admin"}
            onPress={() => {
              Keyboard.dismiss();
              setRole("admin");
              setSignup(false);
              setError("");
              setFieldErrors({});
            }}
            icon={
              <ShieldCheck
                size={15}
                color={role === "admin" ? C.white : C.muted}
              />
            }
          />
        </View>
        <T size={30} bold>
          {signup
            ? "Hello, neighbour."
            : role === "admin"
              ? "Welcome back, admin."
              : "Welcome back."}
        </T>
        <T size={13} color={C.muted} style={{ marginTop: 8, marginBottom: 26 }}>
          {signup
            ? "Create your Aone Mart account in a moment."
            : role === "admin"
              ? "Your store, orders and insights — in one place."
              : "Fresh picks and everyday favourites are waiting."}
        </T>
        {signup && (
          <Input
            ref={nameRef}
            label="Your name"
            error={fieldErrors.name}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
            placeholder="What should we call you?"
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
        )}
        <Input
          ref={phoneRef}
          label="Mobile number"
          error={fieldErrors.phone}
          value={phone}
          onChangeText={(value) => {
            setPhone(value.replace(/[^0-9]/g, ""));
            setFieldErrors((current) => ({ ...current, phone: undefined }));
          }}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={10}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Input
          ref={passwordRef}
          label="Password"
          error={fieldErrors.password}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          placeholder="At least 8 characters"
          autoCapitalize="none"
          autoComplete={signup ? "new-password" : "current-password"}
          secureTextEntry={!visible}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          right={
            <Pressable
              accessibilityLabel={visible ? "Hide password" : "Show password"}
              onPress={() => setVisible((v) => !v)}
              hitSlop={12}
            >
              {visible ? (
                <EyeOff size={19} color={C.muted} />
              ) : (
                <Eye size={19} color={C.muted} />
              )}
            </Pressable>
          }
        />
        {error !== "" && (
          <View style={{ marginBottom: 17 }}>
            <Notice text={error} type="error" />
          </View>
        )}
        <Button
          title={
            signup
              ? "Create account"
              : role === "admin"
                ? "Open admin workspace"
                : "Let’s shop"
          }
          onPress={submit}
          loading={busy}
          icon={<ArrowRight size={18} color={C.white} />}
        />
        {role === "customer" ? (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setSignup(!signup);
              setError("");
              setFieldErrors({});
            }}
            style={{ paddingVertical: 23, alignItems: "center" }}
          >
            <T size={13} color={C.muted}>
              {signup
                ? "Already have an account? "
                : "New to the neighbourhood? "}
              <T bold color={C.forest}>
                {signup ? "Log in" : "Sign up"}
              </T>
            </T>
          </Pressable>
        ) : (
          <T
            size={12}
            color={C.muted}
            style={{ textAlign: "center", lineHeight: 19, marginTop: 22 }}
          >
            Admin access is created by the mart owner.{String.fromCharCode(10)}
            Contact them if you need a password reset.
          </T>
        )}
        <View style={{ flex: 1, minHeight: 24 }} />
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            setConnected(false);
          }}
          style={{ paddingVertical: 12, alignSelf: "center" }}
        >
          <T size={11} color={C.muted}>
            Change mart connection
          </T>
        </Pressable>
    </FormScroll>
  );
}

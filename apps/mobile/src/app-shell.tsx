import "../global.css";
import React, { useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { KeyboardTools } from "./keyboard-layout";
import { useFonts } from "expo-font";
import { AuthProvider, CartProvider, useAuth } from "./state";
import { C } from "./ui";
import { Startup } from "./brand";
import { DialogHost } from "./dialogs";
import { MotionProvider } from "./motion";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function StartupGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={() => void SplashScreen.hideAsync().catch(() => {})}
    >
      {children}
      {!finished && <Startup ready={!loading} onFinished={finish} />}
    </View>
  );
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Aone Mart render failed", {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.canvas,
          padding: 30,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="dark" />
        <Text style={{ fontSize: 24, fontWeight: "700", color: C.ink }}>
          Let’s open Aone Mart again.
        </Text>
        <Text
          style={{
            color: C.muted,
            fontSize: 14,
            lineHeight: 23,
            textAlign: "center",
            marginTop: 16,
          }}
        >
          Something interrupted the app. Try reopening your mart workspace.
        </Text>
        <Pressable
          onPress={() => this.setState({ failed: false })}
          style={{
            backgroundColor: C.forest,
            padding: 18,
            borderRadius: 16,
            marginTop: 25,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [loaded, error] = useFonts({
    DMSans_400Regular: require("@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf"),
    DMSans_500Medium: require("@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf"),
    DMSans_600SemiBold: require("@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf"),
    DMSans_700Bold: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
  });
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <MotionProvider>
          <KeyboardProvider
            statusBarTranslucent
            navigationBarTranslucent
            preserveEdgeToEdge
          >
            <StatusBar style="dark" />
            <NavigationBar style="dark" />
            {!loaded && !error ? (
              <View style={{ flex: 1 }}>
                <Startup ready={false} />
              </View>
            ) : (
              <AuthProvider>
                <CartProvider>
                  <StartupGate>
                    <SafeAreaView
                      edges={["top", "left", "right"]}
                      style={{ flex: 1, backgroundColor: C.canvas }}
                    >
                      {children}
                    </SafeAreaView>
                  </StartupGate>
                </CartProvider>
              </AuthProvider>
            )}
            <DialogHost />
            <KeyboardTools />
          </KeyboardProvider>
        </MotionProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

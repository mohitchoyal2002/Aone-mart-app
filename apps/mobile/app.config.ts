import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "node:fs";
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Aone Mart",
  slug: "aone-mart",
  version: "1.0.1",
  scheme: "aonemart",
  platforms: ["android"],
  orientation: "default",
  userInterfaceStyle: "light",
  icon: "./assets/aone-icon.png",
  android: {
    package: "com.aonemart.app",
    versionCode: 2,
    softwareKeyboardLayoutMode: "resize",
    permissions: ["POST_NOTIFICATIONS", "VIBRATE"],
    ...(existsSync("./google-services.json")
      ? { googleServicesFile: "./google-services.json" }
      : {}),
    adaptiveIcon: {
      foregroundImage: "./assets/aone-adaptive.png",
      backgroundColor: "#1E5C43",
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-system-ui",
    ["expo-navigation-bar", { enforceContrast: false, style: "dark" }],
    [
      "expo-splash-screen",
      {
        image: "./assets/aone-splash.png",
        imageWidth: 200,
        backgroundColor: "#F7F8F2",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#1E5C43",
        sounds: ["./assets/aone_order.wav"],
        defaultChannel: "aone-updates",
      },
    ],
    "expo-secure-store",
    "expo-sharing",
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: process.env.APP_VARIANT !== "production",
        },
      },
    ],
  ],
  extra: {
    ...(config.extra || {}),
    allowHttp: process.env.APP_VARIANT !== "production",
    notificationsEnabled: process.env.ENABLE_NOTIFICATIONS === "true",
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
});

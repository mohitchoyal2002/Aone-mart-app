module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#162B25",
        forest: "#1E5C43",
        mint: "#DDECBC",
        canvas: "#F7F8F2",
        muted: "#7B8980",
        line: "#E5EAE3",
      },
      fontFamily: {
        sans: ["DMSans_400Regular"],
        medium: ["DMSans_500Medium"],
        semibold: ["DMSans_600SemiBold"],
        bold: ["DMSans_700Bold"],
      },
    },
  },
  plugins: [],
};

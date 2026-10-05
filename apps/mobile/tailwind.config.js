module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#14243D",
        forest: "#08786B",
        mint: "#E0F5ED",
        canvas: "#F5F7FB",
        muted: "#617087",
        line: "#E5EAF2",
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

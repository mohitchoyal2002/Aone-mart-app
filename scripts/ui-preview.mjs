// Local, preview-only harness. These entry points and fixtures are never in the APK.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(path.join(root, "apps/mobile/package.json"));
const packageDirectory = (name) =>
  path.dirname(appRequire.resolve(`${name}/package.json`));
const { build } = await import(appRequire.resolve("esbuild"));
const output = path.join(os.tmpdir(), "aone-ui-preview");
await fs.mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/ui-preview/render.ts"],
  outfile: `${output}/render.js`,
  bundle: true,
  format: "esm",
});
const compilePreview = () =>
  build({
    absWorkingDir: root,
    entryPoints: ["scripts/ui-preview/client.tsx"],
    outfile: `${output}/client.js`,
    bundle: true,
    format: "esm",
    jsx: "automatic",
    resolveExtensions: [
      ".web.tsx",
      ".web.ts",
      ".web.jsx",
      ".web.js",
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".json",
    ],
    mainFields: ["browser", "module", "main"],
    alias: {
      "react-native": "react-native-web",
      react: packageDirectory("react"),
      "react-dom": packageDirectory("react-dom"),
      "react-native-safe-area-context": packageDirectory(
        "react-native-safe-area-context",
      ),
    },
    define: {
      __DEV__: "false",
      global: "globalThis",
      "process.env.NODE_ENV": '"development"',
      "process.env.EXPO_OS": '"web"',
    },
    loader: {
      ".png": "file",
      ".jpg": "file",
      ".gif": "file",
      ".mp4": "file",
      ".ttf": "file",
    },
    assetNames: "assets/[name]-[hash]",
    publicPath: "/",
    plugins: [
      {
        name: "preview-only-native-adapters",
        setup(build) {
          const adapters = {
            "expo-router": "router.ts",
            "@react-navigation/native": "router.ts",
            "react-native-keyboard-controller": "keyboard.tsx",
            "expo-secure-store": "secure-store.ts",
          };
          build.onResolve(
            {
              filter:
                /^(expo-router|@react-navigation\/native|react-native-keyboard-controller|expo-secure-store)$/,
            },
            (args) => ({
              path: path.join(root, "scripts/ui-preview", adapters[args.path]),
            }),
          );
          build.onResolve(
            { filter: /^\.\/(api|realtime|basket-scene)$/ },
            (args) => ({
              path: path.join(
                root,
                "scripts/ui-preview",
                args.path === "./api"
                  ? "fixtures.ts"
                  : args.path === "./realtime"
                    ? "realtime.ts"
                    : "basket.tsx",
              ),
            }),
          );
        },
      },
    ],
  });
await compilePreview();
const fonts = ["400Regular", "500Medium", "600SemiBold", "700Bold"];
for (const font of fonts)
  await fs.copyFile(
    `${packageDirectory("@expo-google-fonts/dm-sans")}/${font}/DMSans_${font}.ttf`,
    `${output}/${font}.ttf`,
  );
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts.map((f) => `@font-face{font-family:DMSans_${f};src:url(/${f}.ttf)}`).join("")}html,body,#root{margin:0;width:100%;height:100%;display:flex;flex-direction:column;background:#F5F7FB}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>
// Expo Video's web adapter does not catch autoplay promises cancelled by unmount.
// Handle only cancelled plays; codec, network and other errors still surface.
const originalPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function() {
  return originalPlay.call(this).catch(error => {
    if (error.name === 'AbortError' && (!this.isConnected || this.paused)) {
      window.__previewCancelledPlays = (window.__previewCancelledPlays || 0) + 1;
      return;
    }
    throw error;
  });
};
window.addEventListener('error',e=>{window.__previewError={message:e.message,stack:e.error?.stack};});window.addEventListener('unhandledrejection',e=>{window.__previewError={message:String(e.reason),stack:e.reason?.stack};});</script><script type="module">import('/client.js').catch(e=>{window.__previewError={message:String(e),stack:e.stack};});</script></body></html>`;
const types = {
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".ttf": "font/ttf",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        req.method === "POST" &&
        /^\/capture\/(bag|carton|apple|banana|broccoli|loaf|bottle-oil|cookie|cup-tea|carrot|grocery-poster)$/.test(
          url.pathname,
        )
      ) {
        if (
          req.headers.origin &&
          req.headers.origin !== "http://127.0.0.1:4173"
        ) {
          res.writeHead(403).end();
          return;
        }
        let data = "";
        for await (const chunk of req) {
          data += chunk;
          if (data.length > 8 * 1024 * 1024) {
            res.writeHead(413).end();
            return;
          }
        }
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) {
          res.writeHead(400).end();
          return;
        }
        await fs.writeFile(
          `${root}/apps/mobile/assets/models/${url.pathname.split("/").pop()}.png`,
          Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64"),
        );
        res.end("saved");
        return;
      }
      if (url.pathname === "/rebuild") {
        await compilePreview();
        res.end("rebuilt");
        return;
      }
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(html);
        return;
      }
      if (url.pathname === "/render") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<html><body style="margin:0;background:#eaf1f8"><script type="module" src="/render.js"></script></body></html>',
        );
        return;
      }
      const file = path.resolve(output, "." + url.pathname);
      if (!file.startsWith(output + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const content = await fs.readFile(file);
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.end(content);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log(
      "UI preview: http://127.0.0.1:4173/ (sample data); asset renderer: /render",
    ),
  );

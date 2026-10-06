const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WebGLRenderer, Euler, Vector3 } = require("three");

test("Three rejects a WebGL 1 context", () => {
  global.WebGLRenderingContext = class {};
  global.WebGL2RenderingContext = class extends global.WebGLRenderingContext {};
  assert.throws(
    () => new WebGLRenderer({ canvas: {}, context: new global.WebGLRenderingContext() }),
    /WebGL 1 is not supported/,
  );
});

test("Three accepts the Expo SDK 57 WebGL 2 subclass", () => {
  global.WebGLRenderingContext = class {};
  global.WebGL2RenderingContext = class extends global.WebGLRenderingContext {
    getContextAttributes() { throw new Error("Accepted WebGL 2 context"); }
  };
  // Stop before accessing a GPU: reaching this method proves the renderer
  // accepts the native context type rather than taking the WebGL 1 branch.
  assert.throws(
    () => new WebGLRenderer({ canvas: {}, context: new global.WebGL2RenderingContext() }),
    /Accepted WebGL 2 context/,
  );
});

test("Three still accepts a browser-style WebGL 2 context", () => {
  global.WebGLRenderingContext = class {};
  global.WebGL2RenderingContext = class {
    getContextAttributes() { throw new Error("Accepted browser context"); }
  };
  assert.throws(
    () => new WebGLRenderer({ canvas: {}, context: new global.WebGL2RenderingContext() }),
    /Accepted browser context/,
  );
});

test("Anime animates Three objects when window exists without a DOM", () => {
  global.window = global;
  const { animate, engine } = require("animejs");
  engine.useDefaultMainLoop = false;
  const rotation = new Euler(), position = new Vector3();
  const turn = animate(rotation, { y: [0, 1], duration: 1000, autoplay: false, ease: "linear" });
  const float = animate(position, { y: [0, 0.2], duration: 1000, autoplay: false, ease: "linear" });
  turn.seek(500);
  float.seek(500);
  assert.equal(rotation.y, 0.5);
  assert.equal(position.y, 0.1);
  turn.cancel();
  float.cancel();
});

test("MarketStory renders in SDK 57 Router context and stops video when unfocused", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { readFileSync } = require("node:fs");
  const { join, dirname } = require("node:path");
  const { runInNewContext } = require("node:vm");
  const ts = require("typescript");
  const routerRoot = dirname(require.resolve("expo-router/package.json"));
  const core = join(routerRoot, "build/react-navigation/core");
  const { NavigationContext } = require(join(core, "NavigationContext.js"));
  const { IsFocusedContext, useIsFocused } = require(join(core, "useIsFocused.js"));
  const legacyRoot = dirname(require.resolve("@react-navigation/core/package.json"));
  const legacyHook = require(join(legacyRoot, "lib/module/useIsFocused.js")).useIsFocused;
  const navigation = { isFocused: () => true, addListener: () => () => {} };
  let players = 0;
  const primitive = ({ children }) => React.createElement("div", null, children);
  const dependencies = {
    react: React,
    "react-native": { View: primitive, StyleSheet: { absoluteFill: {} } },
    "expo-image": { Image: () => React.createElement("img", { alt: "poster" }) },
    "expo-video": {
      useVideoPlayer: (_source, setup) => { players++; const player = {}; setup(player); return player; },
      VideoView: () => React.createElement("video"),
    },
    "expo-linear-gradient": { LinearGradient: primitive },
    "expo-router": { useIsFocused },
    "@react-navigation/native": { useIsFocused: legacyHook },
    "lucide-react-native": { Pause: primitive, Play: primitive, ArrowUpRight: primitive },
    "./motion": { ActionPressable: primitive, useMotion: () => ({ enabled: true, reduced: false }) },
    "./ui": { C: {}, T: primitive },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(join(__dirname, "../apps/mobile/src/market-story.tsx"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React, esModuleInterop: true } },
  );
  const exports = {};
  runInNewContext(outputText, { exports, require(name) {
    if (name.startsWith("../assets/")) return name;
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  const render = (focused, active = true, initiallyPaused = false) => renderToStaticMarkup(
    React.createElement(NavigationContext.Provider, { value: navigation },
      React.createElement(IsFocusedContext.Provider, { value: focused },
        React.createElement(exports.MarketStory, { active, initiallyPaused }))),
  );
  assert.match(render(false), /poster/);
  assert.equal(players, 0, "An unfocused screen must not create a video player");
  assert.match(render(true), /<video/);
  assert.equal(players, 1);
  assert.doesNotMatch(render(true, false), /<video/);
  assert.equal(players, 1, "Offscreen video must stay unmounted");
  assert.doesNotMatch(render(true, true, true), /<video/);
  assert.equal(players, 1, "The default paused state must not create a player");
});

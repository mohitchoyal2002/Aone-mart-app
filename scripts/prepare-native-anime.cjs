// Anime.js 4 supports plain objects, but its browser detection assumes that a
// window always has a DOM. React Native provides window without document.
// Patch only this environment check, in both package entry-point variants.
const fs = require("node:fs");
const path = require("node:path");
let root;
try {
  root = path.dirname(require.resolve("animejs/package.json"));
} catch {
  process.exit(0);
} // Backend-only workspace installs do not need Anime.
for (const ext of ["js", "cjs"]) {
  const file = path.join(root, `dist/modules/core/consts.${ext}`);
  const source = fs.readFileSync(file, "utf8");
  const old = "const isBrowser = typeof window !== 'undefined';";
  const fixed =
    "const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';";
  if (source.includes(fixed)) continue;
  if (!source.includes(old))
    throw new Error(
      "Review Anime.js native environment compatibility before updating it.",
    );
  fs.writeFileSync(file, source.replace(old, fixed));
}

// Expo SDK 57 makes WebGL2RenderingContext inherit from WebGLRenderingContext.
// Three r166's WebGL 1 guard also rejects that valid WebGL 2 context. Preserve
// its WebGL 1 rejection, while accepting the native WebGL 2 subclass. Patch
// both package entry points and source; do not change runtime globals.
let threeRoot;
try {
  threeRoot = path.resolve(path.dirname(require.resolve("three")), "..");
} catch {
  process.exit(0);
}
const oldGuard =
  "typeof WebGLRenderingContext !== 'undefined' && context instanceof WebGLRenderingContext";
const fixedGuard =
  oldGuard +
  " && !( typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext )";
for (const relative of [
  "build/three.cjs",
  "build/three.module.js",
  "src/renderers/WebGLRenderer.js",
]) {
  const file = path.join(threeRoot, relative);
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(fixedGuard)) continue;
  if (!source.includes(oldGuard))
    throw new Error("Review Three.js native WebGL compatibility before updating it.");
  fs.writeFileSync(file, source.replace(oldGuard, fixedGuard));
}

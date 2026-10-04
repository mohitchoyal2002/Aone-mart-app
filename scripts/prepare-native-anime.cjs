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

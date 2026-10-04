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

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("manifest, icônes et service worker limités aux ressources statiques", () => {
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.lang, "fr");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}`);
    const data = readFileSync("public" + icon.src);
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
  const worker = readFileSync("public/sw.js", "utf8");
  assert.ok(worker.includes("url.origin !== self.location.origin"));
  assert.ok(worker.includes('event.request.method !== "GET"'));
  assert.ok(worker.includes("cache.addAll(SHELL)"));
  assert.ok(worker.includes("const BUILD_ASSETS = []"));
  assert.ok(!worker.includes("skipWaiting"));
});
test("le frontend ne dépend plus du SDK ou du parcours authentifié", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(!pkg.dependencies["@supabase/supabase-js"]);
  const app = readFileSync("src/App.tsx", "utf8");
  assert.ok(!app.includes("AuthProvider"));
  assert.ok(!app.includes("AuthPage"));
});

test("ressources précachées lisibles hors ligne malgré Vary: Origin", async () => {
  const { runInNewContext } = await import("node:vm");
  const handlers = new Map();
  let response;
  const source = readFileSync("public/sw.js", "utf8").replace(
    /const BUILD_ASSETS\s*=\s*\[\];/,
    'const BUILD_ASSETS = ["/assets/test.js"];',
  );
  runInNewContext(source, {
    self: {
      location: { origin: "https://local.test" },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
    caches: {
      open: async () => ({
        match: async (request, options) =>
          options?.ignoreVary ? new Response("cached-static") : undefined,
      }),
    },
    fetch: async () => {
      throw new Error("Réseau indisponible");
    },
    Response,
    URL,
  });
  handlers.get("fetch")({
    request: {
      method: "GET",
      url: "https://local.test/assets/test.js",
      mode: "cors",
      headers: { Origin: "https://local.test" },
    },
    respondWith: (p) => (response = p),
  });
  assert.equal(await (await response).text(), "cached-static");
});

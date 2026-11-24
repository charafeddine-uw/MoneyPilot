import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
const assets = (await readdir("dist/assets"))
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => "/assets/" + name);
const template = await readFile("public/sw.js", "utf8");
const revision = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .update(template)
  .digest("hex")
  .slice(0, 12);
if (!/const BUILD_ASSETS\s*=\s*\[\];/.test(template))
  throw new Error("Marqueur de précache absent.");
const worker = template
  .replace(
    /const BUILD_ASSETS\s*=\s*\[\];/,
    `const BUILD_ASSETS = ${JSON.stringify(assets)};`,
  )
  .replace("LOCAL_BUILD", revision);
new Script(worker); // Refuser un build dont le service worker ne peut pas être interprété.
await writeFile("dist/sw.js", worker);
console.log(
  `Service worker : ${assets.length} ressources JS/CSS précachées, syntaxe vérifiée.`,
);

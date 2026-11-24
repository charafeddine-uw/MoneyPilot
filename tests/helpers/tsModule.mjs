import { readFileSync } from "node:fs";
import ts from "typescript";
const cache = new Map();
export function moduleURL(path) {
  const key = String(path);
  if (cache.has(key)) return cache.get(key);
  let code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  code = code.replace(
    /from\s+["'](\.[^"']+)["']/g,
    (_, relative) =>
      `from ${JSON.stringify(moduleURL(new URL(relative + ".ts", path)))}`,
  );
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  cache.set(key, url);
  return url;
}
export const importTS = (path) => import(moduleURL(path));

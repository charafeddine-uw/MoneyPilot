import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  inspectPath,
  inspectContent,
  checkPublication,
} from "../scripts/check-publication.mjs";
const temporaryDirectories = [];
after(() => {
  for (const dir of temporaryDirectories)
    rmSync(dir, { recursive: true, force: true });
});
const git = (dir, args, input) =>
  spawnSync("git", args, { cwd: dir, input, encoding: "utf8" });
function repository() {
  const dir = mkdtempSync(join(tmpdir(), "moneypilot-publication-"));
  temporaryDirectories.push(dir);
  assert.equal(git(dir, ["init", "--quiet"]).status, 0);
  cpSync(".gitignore", join(dir, ".gitignore"));
  mkdirSync(join(dir, "src"));
  return dir;
}
test("les exports, configurations et archives sont refusés quel que soit leur nom", () => {
  for (const file of [
    "export.json",
    "notes.json",
    "transactions.csv",
    "bank.ofx",
    "secret.key",
    ".env.local",
    "archive/cloud-v1/source.ts",
    "outputs/capture.jpg",
    "docs/SUPABASE_SETUP.md",
    "PROJECT_CONTEXT.md",
    "photo.png",
  ])
    assert.ok(inspectPath(file), file);
  for (const file of [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".env.example",
    "src/App.tsx",
    "docs/screenshots/parametres-mobile.jpg",
  ])
    assert.equal(inspectPath(file), null, file);
});
test("gitignore protège aussi des sauvegardes sans préfixe MoneyPilot", () => {
  const dir = repository();
  const denied = [
    "vacances.json",
    "budget.csv",
    "data/copie.md",
    "archive/cloud-v1/.env.local",
    "outputs/image.jpg",
    "notes.pdf",
    ".npmrc",
    "work/test.ts",
  ];
  const allowed = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src/App.tsx",
    ".env.example",
    "docs/screenshots/parametres-mobile.jpg",
  ];
  for (const file of denied)
    assert.equal(
      git(dir, ["check-ignore", "--no-index", file]).status,
      0,
      file,
    );
  for (const file of allowed)
    assert.equal(
      git(dir, ["check-ignore", "--no-index", file]).status,
      1,
      file,
    );
});
test("le contrôle examine les blobs de l’index et refuse un ajout forcé", () => {
  const dir = repository();
  writeFileSync(join(dir, "cache.json"), "{}");
  assert.equal(git(dir, ["add", "-f", "cache.json"]).status, 0);
  assert.ok(
    checkPublication(dir, true).issues.some(
      (issue) => issue.file === "cache.json",
    ),
  );
  const token = ["gh", "p_", "A".repeat(32)].join("");
  writeFileSync(
    join(dir, "src", "fixture.ts"),
    `const credential = '${token}';`,
  );
  git(dir, ["add", "src/fixture.ts"]);
  // Modifier la copie de travail ne doit pas masquer un secret déjà dans l’index.
  writeFileSync(
    join(dir, "src", "fixture.ts"),
    "export const harmless = true;",
  );
  assert.ok(
    checkPublication(dir, true).issues.some(
      (issue) => issue.file === "src/fixture.ts",
    ),
  );
});
test("les secrets et sauvegardes renommées sont détectés sans afficher leur valeur", () => {
  const token = ["gh", "p_", "B".repeat(32)].join("");
  assert.ok(inspectContent(token));
  assert.ok(inspectContent(["-----BEGIN ", "PRIVATE KEY-----"].join("")));
  assert.ok(inspectContent("TEST_A_" + "PASSWORD=valeur_fictive_unique"));
  assert.ok(
    inspectContent(
      JSON.stringify({ format: "Money" + "Pilot", version: 1, data: {} }),
    ),
  );
  assert.equal(inspectContent("Données fictives. Aucun secret."), null);
});
test("le hook avant commit bloque effectivement une sauvegarde ajoutée de force", () => {
  const dir = repository();
  mkdirSync(join(dir, "scripts"));
  cpSync(
    "scripts/check-publication.mjs",
    join(dir, "scripts/check-publication.mjs"),
  );
  git(dir, ["config", "core.hooksPath", resolve(".githooks")]);
  git(dir, ["config", "user.name", "MoneyPilot Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(dir, "budget.json"), "{}");
  git(dir, ["add", "-f", "budget.json"]);
  const result = git(dir, ["commit", "-m", "test fictif bloqué"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Publication bloquée/);
  assert.notEqual(git(dir, ["rev-parse", "HEAD"]).status, 0);
});

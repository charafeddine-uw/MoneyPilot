import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { IDBFactory } from "fake-indexeddb";
import { randomUUID } from "node:crypto";
const cache = new Map();
function moduleURL(path) {
  if (cache.has(path)) return cache.get(path);
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
  cache.set(path, url);
  return url;
}
const model = await import(
  moduleURL(new URL("../src/services/localModel.ts", import.meta.url))
);
const db = await import(
  moduleURL(new URL("../src/services/localDatabase.ts", import.meta.url))
);
const repo = await import(
  moduleURL(new URL("../src/services/repository.ts", import.meta.url))
);
const finance = await import(
  moduleURL(new URL("../src/lib/finance.ts", import.meta.url))
);
const { LOCAL_USER, parseBackup } = model;
const now = () => new Date().toISOString();
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
async function fixture() {
  const account = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    name: "Test fictif",
    currency: "EUR",
    initial_balance_cents: 100000,
    reference_date: "2026-01-01",
    updated_at: now(),
  };
  await repo.insertRow("accounts", account);
  const s = await repo.loadSnapshot();
  const entry = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    account_id: account.id,
    type: "expense",
    amount_cents: 1234,
    category_id: s.categories[0].id,
    date: "2026-02-01",
    description: "Fictif",
    expense_kind: "variable",
    recurring_id: null,
    occurrence_date: null,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
  };
  await repo.insertRow("transactions", entry);
  return { account, entry, category: s.categories[0] };
}
test("premier lancement vide, catégories standard sans transaction de démonstration", async () => {
  const s = await repo.loadSnapshot();
  assert.equal(s.account, null);
  assert.equal(s.entries.length, 0);
  assert.equal(s.categories.length, 7);
});
test("persistance après fermeture et réouverture de la connexion IndexedDB", async () => {
  const { account, entry } = await fixture();
  const s = await repo.loadSnapshot();
  assert.equal(s.account.id, account.id);
  assert.equal(s.entries[0].amount_cents, entry.amount_cents);
  assert.equal(finance.totals(s.account, s.entries, "2026-02").balance, 98766);
});
test("modification, suppression persistante, et protection contre une édition obsolète", async () => {
  const { entry } = await fixture();
  const edited = await repo.updateRow("transactions", entry, {
    amount_cents: 1555,
  });
  await assert.rejects(
    repo.updateRow("transactions", entry, { amount_cents: 2000 }),
    /changé/,
  );
  assert.equal((await repo.loadSnapshot()).entries[0].amount_cents, 1555);
  await repo.updateRow("transactions", edited, { deleted_at: now() });
  assert.equal((await repo.loadSnapshot()).entries.length, 0);
  assert.equal((await repo.createBackup()).data.entries.length, 1);
});
test("répétition du même UUID sans doublon et refus des données modifiées", async () => {
  const { entry } = await fixture();
  await repo.insertRow("transactions", entry);
  assert.equal((await repo.loadSnapshot()).entries.length, 1);
  await assert.rejects(
    repo.insertRow("transactions", { ...entry, amount_cents: 12 }),
    /RETRY_CHANGED/,
  );
});
test("récurrence atomique et idempotente, y compris après suppression de l’opération", async () => {
  const { account, category } = await fixture();
  const r = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    account_id: account.id,
    description: "Loyer fictif",
    amount_cents: 50000,
    category_id: category.id,
    next_date: "2026-01-31",
    anchor_day: 31,
    active: true,
    updated_at: now(),
  };
  await repo.insertRow("recurring_expenses", r);
  await Promise.all([
    repo.confirmRecurringLocal(r, randomUUID()),
    repo.confirmRecurringLocal(r, randomUUID()),
  ]);
  let s = await repo.loadSnapshot();
  assert.equal(s.entries.filter((e) => e.recurring_id === r.id).length, 1);
  assert.equal(s.recurring[0].next_date, "2026-02-28");
  const e = s.entries.find((e) => e.recurring_id);
  await repo.updateRow("transactions", e, { deleted_at: now() });
  await repo.confirmRecurringLocal(r, randomUUID());
  s = await repo.loadSnapshot();
  assert.equal(s.entries.filter((e) => e.recurring_id).length, 0);
});
test("JSON complet : catégories, budgets, récurrences, préférences et montants restaurés", async () => {
  const { account, category } = await fixture();
  await repo.insertRow("budgets", {
    id: randomUUID(),
    user_id: LOCAL_USER,
    month: "2026-02-01",
    amount_cents: 15000,
    category_id: null,
    updated_at: now(),
  });
  await repo.insertRow("recurring_expenses", {
    id: randomUUID(),
    user_id: LOCAL_USER,
    account_id: account.id,
    description: "Test",
    amount_cents: 1999,
    category_id: category.id,
    next_date: "2026-03-01",
    anchor_day: 1,
    active: true,
    updated_at: now(),
  });
  await repo.markBackup(now());
  const backup = await repo.createBackup();
  const parsed = parseBackup(JSON.stringify(backup));
  await repo.resetLocal((await db.transactDocument()).revision);
  await repo.restoreBackup(parsed, (await db.transactDocument()).revision);
  assert.deepEqual((await repo.createBackup()).data, backup.data);
  assert.deepEqual((await db.transactDocument()).preferences, {
    ...backup.preferences,
    lastBackupAt: backup.createdAt,
  });
  const s = await repo.loadSnapshot();
  assert.equal(finance.totals(s.account, s.entries, "2026-02").balance, 98766);
});
test("fichiers invalides ou incompatibles refusés sans aucune perte", async () => {
  await fixture();
  const before = await db.transactDocument();
  const good = await repo.createBackup();
  for (const json of [
    "{",
    JSON.stringify({ ...good, version: 99 }),
    JSON.stringify({ ...good, format: "Autre" }),
    JSON.stringify({
      ...good,
      data: {
        ...good.data,
        entries: [{ ...good.data.entries[0], amount_cents: 1.5 }],
      },
    }),
  ]) {
    assert.throws(() => parseBackup(json));
    assert.deepEqual(await db.transactDocument(), before);
  }
});
test("relations, doublons, dates et secrets inattendus refusés", async () => {
  await fixture();
  const good = await repo.createBackup();
  const mutations = [
    (b) => b.data.entries.push({ ...b.data.entries[0] }),
    (b) => (b.data.entries[0].category_id = randomUUID()),
    (b) => (b.data.entries[0].account_id = randomUUID()),
    (b) => (b.data.entries[0].amount_cents = 0),
    (b) => (b.data.entries[0].date = "2026-02-30"),
    (b) => (b.preferences.password = "secret"),
    (b) => (b.data.account.currency = "USD"),
    (b) => (b.data.categories[0].color = "javascript:alert(1)"),
    (b) => (b.data.entries[0].recurring_id = randomUUID()),
    (b) => (b.data.entries[0].user_id = randomUUID()),
  ];
  for (const change of mutations) {
    const invalid = structuredClone(good);
    change(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid)));
  }
});
test("restauration obsolète refusée, toutes les modifications conservées", async () => {
  const { entry } = await fixture();
  const backup = await repo.createBackup();
  const revision = (await db.transactDocument()).revision;
  await repo.updateRow("transactions", entry, { amount_cents: 999 });
  await assert.rejects(repo.restoreBackup(backup, revision), /changé/);
  assert.equal((await repo.loadSnapshot()).entries[0].amount_cents, 999);
});
test("transaction annulée intégralement si une validation échoue", async () => {
  await fixture();
  const before = await db.transactDocument();
  await assert.rejects(
    db.transactDocument((d) => {
      d.snapshot.entries[0].amount_cents = 0;
      d.snapshot.account.name = "NE PAS ENREGISTRER";
      return d;
    }),
  );
  assert.deepEqual(await db.transactDocument(), before);
});
test("erreurs de lecture et écriture exposées sans remplacement silencieux", async () => {
  await fixture();
  const before = await db.transactDocument();
  const original = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  await assert.rejects(repo.loadSnapshot(), /indisponible/);
  await assert.rejects(repo.resetLocal(before.revision), /indisponible/);
  globalThis.indexedDB = original;
  assert.deepEqual(await db.transactDocument(), before);
  await assert.rejects(
    db.transactDocument(() => {
      throw new DOMException("Quota dépassé", "QuotaExceededError");
    }),
    /Quota/,
  );
  assert.deepEqual(await db.transactDocument(), before);
});
test("catégories : renommage, ajout, suppression inutilisée et refus des catégories utilisées", async () => {
  const { category } = await fixture();
  await repo.renameCategory(category.id, "Maison");
  assert.equal((await repo.loadSnapshot()).categories[0].name, "Maison");
  await assert.rejects(repo.removeCategory(category.id), /utilisée/);
  const extra = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    name: "Santé",
    color: "#123456",
  };
  await repo.insertCategory(extra);
  await repo.removeCategory(extra.id);
  assert.ok(
    !(await repo.loadSnapshot()).categories.some((c) => c.id === extra.id),
  );
});
test("réinitialisation soumise à la révision, ne laisse aucune donnée financière", async () => {
  await fixture();
  let rev = (await db.transactDocument()).revision;
  await assert.rejects(repo.resetLocal(rev - 1), /changé/);
  await repo.resetLocal(rev);
  assert.equal((await repo.loadSnapshot()).account, null);
  assert.equal((await repo.loadSnapshot()).entries.length, 0);
});
test("sauvegarde préalable concurrente refusée sans valider le remplacement", async () => {
  const { entry } = await fixture();
  const prepared = await repo.prepareBackup();
  await repo.updateRow("transactions", entry, { amount_cents: 2222 });
  await assert.rejects(
    repo.markBackup(prepared.backup.createdAt, prepared.revision),
    /changé/,
  );
  assert.equal((await repo.loadSnapshot()).entries[0].amount_cents, 2222);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// Charge le module pur TypeScript avec le compilateur déjà installé, sans outil de test supplémentaire.
const source = readFileSync(
  new URL("../src/legacy/lib/budget.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { summarize, parseBudget, validDate, validAmount } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
const transaction = (id, type, amount, date) => ({
  id,
  type,
  amount,
  date,
  description: "Exemple fictif",
  category: "Autre",
});
const base = {
  version: 1,
  initialBalance: 100,
  initialDate: "2026-11-01",
  transactions: [],
};
test("solde, revenus et dépenses du mois calculés en centimes", () => {
  const budget = {
    ...base,
    initialBalance: 0.1,
    transactions: [
      transaction("1", "income", 0.2, "2026-11-01"),
      transaction("2", "expense", 0.1, "2026-11-15"),
    ],
  };
  assert.deepEqual(summarize(budget, "2026-11-15"), {
    balance: 0.2,
    income: 0.2,
    expenses: 0.1,
  });
});
test("solde cumulé depuis le départ, totaux limités au mois courant et jour inclus", () => {
  const budget = {
    ...base,
    initialDate: "2026-10-01",
    transactions: [
      transaction("1", "income", 50, "2026-10-10"),
      transaction("2", "expense", 30, "2026-11-15"),
      transaction("3", "expense", 20, "2026-11-16"),
    ],
  };
  assert.deepEqual(summarize(budget, "2026-11-15"), {
    balance: 120,
    income: 0,
    expenses: 30,
  });
});
test("budget vide et solde négatif", () =>
  assert.deepEqual(summarize({ ...base, initialBalance: -50 }, "2026-11-15"), {
    balance: -50,
    income: 0,
    expenses: 0,
  }));
test("validation des dates et des montants", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  for (const value of [NaN, Infinity, 0.001, 1000000001])
    assert.equal(validAmount(value), false);
  assert.equal(validAmount(-12.34), true);
});
test("stockage : aller-retour et rejet des données corrompues", () => {
  assert.deepEqual(parseBudget(JSON.stringify(base)), base);
  for (const value of [
    "null",
    "{}",
    "{broken",
    JSON.stringify({ ...base, version: 2 }),
    JSON.stringify({
      ...base,
      transactions: [transaction("1", "expense", -1, "2026-11-01")],
    }),
    JSON.stringify({
      ...base,
      transactions: [transaction("1", "expense", 1, "2026-10-01")],
    }),
  ])
    assert.throws(() => parseBudget(value));
});

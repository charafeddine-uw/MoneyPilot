import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/finance.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const {
  money,
  parseCents,
  centsInput,
  totals,
  budgetProgress,
  nextMonthlyDate,
  isDate,
  exportCSV,
  validateEntry,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const account = {
  id: "account",
  initial_balance_cents: 10000,
  reference_date: "2026-10-31",
};
const entry = (id, type, amount_cents, date = "2026-11-01", extra = {}) => ({
  id,
  type,
  amount_cents,
  date,
  account_id: "account",
  category_id: "food",
  description: "Exemple",
  expense_kind: "variable",
  deleted_at: null,
  ...extra,
});
test("conversion exacte des euros textuels en centimes et solde négatif", () => {
  for (const [text, value] of [
    ["0,01", 1],
    ["12.34", 1234],
    ["0.10", 10],
    ["1000000000.00", 100000000000],
  ]) {
    assert.equal(parseCents(text), value);
    assert.equal(parseCents(centsInput(value)), value);
  }
  assert.equal(parseCents("-12,34", true), -1234);
  for (const text of [
    "",
    "1.001",
    "NaN",
    "Infinity",
    "1e3",
    "-1",
    "1000000000.01",
    "12 34",
  ])
    assert.throws(() => parseCents(text));
});
test("référence de FIN de journée : le même jour est exclu du solde, pas des revenus mensuels", () => {
  const entries = [
    entry("1", "income", 2000, "2026-10-31"),
    entry("2", "expense", 1250),
  ];
  assert.deepEqual(totals(account, entries, "2026-10", "2026-11-15"), {
    balance: 8750,
    income: 2000,
    expenses: 0,
    result: 2000,
  });
  assert.equal(
    totals(account, entries, "2026-11", "2026-11-15").expenses,
    1250,
  );
});
test("ajout, modification et suppression de dépense recalculent le solde", () => {
  const incoming = entry("i", "income", 5000),
    expense = entry("e", "expense", 1234);
  assert.equal(totals(account, [], "2026-11", "2026-11-15").balance, 10000);
  assert.equal(
    totals(account, [incoming], "2026-11", "2026-11-15").balance,
    15000,
  );
  assert.equal(
    totals(account, [incoming, expense], "2026-11", "2026-11-15").balance,
    13766,
  );
  assert.equal(
    totals(
      account,
      [incoming, { ...expense, amount_cents: 2000 }],
      "2026-11",
      "2026-11-15",
    ).balance,
    13000,
  );
  assert.equal(
    totals(
      account,
      [incoming, { ...expense, deleted_at: "2026-11-15" }],
      "2026-11",
      "2026-11-15",
    ).balance,
    15000,
  );
});
test("résultat mensuel distinct du solde cumulé, sans compter les opérations futures", () => {
  const entries = [
    entry("1", "income", 20000, "2026-11-03"),
    entry("2", "expense", 5000, "2026-12-01"),
    entry("3", "expense", 7000, "2026-12-31"),
  ];
  assert.deepEqual(totals(account, entries, "2026-12", "2026-12-15"), {
    balance: 25000,
    income: 0,
    expenses: 5000,
    result: -5000,
  });
});
test("un solde initial négatif reste négatif sans transaction", () =>
  assert.equal(
    totals(
      { ...account, initial_balance_cents: -1250 },
      [],
      "2026-11",
      "2026-11-15",
    ).balance,
    -1250,
  ));
test("budgets dépassés et catégories non additionnées au global", () => {
  const entries = [
    entry("1", "expense", 1500),
    entry("2", "expense", 500, "2026-11-02", { category_id: "rent" }),
    entry("3", "income", 5000),
  ];
  const global = { month: "2026-11-01", amount_cents: 1000, category_id: null };
  assert.deepEqual(budgetProgress(global, entries), {
    spent: 2000,
    remaining: -1000,
    percent: 200,
  });
  assert.equal(
    budgetProgress({ ...global, category_id: "food" }, entries).spent,
    1500,
  );
  assert.equal(budgetProgress({ ...global, amount_cents: 0 }, []).percent, 0);
});
test("récurrence mensuelle : février, année bissextile et retour au jour ancré", () => {
  assert.equal(nextMonthlyDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextMonthlyDate("2026-02-28", 31), "2026-03-31");
  assert.equal(nextMonthlyDate("2024-01-31", 31), "2024-02-29");
  assert.equal(nextMonthlyDate("2026-12-20", 20), "2027-01-20");
});
test("dates calendaires sans décalage de fuseau et validation interface", () => {
  assert.ok(isDate("2024-02-29"));
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-13-01"), false);
  assert.throws(() =>
    validateEntry({
      type: "expense",
      amount_cents: 1.5,
      category_id: "food",
      date: "2026-01-01",
      description: "",
      expense_kind: "fixed",
    }),
  );
});
test("CSV compatible Excel et Pandas : BOM, guillemets, centimes et neutralisation des formules", () => {
  const csv = exportCSV(
    [
      entry("1", "expense", 1234, "2026-01-01", {
        description: ' \t=HYPERLINK("test")',
      }),
      entry("2", "income", 100, "2026-01-02", { description: "@SUM(1)" }),
      entry("3", "expense", 100, "2026-01-02", { deleted_at: "date" }),
    ],
    new Map([["food", "+Formule"]]),
    "-Compte",
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"12,34"'));
  assert.ok(csv.includes('"\' \t=HYPERLINK(""test"")"'));
  assert.ok(csv.includes('"\'@SUM(1)"'));
  assert.ok(csv.includes('"\'+Formule"'));
  assert.ok(csv.includes('"\'-Compte"'));
  assert.equal(csv.split("\r\n").length, 3);
});

test("formatage monétaire exact jusque dans les grands totaux en centimes", () => {
  assert.ok(money(9007199254740991).endsWith(",91 €"));
  assert.equal(money(-1), "−0,01 €");
});
test("dépassement de précision refusé sans total arrondi silencieux", () =>
  assert.throws(() =>
    totals(
      { ...account, initial_balance_cents: Number.MAX_SAFE_INTEGER },
      [entry("1", "income", 1)],
      "2026-11",
      "2026-11-15",
    ),
  ));

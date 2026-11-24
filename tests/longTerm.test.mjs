import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { importTS } from "./helpers/tsModule.mjs";
const {
  calculateLongTerm,
  coveredMonths,
  proportionalCents,
  closeExpiredBudgets,
} = await importTS(new URL("../src/lib/longTerm.ts", import.meta.url));
const { defaultDocument, parseBackup, LOCAL_USER, validateSnapshot } =
  await importTS(new URL("../src/services/localModel.ts", import.meta.url));
const { transactDocument } = await importTS(
  new URL("../src/services/localDatabase.ts", import.meta.url),
);
const repo = await importTS(
  new URL("../src/services/repository.ts", import.meta.url),
);
const { applyLongTermCommand, executeLongTerm } = await importTS(
  new URL("../src/services/longTermRepository.ts", import.meta.url),
);
const { totals } = await importTS(
  new URL("../src/lib/finance.ts", import.meta.url),
);
const now = "2026-01-01T12:00:00.000Z";
function fixture({
  amount = 120000,
  reserve = 0,
  received = true,
  start = "2026-01-01",
  end = "2026-04-30",
} = {}) {
  const s = defaultDocument().snapshot;
  const account = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    name: "Fictif",
    currency: "EUR",
    initial_balance_cents: 0,
    reference_date: "2025-12-31",
    updated_at: now,
  };
  s.account = account;
  const income = {
    id: randomUUID(),
    user_id: LOCAL_USER,
    account_id: account.id,
    type: "income",
    amount_cents: amount,
    category_id: s.categories[0].id,
    date: start,
    description: "Bourse fictive",
    expense_kind: "variable",
    recurring_id: null,
    occurrence_date: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  if (received) s.entries.push(income);
  const b = {
    id: randomUUID(),
    account_id: account.id,
    name: "Bourse fictive",
    expected_amount_cents: amount,
    start_date: start,
    end_date: end,
    payment_status: received ? "received" : "expected",
    initial_reserve_cents: reserve,
    recurring_plans: [],
    funding: received ? [{ entry_id: income.id, amount_cents: amount }] : [],
    income_decisions: received
      ? [{ entry_id: income.id, decision: "allocated" }]
      : [],
    manual_allocations: null,
    fixed_mappings: [],
    surplus_decisions: [],
    emergencies: [],
    created_at: now,
    updated_at: now,
    closing: null,
  };
  s.longTermBudgets.push(b);
  const expense = (amount_cents, date = "2026-01-15", extra = {}) => {
    const e = {
      ...income,
      id: randomUUID(),
      type: "expense",
      date,
      amount_cents,
      description: "Dépense fictive",
      ...extra,
    };
    s.entries.push(e);
    return e;
  };
  const calc = (date = "2026-01-16") => calculateLongTerm(b, s, date);
  return { s, b, income, expense, calc };
}
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
test("bourse reçue pour quatre mois complets : jours calendaires et conservation exacte", () => {
  const { calc } = fixture();
  const r = calc();
  assert.equal(r.funding_cents, 120000);
  assert.deepEqual(
    r.months.map((m) => m.planned_cents),
    [31000, 28000, 31000, 30000],
  );
  assert.equal(
    r.months.reduce((s, m) => s + m.allocation_cents, 0),
    120000,
  );
});
test("bornes inclusives en milieu de mois, changement d’année et arrondis exacts", () => {
  const { calc } = fixture({
    amount: 10001,
    start: "2026-11-15",
    end: "2027-02-15",
  });
  const r = calc("2026-11-16");
  assert.deepEqual(
    r.months.map((m) => m.days),
    [16, 31, 31, 15],
  );
  assert.equal(
    r.months.reduce((s, m) => s + m.planned_cents, 0),
    10001,
  );
  assert.deepEqual(proportionalCents(2, [1, 1, 1]), [1, 1, 0]);
  assert.equal(coveredMonths("2024-02-01", "2024-02-29")[0].days, 29);
});
test("bourse attendue : aucune opération ou disponibilité réelle créée", () => {
  const { s, calc } = fixture({ received: false });
  const r = calc();
  assert.equal(r.funding_cents, 0);
  assert.equal(r.variable_capacity_cents, 0);
  assert.equal(r.forecast_variable_cents, 120000);
  assert.equal(s.entries.length, 0);
  assert.equal(
    totals(s.account, s.entries, "2026-01", "2026-01-16").balance,
    0,
  );
});
test("charges fixes supérieures au financement : déficit explicite, jamais de montants mensuels négatifs", () => {
  const { b, calc } = fixture({ amount: 10000 });
  b.recurring_plans = [
    {
      recurring_id: randomUUID(),
      description: "Loyer",
      amount_cents: 5000,
      anchor_day: 1,
      first_date: "2026-01-01",
    },
  ];
  const r = calc();
  assert.equal(r.fixed_cents, 20000);
  assert.equal(r.raw_variable_cents, -10000);
  assert.equal(r.deficit_cents, 10000);
  assert.ok(r.months.every((m) => m.allocation_cents === 0));
});
test("personnalisation et montant non affecté : conservation après changements sans rapport", () => {
  const { s, b, expense, calc } = fixture();
  b.manual_allocations = {
    "2026-01": 10000,
    "2026-02": 20000,
    "2026-03": 30000,
    "2026-04": 40000,
  };
  expense(1000);
  const r = calc();
  assert.equal(r.unallocated_cents, 20000);
  assert.deepEqual(
    r.months.map((m) => m.planned_cents),
    [10000, 20000, 30000, 40000],
  );
  const before = structuredClone(b.manual_allocations);
  s.categories[0].name = "Autre libellé";
  assert.deepEqual(
    calc().months.map((m) => m.planned_cents),
    r.months.map((m) => m.planned_cents),
  );
  assert.deepEqual(b.manual_allocations, before);
  assert.throws(
    () =>
      applyLongTermCommand(
        s,
        {
          type: "manual",
          id: b.id,
          expected: b.updated_at,
          allocations: { "2026-01": 130000 },
        },
        "2026-01-16",
      ),
    /dépasse/,
  );
});
test("dépassement mensuel redistribué proportionnellement aux seuls mois futurs", () => {
  const { expense, calc } = fixture();
  expense(41000);
  const r = calc();
  assert.equal(r.months[0].overspending_cents, 10000);
  assert.equal(r.months[0].allocation_cents, 41000);
  assert.equal(r.future_cents, 79000);
  assert.equal(
    r.months.reduce((s, m) => s + m.allocation_cents, 0),
    120000,
  );
  assert.ok(r.months.every((m) => m.allocation_cents >= 0));
});
test("fonds futurs insuffisants : déficit non couvert visible sans bloquer la dépense", () => {
  const { expense, calc } = fixture();
  expense(140000);
  const r = calc();
  assert.equal(r.uncovered_cents, 20000);
  assert.equal(r.deficit_cents, 20000);
  assert.equal(r.future_cents, 0);
  assert.equal(r.months[0].remaining_cents, -20000);
});
test("surplus en attente sans choix ; partage explicite vers mois suivant et réserve", () => {
  const { s, b, expense } = fixture();
  expense(21000);
  const pending = calculateLongTerm(b, s, "2026-02-10");
  assert.equal(pending.pending_cents, 10000);
  assert.equal(pending.months[1].allocation_cents, 28000);
  const next = applyLongTermCommand(
    s,
    {
      type: "surplus",
      id: b.id,
      expected: b.updated_at,
      month: "2026-01",
      decision: { month: "2026-01", next_cents: 6000, reserve_cents: 4000 },
    },
    "2026-02-10",
  );
  const r = calculateLongTerm(next.longTermBudgets[0], next, "2026-02-10");
  assert.equal(r.pending_cents, 0);
  assert.equal(r.months[1].allocation_cents, 34000);
  assert.equal(r.reserve_remaining_cents, 4000);
  assert.equal(next.entries.length, s.entries.length);
});
test("décision de surplus invalidée après dépense antidatée sans modifier le choix enregistré", () => {
  const { s, b, expense } = fixture();
  expense(21000);
  b.surplus_decisions = [
    { month: "2026-01", next_cents: 10000, reserve_cents: 0 },
  ];
  expense(5000);
  const r = calculateLongTerm(b, s, "2026-02-10");
  assert.equal(r.pending_cents, 5000);
  assert.equal(r.months[1].allocation_cents, 28000);
  assert.ok(r.warnings.some((w) => w.includes("n’est plus possible")));
  assert.equal(b.surplus_decisions[0].next_cents, 10000);
});
test("imprévu combinant réserve et mois futurs : une seule dépense et réserve exacte", () => {
  const { s, b, expense } = fixture({ reserve: 20000 });
  const e = expense(10000);
  const before = totals(s.account, s.entries, "2026-01", "2026-01-16").balance;
  const next = applyLongTermCommand(
    s,
    {
      type: "emergency",
      id: b.id,
      expected: b.updated_at,
      entry_id: e.id,
      decision: { entry_id: e.id, reserve_cents: 7000, future_cents: 3000 },
    },
    "2026-01-16",
  );
  const r = calculateLongTerm(next.longTermBudgets[0], next, "2026-01-16");
  assert.equal(r.reserve_remaining_cents, 13000);
  assert.equal(r.reserve_used_cents, 7000);
  assert.equal(r.months[0].charged_spending_cents, 3000);
  assert.equal(next.entries.length, s.entries.length);
  assert.equal(
    totals(next.account, next.entries, "2026-01", "2026-01-16").balance,
    before,
  );
});
test("revenu supplémentaire partiellement affecté, choix séparé mémorisé, revenu jamais dupliqué", () => {
  const { s, b, income } = fixture();
  const extra = { ...income, id: randomUUID(), amount_cents: 20000 };
  s.entries.push(extra);
  assert.equal(calculateLongTerm(b, s, "2026-01-16").funding_cents, 120000);
  const next = applyLongTermCommand(
    s,
    {
      type: "funding",
      id: b.id,
      expected: b.updated_at,
      entry_id: extra.id,
      allocation: { entry_id: extra.id, amount_cents: 5000 },
    },
    "2026-01-16",
  );
  assert.equal(
    calculateLongTerm(next.longTermBudgets[0], next, "2026-01-16")
      .funding_cents,
    125000,
  );
  assert.equal(next.entries.length, 2);
  assert.equal(
    next.longTermBudgets[0].income_decisions.find(
      (d) => d.entry_id === extra.id,
    ).decision,
    "allocated",
  );
  const separate = applyLongTermCommand(
    s,
    {
      type: "funding",
      id: b.id,
      expected: b.updated_at,
      entry_id: extra.id,
      allocation: null,
    },
    "2026-01-16",
  );
  assert.equal(
    separate.longTermBudgets[0].income_decisions.find(
      (d) => d.entry_id === extra.id,
    ).decision,
    "separate",
  );
  assert.throws(
    () =>
      applyLongTermCommand(
        s,
        {
          type: "funding",
          id: b.id,
          expected: b.updated_at,
          entry_id: extra.id,
          allocation: { entry_id: extra.id, amount_cents: 20001 },
        },
        "2026-01-16",
      ),
    /dépasse/,
  );
});
test("dépense éditée, supprimée ou reclassée : recalcul sans toucher aux opérations", () => {
  const { expense, calc } = fixture();
  const e = expense(1000);
  assert.equal(calc().variable_spent_cents, 1000);
  e.amount_cents = 2500;
  assert.equal(calc().variable_spent_cents, 2500);
  e.expense_kind = "fixed";
  assert.equal(calc().variable_spent_cents, 0);
  assert.equal(calc().fixed_cents, 2500);
  e.deleted_at = now;
  assert.equal(calc().fixed_cents, 0);
});
test("prévision fixe rapprochée du paiement réel et écart, sans double comptage", () => {
  const { b, expense, calc } = fixture();
  const id = randomUUID();
  b.recurring_plans = [
    {
      recurring_id: id,
      description: "Loyer",
      amount_cents: 10000,
      anchor_day: 1,
      first_date: "2026-01-01",
    },
  ];
  const e = expense(12000, "2026-01-01", {
    expense_kind: "fixed",
    recurring_id: id,
    occurrence_date: "2026-01-01",
  });
  assert.equal(calc().fixed_cents, 42000);
  assert.equal(calc().fixed_occurrences[0].actual_cents, 12000);
  assert.equal(calc().variable_spent_cents, 0);
  e.deleted_at = now;
  assert.equal(calc().fixed_cents, 40000);
});
test("revenu modifié ou supprimé : financement effectif plafonné et avertissement", () => {
  const { income, calc } = fixture();
  income.amount_cents = 10000;
  assert.equal(calc().funding_cents, 10000);
  assert.ok(calc().warnings.length);
  income.deleted_at = now;
  assert.equal(calc().funding_cents, 0);
});
test("clôture automatique idempotente et archive figée après édition historique", () => {
  const { s, b, expense } = fixture();
  const e = expense(1000);
  const next = closeExpiredBudgets(s, "2026-05-01", now);
  const closed = next.longTermBudgets[0];
  assert.ok(closed.closing);
  assert.deepEqual(closeExpiredBudgets(next, "2026-05-02", now), next);
  const original = calculateLongTerm(closed, next);
  next.entries.find((row) => row.id === e.id).amount_cents = 99999;
  assert.deepEqual(calculateLongTerm(closed, next), original);
  assert.equal(b.closing, null);
});
test("ancienne donnée et sauvegarde V1 ouvertes sans réinitialisation", async () => {
  const { s } = fixture();
  delete s.longTermBudgets;
  const old = {
    snapshot: s,
    preferences: { currency: "EUR", locale: "fr-BE", lastBackupAt: null },
    revision: 42,
  };
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("moneypilot-local-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("documents");
    req.onsuccess = () => {
      const tx = req.result.transaction("documents", "readwrite");
      tx.objectStore("documents").put(old, "personal");
      tx.oncomplete = () => {
        req.result.close();
        resolve();
      };
      tx.onerror = reject;
    };
  });
  const d = await transactDocument();
  assert.equal(d.schemaVersion, 2);
  assert.equal(d.revision, 42);
  assert.deepEqual(d.snapshot.entries, s.entries);
  assert.deepEqual(d.snapshot.longTermBudgets, []);
  const backup = parseBackup(
    JSON.stringify({
      format: "Money" + "Pilot",
      version: 1,
      createdAt: now,
      data: s,
      preferences: old.preferences,
    }),
  );
  assert.deepEqual(backup.data.entries, s.entries);
  assert.deepEqual(backup.data.longTermBudgets, []);
});
test("export/import du nouveau budget, références et décisions préservées", async () => {
  const { s, b } = fixture({ start: "2026-11-01", end: "2027-02-28" });
  await transactDocument((d) => ({ ...d, snapshot: s }));
  const backup = await repo.createBackup();
  assert.equal(backup.version, 2);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.data.longTermBudgets[0].id, b.id);
  await repo.restoreBackup(parsed, (await transactDocument()).revision);
  assert.deepEqual(
    (await transactDocument()).snapshot.longTermBudgets,
    s.longTermBudgets,
  );
});
test("sauvegardes incohérentes rejetées : doublon de budget, deux actifs, montant fractionnaire", () => {
  const { s } = fixture();
  assert.throws(() =>
    validateSnapshot({
      ...s,
      longTermBudgets: [s.longTermBudgets[0], s.longTermBudgets[0]],
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      ...s,
      longTermBudgets: [
        s.longTermBudgets[0],
        { ...s.longTermBudgets[0], id: randomUUID() },
      ],
    }),
  );
  const corrupt = structuredClone(s);
  corrupt.longTermBudgets[0].initial_reserve_cents = 1.1;
  assert.throws(() => validateSnapshot(corrupt));
});
test("création explicitement financée par un nouveau revenu : opération atomique", async () => {
  const { s, b, income } = fixture({
    received: false,
    start: "2026-11-01",
    end: "2027-02-28",
  });
  s.longTermBudgets = [];
  await transactDocument((d) => ({ ...d, snapshot: s }));
  b.payment_status = "received";
  b.funding = [{ entry_id: income.id, amount_cents: income.amount_cents }];
  await executeLongTerm({ type: "create", budget: b, new_income: income });
  let doc = await transactDocument();
  assert.equal(doc.snapshot.entries.length, 1);
  assert.equal(doc.snapshot.longTermBudgets.length, 1);
  await assert.rejects(
    executeLongTerm({ type: "create", budget: b, new_income: income }),
  );
  doc = await transactDocument();
  assert.equal(doc.snapshot.entries.length, 1);
});
test("échec de création : aucune opération ajoutée si le financement est invalide", async () => {
  const { s, b, income } = fixture({
    received: false,
    start: "2026-11-01",
    end: "2027-02-28",
  });
  s.longTermBudgets = [];
  await transactDocument((d) => ({ ...d, snapshot: s }));
  b.funding = [{ entry_id: income.id, amount_cents: income.amount_cents + 1 }];
  await assert.rejects(
    executeLongTerm({ type: "create", budget: b, new_income: income }),
  );
  assert.equal((await transactDocument()).snapshot.entries.length, 0);
});

test("financement déjà affecté à une archive : impossible de le dépenser une seconde fois dans un nouveau budget", () => {
  const { s, b, income } = fixture();
  const archived = closeExpiredBudgets(s, "2026-05-01");
  const next = {
    ...structuredClone(b),
    id: randomUUID(),
    start_date: "2026-05-01",
    end_date: "2026-08-31",
    closing: null,
  };
  assert.throws(
    () =>
      applyLongTermCommand(
        archived,
        { type: "create", budget: next },
        "2026-05-01",
      ),
    /dépasse/,
  );
  assert.equal(income.amount_cents, 120000);
});
test("lecture locale : clôture effective persistée et idempotente sans dupliquer le budget", async () => {
  const { s, b } = fixture();
  await transactDocument((d) => ({ ...d, snapshot: s }));
  const first = await repo.loadSnapshot();
  assert.ok(first.longTermBudgets[0].closing);
  const revision = (await transactDocument()).revision;
  const second = await repo.loadSnapshot();
  assert.equal((await transactDocument()).revision, revision);
  assert.equal(second.longTermBudgets.length, 1);
  assert.equal(second.longTermBudgets[0].id, b.id);
  const backup = await repo.createBackup();
  assert.doesNotThrow(() => parseBackup(JSON.stringify(backup)));
});
test("champs optionnels absents : valeurs par défaut sans corruption des paramètres", () => {
  const { s, b } = fixture({ received: false });
  for (const field of [
    "funding",
    "income_decisions",
    "recurring_plans",
    "manual_allocations",
    "fixed_mappings",
    "surplus_decisions",
    "emergencies",
    "closing",
  ])
    delete b[field];
  const valid = validateSnapshot(s);
  assert.deepEqual(valid.longTermBudgets[0].funding, []);
  assert.equal(valid.longTermBudgets[0].closing, null);
  assert.equal(valid.longTermBudgets[0].expected_amount_cents, 120000);
});
test("repère quotidien et rythme : jours restants inclusifs, sans bloquer la saisie", () => {
  const { expense, calc } = fixture({ amount: 120000 });
  expense(24800, "2026-01-10");
  const r = calc("2026-01-12");
  assert.equal(r.pace_warning, true);
  assert.equal(r.daily_guideline_cents, 310);
  assert.equal(r.current.days, 31);
});
test("réduction de financement avec répartition manuelle : intention préservée, affichage plafonné", () => {
  const { s, b, income } = fixture();
  b.manual_allocations = {
    "2026-01": 30000,
    "2026-02": 30000,
    "2026-03": 30000,
    "2026-04": 30000,
  };
  income.amount_cents = 10000;
  const r = calculateLongTerm(b, s, "2026-01-16");
  assert.equal(
    r.months.reduce((sum, m) => sum + m.allocation_cents, 0),
    10000,
  );
  assert.equal(b.manual_allocations["2026-01"], 30000);
  assert.ok(r.warnings.some((w) => w.includes("personnalisés")));
});
test("ni transferts ni affectations internes ne deviennent des dépenses ou revenus", () => {
  const { s, expense, calc } = fixture();
  expense(20000, "2026-01-15", { type: "transfer" });
  assert.equal(calc().variable_spent_cents, 0);
  assert.equal(calc().fixed_cents, 0);
  assert.equal(calc().funding_cents, 120000);
  assert.equal(s.entries.length, 2);
});
test("déficit projeté : réserve non financée et dépenses sont cumulées sans sous-estimation", () => {
  const { expense, calc } = fixture({ received: false, reserve: 10000 });
  expense(5000);
  assert.equal(calc().deficit_cents, 15000);
});
test("null n’est pas un tableau valide de budgets ou de décisions", () => {
  const { s } = fixture();
  assert.throws(() => validateSnapshot({ ...s, longTermBudgets: null }));
  const invalid = structuredClone(s);
  invalid.longTermBudgets[0].emergencies = null;
  assert.throws(() => validateSnapshot(invalid));
});
test("rapprochement manuel d’une charge fixe : pas de devinette par catégorie ni de double comptage", () => {
  const { s, b, expense } = fixture();
  const recurringId = randomUUID();
  s.recurring.push({
    id: recurringId,
    user_id: LOCAL_USER,
    account_id: s.account.id,
    description: "Loyer fictif",
    amount_cents: 10000,
    category_id: s.categories[0].id,
    next_date: "2026-02-01",
    anchor_day: 1,
    active: true,
    updated_at: now,
  });
  b.recurring_plans = [
    {
      recurring_id: recurringId,
      description: "Loyer fictif",
      amount_cents: 10000,
      anchor_day: 1,
      first_date: "2026-01-01",
    },
  ];
  const entry = expense(12000, "2026-01-02", { expense_kind: "fixed" });
  assert.equal(calculateLongTerm(b, s, "2026-01-16").fixed_cents, 52000);
  const mapped = applyLongTermCommand(
    s,
    {
      type: "mapping",
      id: b.id,
      expected: b.updated_at,
      key: recurringId + ":2026-01-01",
      mapping: {
        entry_id: entry.id,
        recurring_id: recurringId,
        occurrence_date: "2026-01-01",
      },
    },
    "2026-01-16",
  );
  assert.equal(
    calculateLongTerm(mapped.longTermBudgets[0], mapped, "2026-01-16")
      .fixed_cents,
    42000,
  );
});
test("répartition entière : conservation et poids nuls sur des cas de centimes représentatifs", () => {
  for (const total of [0, 1, 2, 99, 10001, 100000000000])
    for (const weights of [
      [0, 16, 31, 31, 15],
      [1, 1, 1],
      [30000, 20000, 0, 10000],
    ]) {
      const allocation = proportionalCents(total, weights);
      assert.equal(
        allocation.reduce((sum, value) => sum + value, 0),
        total,
      );
      assert.ok(
        allocation.every(
          (value, i) =>
            Number.isSafeInteger(value) &&
            value >= 0 &&
            (weights[i] !== 0 || value === 0),
        ),
      );
    }
});
test("une archive réserve son financement effectif figé, pas une ancienne demande devenue non financée", () => {
  const { s, b, income } = fixture();
  income.amount_cents = 50000;
  const archived = closeExpiredBudgets(s, "2026-05-01");
  assert.equal(
    archived.longTermBudgets[0].closing.funding[0].amount_cents,
    50000,
  );
  archived.entries[0].amount_cents = 100000;
  const next = {
    ...structuredClone(b),
    id: randomUUID(),
    start_date: "2026-05-01",
    end_date: "2026-08-31",
    funding: [{ entry_id: income.id, amount_cents: 50000 }],
    closing: null,
  };
  const created = applyLongTermCommand(
    archived,
    { type: "create", budget: next },
    "2026-05-01",
  );
  assert.equal(
    calculateLongTerm(created.longTermBudgets[1], created, "2026-05-10")
      .funding_cents,
    50000,
  );
  created.entries[0].amount_cents = 60000;
  assert.equal(
    calculateLongTerm(created.longTermBudgets[1], created, "2026-05-10")
      .funding_cents,
    10000,
  );
});

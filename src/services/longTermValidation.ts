import type { Snapshot, Entry } from "../types/finance";
import type { LongTermBudget } from "../types/longTerm";
import { isDate, MAX_CENTS } from "../lib/finance";
import { coveredMonths, sumCents, calculateLongTerm } from "../lib/longTerm";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (): never => {
  throw new Error(
    "Budget longue durée invalide : vérifiez les montants, dates, identifiants et décisions. Aucune donnée modifiée.",
  );
};
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
}
function keys(value: unknown, allowed: string[], required = allowed) {
  const row = obj(value);
  if (
    Object.keys(row).some((k) => !allowed.includes(k)) ||
    required.some((k) => !(k in row))
  )
    fail();
  return row;
}
function id(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value)) fail();
}
function amount(value: unknown, positive = false) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > MAX_CENTS
  )
    fail();
}
function date(value: unknown) {
  if (typeof value !== "string" || !isDate(value)) fail();
}
function stamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    !value.includes("T")
  )
    fail();
}
function array(value: unknown) {
  if (!Array.isArray(value) || value.length > 100000) fail();
  return value as unknown[];
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail();
}
export function validateLongTermBudgets(
  value: unknown,
  snapshot: Snapshot,
): LongTermBudget[] {
  if (!Array.isArray(value)) fail();
  const budgets = structuredClone(value) as LongTermBudget[];
  unique(budgets.map((b) => b.id));
  const existingIds = new Set([
    snapshot.account?.id,
    ...snapshot.categories.map((c) => c.id),
    ...snapshot.entries.map((e) => e.id),
    ...snapshot.budgets.map((b) => b.id),
    ...snapshot.recurring.map((r) => r.id),
  ]);
  let active = 0;
  for (const b of budgets) {
    keys(
      b,
      [
        "id",
        "account_id",
        "name",
        "expected_amount_cents",
        "start_date",
        "end_date",
        "payment_status",
        "initial_reserve_cents",
        "recurring_plans",
        "funding",
        "income_decisions",
        "manual_allocations",
        "fixed_mappings",
        "surplus_decisions",
        "emergencies",
        "created_at",
        "updated_at",
        "closing",
      ],
      [
        "id",
        "account_id",
        "name",
        "expected_amount_cents",
        "start_date",
        "end_date",
        "payment_status",
        "initial_reserve_cents",
        "created_at",
        "updated_at",
      ],
    );
    id(b.id);
    if (
      existingIds.has(b.id) ||
      !snapshot.account ||
      b.account_id !== snapshot.account.id
    )
      fail();
    if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 80)
      fail();
    amount(b.expected_amount_cents, true);
    amount(b.initial_reserve_cents);
    date(b.start_date);
    date(b.end_date);
    if (
      b.end_date < b.start_date ||
      !["expected", "received"].includes(b.payment_status)
    )
      fail();
    stamp(b.created_at);
    stamp(b.updated_at);
    if (b.funding === undefined) b.funding = [];
    if (b.recurring_plans === undefined) b.recurring_plans = [];
    if (b.income_decisions === undefined) b.income_decisions = [];
    b.manual_allocations ??= null;
    if (b.fixed_mappings === undefined) b.fixed_mappings = [];
    if (b.surplus_decisions === undefined) b.surplus_decisions = [];
    if (b.emergencies === undefined) b.emergencies = [];
    b.closing ??= null;
    const entryIds = new Set(snapshot.entries.map((e) => e.id));
    for (const f of array(b.funding)) {
      const r = keys(f, ["entry_id", "amount_cents"]);
      id(r.entry_id);
      if (!entryIds.has(String(r.entry_id))) fail();
      amount(r.amount_cents, true);
    }
    unique(b.funding.map((f) => f.entry_id));
    if (sumCents(b.funding.map((f) => f.amount_cents)) > MAX_CENTS) fail();
    for (const p of array(b.recurring_plans)) {
      const r = keys(p, [
        "recurring_id",
        "description",
        "amount_cents",
        "anchor_day",
        "first_date",
      ]);
      id(r.recurring_id);
      if (!snapshot.recurring.some((item) => item.id === r.recurring_id))
        fail();
      if (
        typeof r.description !== "string" ||
        !r.description.trim() ||
        r.description.length > 200
      )
        fail();
      amount(r.amount_cents, true);
      date(r.first_date);
      if (
        String(r.first_date) < b.start_date ||
        !Number.isInteger(r.anchor_day) ||
        Number(r.anchor_day) < 1 ||
        Number(r.anchor_day) > 31
      )
        fail();
    }
    unique(b.recurring_plans.map((p) => p.recurring_id));
    const months = coveredMonths(b.start_date, b.end_date).map((m) => m.month);
    if (b.manual_allocations !== null) {
      const allocations = obj(b.manual_allocations);
      if (
        Object.keys(allocations).length !== months.length ||
        Object.keys(allocations).some((m) => !months.includes(m))
      )
        fail();
      for (const cents of Object.values(allocations)) amount(cents);
      if (sumCents(Object.values(allocations) as number[]) > MAX_CENTS) fail();
    }
    for (const d of array(b.income_decisions)) {
      const r = keys(d, ["entry_id", "decision"]);
      id(r.entry_id);
      if (
        !entryIds.has(String(r.entry_id)) ||
        !["allocated", "separate"].includes(String(r.decision))
      )
        fail();
    }
    unique(b.income_decisions.map((d) => d.entry_id));
    for (const d of array(b.fixed_mappings)) {
      const r = keys(d, ["entry_id", "recurring_id", "occurrence_date"]);
      id(r.entry_id);
      id(r.recurring_id);
      date(r.occurrence_date);
      if (
        !entryIds.has(String(r.entry_id)) ||
        !b.recurring_plans.some((p) => p.recurring_id === r.recurring_id) ||
        String(r.occurrence_date) < b.start_date ||
        String(r.occurrence_date) > b.end_date
      )
        fail();
    }
    unique(b.fixed_mappings.map((d) => d.entry_id));
    unique(
      b.fixed_mappings.map((d) => d.recurring_id + ":" + d.occurrence_date),
    );
    for (const d of array(b.surplus_decisions)) {
      const r = keys(d, ["month", "next_cents", "reserve_cents"]);
      if (!months.includes(String(r.month))) fail();
      amount(r.next_cents);
      amount(r.reserve_cents);
    }
    unique(b.surplus_decisions.map((d) => d.month));
    for (const d of array(b.emergencies)) {
      const r = keys(d, ["entry_id", "reserve_cents", "future_cents"]);
      id(r.entry_id);
      if (!entryIds.has(String(r.entry_id))) fail();
      amount(r.reserve_cents);
      amount(r.future_cents);
    }
    unique(b.emergencies.map((d) => d.entry_id));
    if (!b.closing) {
      active++;
      continue;
    }
    keys(b.closing, ["closed_at", "entries", "funding", "totals"]);
    stamp(b.closing.closed_at);
    const frozenEntries = array(b.closing.entries) as Entry[];
    unique(frozenEntries.map((e) => e.id));
    for (const e of frozenEntries) {
      keys(e, [
        "id",
        "user_id",
        "account_id",
        "type",
        "amount_cents",
        "category_id",
        "date",
        "description",
        "expense_kind",
        "recurring_id",
        "occurrence_date",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);
      id(e.id);
      id(e.user_id);
      id(e.category_id);
      if (
        e.account_id !== b.account_id ||
        !["income", "expense"].includes(e.type) ||
        !["fixed", "variable"].includes(e.expense_kind)
      )
        fail();
      amount(e.amount_cents, true);
      date(e.date);
      if (typeof e.description !== "string" || e.description.length > 200)
        fail();
      stamp(e.created_at);
      stamp(e.updated_at);
      if (e.deleted_at !== null) stamp(e.deleted_at);
      if (e.recurring_id !== null) id(e.recurring_id);
      if (e.occurrence_date !== null) date(e.occurrence_date);
    }
    for (const f of array(b.closing.funding)) {
      keys(f, ["entry_id", "amount_cents"]);
      id((f as { entry_id: string }).entry_id);
      amount((f as { amount_cents: number }).amount_cents);
      const funding = f as { entry_id: string; amount_cents: number };
      const source = frozenEntries.find(
        (e) =>
          e.id === funding.entry_id && !e.deleted_at && e.type === "income",
      );
      if (
        funding.amount_cents &&
        (!source || source.amount_cents < funding.amount_cents)
      )
        fail();
    }
    unique(b.closing.funding.map((f) => f.entry_id));
    if (
      b.closing.funding.length !== b.funding.length ||
      b.closing.funding.some(
        (f) =>
          !b.funding.some(
            (original) =>
              original.entry_id === f.entry_id &&
              original.amount_cents >= f.amount_cents,
          ),
      )
    )
      fail();
    keys(b.closing.totals, [
      "funding_cents",
      "fixed_cents",
      "variable_spent_cents",
      "reserve_remaining_cents",
      "deficit_cents",
    ]);
    for (const n of Object.values(b.closing.totals))
      if (!Number.isSafeInteger(n) || n < 0) fail();
    const result = calculateLongTerm(b, {
      entries: snapshot.entries,
      longTermBudgets: budgets,
    });
    for (const name of Object.keys(
      b.closing.totals,
    ) as (keyof typeof b.closing.totals)[])
      if (result[name] !== b.closing.totals[name]) fail();
  }
  if (active > 1)
    throw new Error(
      "Une sauvegarde ne peut contenir qu’un seul budget longue durée actif.",
    );
  return budgets;
}

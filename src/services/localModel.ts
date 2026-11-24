import type { Snapshot } from "../types/finance";
import { isDate, MAX_CENTS, todayISO } from "../lib/finance";
import { validateLongTermBudgets } from "./longTermValidation";
export const LOCAL_USER = "00000000-0000-4000-9000-000000000001";
export interface Preferences {
  currency: "EUR";
  locale: "fr-BE";
  lastBackupAt: string | null;
}
export interface LocalDocument {
  schemaVersion?: 2;
  snapshot: Snapshot;
  preferences: Preferences;
  revision: number;
}
export interface Backup {
  format: "MoneyPilot";
  version: 1 | 2;
  createdAt: string;
  data: Snapshot;
  preferences: Preferences;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(): never {
  throw new Error(
    "Sauvegarde invalide : vérifiez les types, montants, identifiants et relations. Aucune donnée modifiée.",
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((k) => !keys.includes(k))
  )
    fail();
}
function text(
  value: unknown,
  max: number,
  empty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    fail();
}
function id(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value)) fail();
}
function date(value: unknown) {
  if (typeof value !== "string" || !isDate(value)) fail();
}
function timestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail();
}
function cents(value: unknown, negative = false, zero = false) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_CENTS ||
    (!negative && value < (zero ? 0 : 1))
  )
    fail();
}
export function validateSnapshot(value: unknown): Snapshot {
  const s = object(value);
  const baseKeys = ["account", "categories", "entries", "budgets", "recurring"];
  exact(
    s,
    "longTermBudgets" in s ? [...baseKeys, "longTermBudgets"] : baseKeys,
  );
  for (const name of ["categories", "entries", "budgets", "recurring"])
    if (!Array.isArray(s[name]) || (s[name] as unknown[]).length > 100000)
      fail();
  const snapshot = structuredClone(value) as Snapshot;
  const allIds = new Set<string>();
  function row(value: unknown, keys: string[], owner = true) {
    const r = object(value);
    exact(r, keys);
    id(r.id);
    if (allIds.has(r.id as string)) fail();
    allIds.add(r.id as string);
    if (owner && r.user_id !== LOCAL_USER) fail();
    return r;
  }
  if (snapshot.account) {
    const a = row(snapshot.account, [
      "id",
      "user_id",
      "name",
      "currency",
      "initial_balance_cents",
      "reference_date",
      "updated_at",
    ]);
    text(a.name, 80);
    if (a.currency !== "EUR") fail();
    cents(a.initial_balance_cents, true);
    date(a.reference_date);
    if ((a.reference_date as string) > todayISO()) fail();
    timestamp(a.updated_at);
  } else if (snapshot.account !== null) fail();
  const categories = new Set<string>();
  const names = new Set<string>();
  for (const category of snapshot.categories) {
    const c = row(category, ["id", "user_id", "name", "color"], false);
    if (c.user_id !== null && c.user_id !== LOCAL_USER) fail();
    text(c.name, 60);
    if (names.has(c.name.trim().toLocaleLowerCase())) fail();
    names.add(c.name.trim().toLocaleLowerCase());
    if (typeof c.color !== "string" || !/^#[0-9a-f]{6}$/i.test(c.color)) fail();
    categories.add(category.id);
  }
  const relation = (accountId: unknown, categoryId: unknown) => {
    if (
      !snapshot.account ||
      accountId !== snapshot.account.id ||
      !categories.has(categoryId as string)
    )
      fail();
  };
  const recurrences = new Map<string, string>();
  for (const item of snapshot.recurring) {
    const r = row(item, [
      "id",
      "user_id",
      "account_id",
      "description",
      "amount_cents",
      "category_id",
      "next_date",
      "anchor_day",
      "active",
      "updated_at",
    ]);
    relation(r.account_id, r.category_id);
    text(r.description, 200);
    cents(r.amount_cents);
    date(r.next_date);
    if (
      !Number.isInteger(r.anchor_day) ||
      Number(r.anchor_day) < 1 ||
      Number(r.anchor_day) > 31 ||
      typeof r.active !== "boolean"
    )
      fail();
    timestamp(r.updated_at);
    recurrences.set(item.id, item.account_id);
  }
  const occurrences = new Set<string>();
  for (const entry of snapshot.entries) {
    const e = row(entry, [
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
    relation(e.account_id, e.category_id);
    if (
      !["income", "expense"].includes(String(e.type)) ||
      !["fixed", "variable"].includes(String(e.expense_kind))
    )
      fail();
    cents(e.amount_cents);
    date(e.date);
    if ((e.date as string) > todayISO()) fail();
    text(e.description, 200, true);
    timestamp(e.created_at);
    timestamp(e.updated_at);
    if (e.deleted_at !== null) timestamp(e.deleted_at);
    if (e.recurring_id === null) {
      if (e.occurrence_date !== null) fail();
    } else {
      if (
        recurrences.get(String(e.recurring_id)) !== e.account_id ||
        e.type !== "expense" ||
        e.expense_kind !== "fixed"
      )
        fail();
      date(e.occurrence_date);
      const key = `${e.recurring_id}:${e.occurrence_date}`;
      if (occurrences.has(key)) fail();
      occurrences.add(key);
    }
  }
  const budgetKeys = new Set<string>();
  for (const item of snapshot.budgets) {
    const b = row(item, [
      "id",
      "user_id",
      "month",
      "amount_cents",
      "category_id",
      "updated_at",
    ]);
    date(b.month);
    if (!(b.month as string).endsWith("-01")) fail();
    cents(b.amount_cents, false, true);
    if (
      !snapshot.account ||
      (b.category_id !== null && !categories.has(String(b.category_id)))
    )
      fail();
    timestamp(b.updated_at);
    const key = `${b.month}:${b.category_id}`;
    if (budgetKeys.has(key)) fail();
    budgetKeys.add(key);
  }
  snapshot.longTermBudgets = validateLongTermBudgets(
    s.longTermBudgets === undefined ? [] : s.longTermBudgets,
    snapshot,
  );
  return snapshot;
}
export function validatePreferences(value: unknown): Preferences {
  const p = object(value);
  exact(p, ["currency", "locale", "lastBackupAt"]);
  if (p.currency !== "EUR" || p.locale !== "fr-BE") fail();
  if (p.lastBackupAt !== null) timestamp(p.lastBackupAt);
  return structuredClone(p) as unknown as Preferences;
}
export function parseBackup(json: string): Backup {
  if (json.length > 20_000_000)
    throw new Error("Fichier trop volumineux (20 Mo maximum).");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Ce fichier ne contient pas un JSON valide.");
  }
  const b = object(value);
  if (b.format !== "MoneyPilot")
    throw new Error("Ce fichier n’est pas une sauvegarde MoneyPilot.");
  if (b.version !== 1 && b.version !== 2)
    throw new Error(
      "Version de sauvegarde incompatible. Les formats 1 et 2 sont pris en charge.",
    );
  exact(b, ["format", "version", "createdAt", "data", "preferences"]);
  timestamp(b.createdAt);
  return {
    format: "MoneyPilot",
    version: b.version as 1 | 2,
    createdAt: b.createdAt as string,
    data: validateSnapshot(b.data),
    preferences: validatePreferences(b.preferences),
  };
}
export function defaultDocument(): LocalDocument {
  const categories = [
    ["Logement", "#69834d"],
    ["Alimentation", "#b8ca85"],
    ["Transport", "#9bb5ad"],
    ["Loisirs", "#d7bb8e"],
    ["Études", "#8f9bba"],
    ["Salaire", "#4f8062"],
    ["Autre", "#a3a99b"],
  ].map(([name, color], i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    user_id: null,
    name,
    color,
  }));
  return {
    schemaVersion: 2,
    snapshot: {
      longTermBudgets: [],
      account: null,
      categories,
      entries: [],
      budgets: [],
      recurring: [],
    },
    preferences: { currency: "EUR", locale: "fr-BE", lastBackupAt: null },
    revision: 0,
  };
}

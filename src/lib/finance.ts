import type {
  Account,
  Entry,
  MonthlyBudget,
  EntryInput,
} from "../types/finance";
export const MAX_CENTS = 100_000_000_000;
export function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function isDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "1900-01-01" &&
    value <= "2100-12-31" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
// Conversion textuelle : aucune multiplication d'un montant décimal en euros.
export function parseCents(text: string, allowNegative = false): number {
  const value = text.trim().replace(",", ".");
  const match = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || (match[1] && !allowNegative))
    throw new Error("Saisissez un montant valide avec deux décimales maximum.");
  const cents =
    (Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"))) *
    (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS)
    throw new Error("Le montant dépasse la limite autorisée.");
  return cents;
}
export function centsInput(value: number) {
  return `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
}
// Formate les centimes sans reconvertir le montant complet en décimal flottant.
export function money(cents: number) {
  if (!Number.isSafeInteger(cents))
    throw new Error("Montant hors précision autorisée.");
  const absolute = Math.abs(cents);
  const whole = new Intl.NumberFormat("fr-BE", {
    maximumFractionDigits: 0,
  }).format(BigInt(Math.floor(absolute / 100)));
  return `${cents < 0 ? "−" : ""}${whole},${String(absolute % 100).padStart(2, "0")} €`;
}
function safeAdd(left: number, right: number) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum))
    throw new Error("Total hors précision autorisée.");
  return sum;
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr-BE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
export function validateEntry(entry: EntryInput) {
  if (
    !["income", "expense"].includes(entry.type) ||
    !["fixed", "variable"].includes(entry.expense_kind) ||
    !Number.isSafeInteger(entry.amount_cents) ||
    entry.amount_cents <= 0 ||
    entry.amount_cents > MAX_CENTS ||
    !isDate(entry.date) ||
    entry.date > todayISO() ||
    entry.description.length > 200 ||
    !entry.category_id
  )
    throw new Error(
      "Vérifiez le montant positif, la catégorie, la date et la description (200 caractères maximum).",
    );
}
export function totals(
  account: Account | null,
  entries: Entry[],
  month: string,
  today = todayISO(),
) {
  let income = 0,
    expenses = 0,
    balance = account?.initial_balance_cents ?? 0;
  for (const entry of entries) {
    if (entry.deleted_at || entry.date > today) continue;
    const sign = entry.type === "income" ? 1 : -1;
    if (
      account &&
      entry.account_id === account.id &&
      entry.date > account.reference_date
    )
      balance = safeAdd(balance, sign * entry.amount_cents);
    if (entry.date.slice(0, 7) === month) {
      if (entry.type === "income") income = safeAdd(income, entry.amount_cents);
      else expenses = safeAdd(expenses, entry.amount_cents);
    }
  }
  return { balance, income, expenses, result: income - expenses };
}
export function budgetProgress(budget: MonthlyBudget, entries: Entry[]) {
  const spent = entries
    .filter(
      (entry) =>
        !entry.deleted_at &&
        entry.type === "expense" &&
        entry.date.slice(0, 7) === budget.month.slice(0, 7) &&
        (!budget.category_id || entry.category_id === budget.category_id),
    )
    .reduce((sum, entry) => safeAdd(sum, entry.amount_cents), 0);
  return {
    spent,
    remaining: budget.amount_cents - spent,
    percent: budget.amount_cents
      ? Math.round((spent / budget.amount_cents) * 100)
      : spent
        ? 100
        : 0,
  };
}
export function nextMonthlyDate(date: string, anchorDay: number) {
  const [year, month] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const day = Math.min(
    anchorDay,
    new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate(),
  );
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const csvText = (value: string) => {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
export function exportCSV(
  entries: Entry[],
  categories: Map<string, string>,
  accountName: string,
) {
  const rows = [
    [
      "Date",
      "Type",
      "Montant EUR positif",
      "Devise",
      "Catégorie",
      "Description",
      "Compte",
    ]
      .map(csvText)
      .join(";"),
  ];
  for (const entry of entries.filter((item) => !item.deleted_at))
    rows.push(
      [
        entry.date,
        entry.type === "income" ? "Revenu" : "Dépense",
        centsInput(entry.amount_cents).replace(".", ","),
        "EUR",
        categories.get(entry.category_id) ?? "Autre",
        entry.description,
        accountName,
      ]
        .map(csvText)
        .join(";"),
    );
  return "\uFEFF" + rows.join("\r\n");
}

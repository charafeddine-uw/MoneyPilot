import type {
  Account,
  Entry,
  MonthlyBudget,
  RecurringExpense,
  Snapshot,
} from "../types/finance";
import { closeExpiredBudgets } from "../lib/longTerm";
import { nextMonthlyDate, todayISO } from "../lib/finance";
import { transactDocument } from "./localDatabase";
import { defaultDocument, parseBackup } from "./localModel";
import type { Backup } from "./localModel";
type Row = Account | Entry | MonthlyBudget | RecurringExpense;
type Table = "accounts" | "transactions" | "budgets" | "recurring_expenses";
const collection = (table: Exclude<Table, "accounts">) =>
  (
    ({
      transactions: "entries",
      budgets: "budgets",
      recurring_expenses: "recurring",
    }) as const
  )[table];
export async function loadSnapshot(_userId?: string): Promise<Snapshot> {
  let d = await transactDocument();
  if (
    d.snapshot.longTermBudgets.some(
      (b) => !b.closing && b.end_date < todayISO(),
    )
  )
    d = await transactDocument((current) => ({
      ...current,
      snapshot: closeExpiredBudgets(current.snapshot),
    }));
  return {
    ...d.snapshot,
    entries: d.snapshot.entries.filter((e) => !e.deleted_at),
  };
}
export async function insertRow<T extends Row>(
  table: Table,
  row: T,
): Promise<T> {
  let saved = row;
  await transactDocument((d) => {
    const rows: Row[] =
      table === "accounts"
        ? d.snapshot.account
          ? [d.snapshot.account]
          : []
        : d.snapshot[collection(table)];
    const existing = rows.find((r) => r.id === row.id);
    if (existing) {
      for (const key of Object.keys(row))
        if (
          !["updated_at", "created_at"].includes(key) &&
          Reflect.get(existing, key) !== Reflect.get(row, key)
        )
          throw new Error("RETRY_CHANGED");
      saved = existing as T;
      return d;
    }
    if (table === "accounts") {
      if (d.snapshot.account)
        throw new Error("Un compte existe déjà. Actualisez la page.");
      d.snapshot.account = row as Account;
    } else (d.snapshot[collection(table)] as Row[]).push(row);
    return d;
  });
  return saved;
}
export async function updateRow<T extends Row>(
  table: Table,
  previous: T,
  changes: Partial<T>,
): Promise<T> {
  let saved: T;
  await transactDocument((d) => {
    const rows: Row[] =
      table === "accounts"
        ? d.snapshot.account
          ? [d.snapshot.account]
          : []
        : d.snapshot[collection(table)];
    const existing = rows.find((r) => r.id === previous.id);
    if (!existing || existing.updated_at !== previous.updated_at)
      throw new Error(
        "Ces données ont changé dans un autre onglet. Actualisez avant de réessayer.",
      );
    saved = {
      ...existing,
      ...changes,
      updated_at: new Date(
        Math.max(Date.now(), Date.parse(existing.updated_at) + 1),
      ).toISOString(),
    } as T;
    if (table === "accounts") d.snapshot.account = saved as Account;
    else
      (d.snapshot[collection(table)] as Row[])[rows.indexOf(existing)] = saved;
    return d;
  });
  return saved!;
}
export async function insertCategory(row: Snapshot["categories"][number]) {
  await transactDocument((d) => {
    d.snapshot.categories.push(row);
    return d;
  });
}
export async function renameCategory(id: string, name: string) {
  await transactDocument((d) => {
    const category = d.snapshot.categories.find((c) => c.id === id);
    if (!category) throw new Error("Catégorie inconnue.");
    category.name = name.trim();
    return d;
  });
}
export async function removeCategory(id: string) {
  await transactDocument((d) => {
    if (
      d.snapshot.entries.some((e) => e.category_id === id) ||
      d.snapshot.budgets.some((b) => b.category_id === id) ||
      d.snapshot.recurring.some((r) => r.category_id === id)
    )
      throw new Error(
        "Cette catégorie est utilisée. Renommez-la ou conservez-la pour préserver les relations.",
      );
    d.snapshot.categories = d.snapshot.categories.filter((c) => c.id !== id);
    return d;
  });
}
export async function confirmRecurringLocal(
  item: RecurringExpense,
  transactionId: string,
) {
  await transactDocument((d) => {
    if (
      d.snapshot.entries.some(
        (e) =>
          e.recurring_id === item.id && e.occurrence_date === item.next_date,
      )
    )
      return d;
    const r = d.snapshot.recurring.find((r) => r.id === item.id);
    if (
      !r ||
      !r.active ||
      r.next_date !== item.next_date ||
      r.next_date > todayISO()
    )
      throw new Error("Échéance modifiée ou non disponible. Actualisez.");
    const now = new Date().toISOString();
    d.snapshot.entries.push({
      id: transactionId,
      user_id: r.user_id,
      account_id: r.account_id,
      type: "expense",
      amount_cents: r.amount_cents,
      category_id: r.category_id,
      date: r.next_date,
      description: r.description,
      expense_kind: "fixed",
      recurring_id: r.id,
      occurrence_date: r.next_date,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    r.next_date = nextMonthlyDate(r.next_date, r.anchor_day);
    r.updated_at = now;
    return d;
  });
}
export async function prepareBackup(): Promise<{
  backup: Backup;
  revision: number;
}> {
  const d = await transactDocument();
  const createdAt = new Date().toISOString();
  return {
    backup: {
      format: "MoneyPilot",
      version: 2,
      createdAt,
      data: d.snapshot,
      preferences: { ...d.preferences, lastBackupAt: createdAt },
    },
    revision: d.revision,
  };
}
export async function createBackup(): Promise<Backup> {
  return (await prepareBackup()).backup;
}
export async function markBackup(at: string, expectedRevision?: number) {
  return transactDocument((d) => {
    if (expectedRevision !== undefined && d.revision !== expectedRevision)
      throw new Error(
        "Les données ont changé pendant la sauvegarde. Téléchargez une nouvelle copie avant de continuer.",
      );
    d.preferences.lastBackupAt = at;
    return d;
  });
}
export async function restoreBackup(backup: Backup, expectedRevision: number) {
  const valid = parseBackup(JSON.stringify(backup));
  await transactDocument((d) => {
    if (d.revision !== expectedRevision)
      throw new Error(
        "Les données ont changé depuis la prévisualisation. Sélectionnez de nouveau le fichier.",
      );
    return {
      ...d,
      snapshot: valid.data,
      preferences: { ...valid.preferences, lastBackupAt: valid.createdAt },
    };
  });
}
export async function resetLocal(expectedRevision: number) {
  await transactDocument((d) => {
    if (d.revision !== expectedRevision)
      throw new Error("Les données ont changé. Recommencez la confirmation.");
    return defaultDocument();
  });
}

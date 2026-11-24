import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  Snapshot,
  Account,
  EntryInput,
  Entry,
  MonthlyBudget,
  RecurringExpense,
} from "../types/finance";
import { DEMO_USER, createDemo } from "../lib/demoV1";
import {
  isDate,
  MAX_CENTS,
  nextMonthlyDate,
  todayISO,
  validateEntry,
} from "../lib/finance";
import {
  insertCategory,
  confirmRecurringLocal,
  insertRow,
  loadSnapshot,
  updateRow,
} from "../services/repository";
import { storageError } from "../services/localDatabase";
import { LOCAL_USER } from "../services/localModel";

import {
  executeLongTerm,
  applyLongTermCommand,
} from "../services/longTermRepository";
import type { LongTermCommand } from "../services/longTermRepository";
interface FinanceContextValue extends Snapshot {
  runLongTerm: (command: LongTermCommand) => Promise<void>;
  demo: boolean;
  base: string;
  loading: boolean;
  syncing: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  saveAccount: (
    name: string,
    amount: number,
    date: string,
    expected?: Account | null,
  ) => Promise<Account>;
  saveEntry: (id: string, input: EntryInput, previous?: Entry) => Promise<void>;
  deleteEntry: (entry: Entry) => Promise<void>;
  saveBudget: (
    id: string,
    month: string,
    amount: number,
    category: string | null,
    previous?: MonthlyBudget,
  ) => Promise<void>;
  saveRecurring: (
    id: string,
    input: Pick<
      RecurringExpense,
      | "description"
      | "amount_cents"
      | "category_id"
      | "next_date"
      | "anchor_day"
      | "active"
    >,
    previous?: RecurringExpense,
  ) => Promise<void>;
  confirmRecurring: (
    item: RecurringExpense,
    transactionId: string,
  ) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
}
const empty: Snapshot = {
  longTermBudgets: [],
  account: null,
  categories: [],
  entries: [],
  budgets: [],
  recurring: [],
};
const FinanceContext = createContext<FinanceContextValue | null>(null);
export function FinanceProvider({
  children,
  demo = false,
}: {
  children: ReactNode;
  demo?: boolean;
}) {
  const userId = demo ? DEMO_USER : LOCAL_USER;
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
      demo ? createDemo() : empty,
    ),
    [loading, setLoading] = useState(!demo),
    [syncing, setSyncing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    request = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (demo || !userId) return;
    const generation = ++request.current;
    setSyncing(true);
    try {
      const next = await loadSnapshot(userId);
      if (mounted.current && generation === request.current) {
        setSnapshot(next);
        setError("");
        setLoading(false);
      }
    } catch (err) {
      if (mounted.current && generation === request.current) {
        setError(storageError(err));
        setLoading(false);
      }
    } finally {
      if (mounted.current && generation === request.current) setSyncing(false);
    }
  }, [demo, userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (demo) return;
    const reload = () => {
      if (!lock.current) void refresh();
    };
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60000);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      clearInterval(timer);
    };
  }, [demo, refresh]);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) throw new Error("Un enregistrement est déjà en cours.");
    lock.current = true;
    request.current++;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      const message =
        err instanceof Error && err.message === "RETRY_CHANGED"
          ? "Une tentative précédente a déjà été enregistrée avec des valeurs différentes. Actualisez avant de réessayer."
          : storageError(err);
      if (mounted.current) setError(message);
      throw new Error(message);
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        setSyncing(false);
      }
    }
  }
  const now = () => new Date().toISOString();
  async function saveAccount(
    name: string,
    amount: number,
    date: string,
    expected?: Account | null,
  ) {
    let savedAccount: Account | null = null;
    if (
      !userId ||
      !name.trim() ||
      name.trim().length > 80 ||
      !Number.isSafeInteger(amount) ||
      Math.abs(amount) > MAX_CENTS ||
      !isDate(date) ||
      date > todayISO()
    )
      throw new Error("Vérifiez le nom, le solde et la date de référence.");
    await mutate(async () => {
      const previous = expected === undefined ? snapshot.account : expected;
      const row = {
        id: previous?.id ?? crypto.randomUUID(),
        user_id: userId,
        name: name.trim(),
        currency: "EUR" as const,
        initial_balance_cents: amount,
        reference_date: date,
        updated_at: now(),
      };
      const saved = demo
        ? row
        : previous
          ? await updateRow("accounts", previous, {
              name: row.name,
              initial_balance_cents: amount,
              reference_date: date,
            })
          : await insertRow("accounts", row);
      savedAccount = saved;
      if (mounted.current)
        setSnapshot((value) => ({ ...value, account: saved }));
    });
    return savedAccount!;
  }
  async function saveEntry(id: string, input: EntryInput, previous?: Entry) {
    validateEntry(input);
    if (!snapshot.account || !userId)
      throw new Error("Configurez d’abord votre compte principal.");
    if (!snapshot.categories.some((c) => c.id === input.category_id))
      throw new Error("Catégorie inconnue.");
    await mutate(async () => {
      const row: Entry = {
        ...input,
        id,
        user_id: userId,
        account_id: snapshot.account!.id,
        recurring_id: previous?.recurring_id ?? null,
        occurrence_date: previous?.occurrence_date ?? null,
        created_at: previous?.created_at ?? now(),
        updated_at: now(),
        deleted_at: null,
      };
      const saved = demo
        ? row
        : previous
          ? await updateRow("transactions", previous, input)
          : await insertRow("transactions", row);
      if (mounted.current)
        setSnapshot((value) => ({
          ...value,
          entries: [...value.entries.filter((item) => item.id !== id), saved],
        }));
    });
  }
  async function deleteEntry(entry: Entry) {
    await mutate(async () => {
      if (!demo) await updateRow("transactions", entry, { deleted_at: now() });
      if (mounted.current)
        setSnapshot((value) => ({
          ...value,
          entries: value.entries.filter((item) => item.id !== entry.id),
        }));
    });
  }
  async function saveBudget(
    id: string,
    month: string,
    amount: number,
    category: string | null,
    previous?: MonthlyBudget,
  ) {
    if (
      !userId ||
      !isDate(month + "-01") ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > MAX_CENTS ||
      (category && !snapshot.categories.some((c) => c.id === category))
    )
      throw new Error("Vérifiez le mois, le montant et la catégorie.");
    if (
      snapshot.budgets.some(
        (b) =>
          b.id !== id &&
          b.month === month + "-01" &&
          b.category_id === category,
      )
    )
      throw new Error(
        "Ce budget existe déjà pour ce mois et cette catégorie. Modifiez-le dans la liste.",
      );
    await mutate(async () => {
      const row: MonthlyBudget = {
        id,
        user_id: userId,
        month: month + "-01",
        amount_cents: amount,
        category_id: category,
        updated_at: now(),
      };
      const saved = demo
        ? row
        : previous
          ? await updateRow("budgets", previous, {
              month: row.month,
              amount_cents: amount,
              category_id: category,
            })
          : await insertRow("budgets", row);
      if (mounted.current)
        setSnapshot((value) => ({
          ...value,
          budgets: [...value.budgets.filter((item) => item.id !== id), saved],
        }));
    });
  }
  async function saveRecurring(
    id: string,
    input: Pick<
      RecurringExpense,
      | "description"
      | "amount_cents"
      | "category_id"
      | "next_date"
      | "anchor_day"
      | "active"
    >,
    previous?: RecurringExpense,
  ) {
    if (!userId || !snapshot.account)
      throw new Error("Configurez votre compte.");
    validateEntry({
      type: "expense",
      amount_cents: input.amount_cents,
      category_id: input.category_id,
      date: todayISO(),
      description: input.description,
      expense_kind: "fixed",
    });
    if (
      !input.description.trim() ||
      !isDate(input.next_date) ||
      !Number.isInteger(input.anchor_day) ||
      input.anchor_day < 1 ||
      input.anchor_day > 31
    )
      throw new Error("Vérifiez la description et la date d’échéance.");
    await mutate(async () => {
      const row: RecurringExpense = {
        ...input,
        id,
        user_id: userId,
        account_id: snapshot.account!.id,
        updated_at: now(),
      };
      const saved = demo
        ? row
        : previous
          ? await updateRow("recurring_expenses", previous, input)
          : await insertRow("recurring_expenses", row);
      if (mounted.current)
        setSnapshot((value) => ({
          ...value,
          recurring: [
            ...value.recurring.filter((item) => item.id !== id),
            saved,
          ],
        }));
    });
  }
  async function confirmRecurring(
    item: RecurringExpense,
    transactionId: string,
  ) {
    if (!item.active || item.next_date > todayISO())
      throw new Error("Cette échéance n’est pas encore à confirmer.");
    await mutate(async () => {
      if (demo) {
        if (
          !snapshot.recurring.some(
            (r) =>
              r.id === item.id && r.next_date === item.next_date && r.active,
          )
        )
          return;
        if (
          snapshot.entries.some(
            (entry) =>
              entry.recurring_id === item.id &&
              entry.occurrence_date === item.next_date,
          )
        )
          return;
        const entry: Entry = {
          id: transactionId,
          user_id: userId!,
          account_id: item.account_id,
          type: "expense",
          amount_cents: item.amount_cents,
          category_id: item.category_id,
          date: item.next_date,
          description: item.description,
          expense_kind: "fixed",
          recurring_id: item.id,
          occurrence_date: item.next_date,
          created_at: now(),
          updated_at: now(),
          deleted_at: null,
        };
        setSnapshot((value) => ({
          ...value,
          entries: [...value.entries, entry],
          recurring: value.recurring.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  next_date: nextMonthlyDate(row.next_date, row.anchor_day),
                  updated_at: now(),
                }
              : row,
          ),
        }));
      } else {
        await confirmRecurringLocal(item, transactionId);
        const next = await loadSnapshot(userId!);
        if (mounted.current) setSnapshot(next);
      }
    });
  }
  async function addCategory(name: string) {
    if (!userId || !name.trim() || name.trim().length > 60)
      throw new Error("Le nom doit contenir de 1 à 60 caractères.");
    if (
      snapshot.categories.some(
        (c) => c.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      )
    )
      throw new Error("Cette catégorie existe déjà.");
    await mutate(async () => {
      const row = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: name.trim(),
        color: "#69834d",
      };
      if (!demo) await insertCategory(row);
      if (mounted.current)
        setSnapshot((value) => ({
          ...value,
          categories: [...value.categories, row],
        }));
    });
  }
  async function runLongTerm(command: LongTermCommand) {
    await mutate(async () => {
      const next = demo
        ? applyLongTermCommand(snapshot, command)
        : await executeLongTerm(command);
      if (mounted.current)
        setSnapshot({
          ...next,
          entries: next.entries.filter((e) => !e.deleted_at),
        });
    });
  }
  return (
    <FinanceContext.Provider
      value={{
        ...snapshot,
        runLongTerm,
        demo,
        base: demo ? "/demo" : "",
        loading,
        syncing,
        busy,
        error,
        refresh,
        saveAccount,
        saveEntry,
        deleteEntry,
        saveBudget,
        saveRecurring,
        confirmRecurring,
        addCategory,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}
export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("FinanceProvider manquant");
  return value;
}

import type { LongTermBudget } from "./longTerm";
export type TransactionType = "income" | "expense";
export type ExpenseKind = "fixed" | "variable";
export interface Account {
  id: string;
  user_id: string;
  name: string;
  currency: "EUR";
  initial_balance_cents: number;
  reference_date: string;
  updated_at: string;
}
export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  color: string;
}
export interface Entry {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount_cents: number;
  category_id: string;
  date: string;
  description: string;
  expense_kind: ExpenseKind;
  recurring_id: string | null;
  occurrence_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface MonthlyBudget {
  id: string;
  user_id: string;
  month: string;
  amount_cents: number;
  category_id: string | null;
  updated_at: string;
}
export interface RecurringExpense {
  id: string;
  user_id: string;
  account_id: string;
  description: string;
  amount_cents: number;
  category_id: string;
  next_date: string;
  anchor_day: number;
  active: boolean;
  updated_at: string;
}
export interface Snapshot {
  longTermBudgets: LongTermBudget[];
  account: Account | null;
  categories: Category[];
  entries: Entry[];
  budgets: MonthlyBudget[];
  recurring: RecurringExpense[];
}
export type EntryInput = Pick<
  Entry,
  | "type"
  | "amount_cents"
  | "category_id"
  | "date"
  | "description"
  | "expense_kind"
>;

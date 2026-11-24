import type { Transaction } from "../types/transaction";
export interface Budget {
  version: 1;
  initialBalance: number;
  initialDate: string;
  transactions: Transaction[];
}
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
// Les additions se font en centimes pour éviter les erreurs de virgule flottante.
export const cents = (value: number) => Math.round(value * 100);
export const validAmount = (value: number) =>
  Number.isFinite(value) &&
  Math.abs(value) <= 1_000_000_000 &&
  Math.abs(value * 100 - cents(value)) < 0.0001;
export function summarize(budget: Budget, date = today()) {
  const transactions = budget.transactions.filter(
    (transaction) =>
      transaction.date >= budget.initialDate && transaction.date <= date,
  );
  const monthly = transactions.filter(
    (transaction) => transaction.date.slice(0, 7) === date.slice(0, 7),
  );
  const total = (items: Transaction[], type: Transaction["type"]) =>
    items
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + cents(item.amount), 0);
  return {
    balance:
      (cents(budget.initialBalance) +
        total(transactions, "income") -
        total(transactions, "expense")) /
      100,
    income: total(monthly, "income") / 100,
    expenses: total(monthly, "expense") / 100,
  };
}
export function parseBudget(value: string): Budget {
  const budget = JSON.parse(value) as Budget;
  if (
    !budget ||
    budget.version !== 1 ||
    !validAmount(budget.initialBalance) ||
    !validDate(budget.initialDate) ||
    !Array.isArray(budget.transactions)
  )
    throw new Error("Budget invalide");
  const ids = new Set<string>();
  for (const transaction of budget.transactions) {
    if (
      !transaction ||
      typeof transaction.id !== "string" ||
      ids.has(transaction.id) ||
      typeof transaction.description !== "string" ||
      transaction.description.length > 200 ||
      typeof transaction.category !== "string" ||
      transaction.category.length > 60 ||
      !validDate(transaction.date) ||
      transaction.date < budget.initialDate ||
      !validAmount(transaction.amount) ||
      transaction.amount <= 0 ||
      !["income", "expense"].includes(transaction.type)
    )
      throw new Error("Transaction invalide");
    ids.add(transaction.id);
  }
  return budget;
}

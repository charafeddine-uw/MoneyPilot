import type { Snapshot } from "../types/finance";
import { todayISO } from "./finance";
export const DEMO_USER = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
export function createDemo(): Snapshot {
  const date = todayISO(),
    month = date.slice(0, 7),
    previous = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      0,
    );
  const reference = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
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
  const fixtures = [
    ["Revenu du mois", 180000, "income", 5],
    ["Loyer", 65000, "expense", 0],
    ["Courses du quotidien", 5250, "expense", 1],
    ["Abonnement transport", 3500, "expense", 2],
    ["Cinéma entre amis", 1250, "expense", 3],
    ["Livres et fournitures", 10000, "expense", 4],
  ] as const;
  return {
    longTermBudgets: [],
    account: {
      id: accountId,
      user_id: DEMO_USER,
      name: "Compte principal",
      currency: "EUR",
      initial_balance_cents: 150000,
      reference_date: reference,
      updated_at: date + "T12:00:00Z",
    },
    categories,
    entries: fixtures.map(([description, amount_cents, type, category], i) => ({
      id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      user_id: DEMO_USER,
      account_id: accountId,
      description,
      amount_cents,
      type,
      category_id: categories[category].id,
      date: i < 2 ? month + "-01" : date,
      expense_kind: i === 1 || i === 3 ? "fixed" : "variable",
      recurring_id: null,
      occurrence_date: null,
      created_at: date + "T12:00:00Z",
      updated_at: date + "T12:00:00Z",
      deleted_at: null,
    })),
    budgets: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        user_id: DEMO_USER,
        month: month + "-01",
        amount_cents: 100000,
        category_id: null,
        updated_at: date + "T12:00:00Z",
      },
    ],
    recurring: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        user_id: DEMO_USER,
        account_id: accountId,
        description: "Abonnement musique (exemple)",
        amount_cents: 1099,
        category_id: categories[3].id,
        next_date: date,
        anchor_day: Number(date.slice(8)),
        active: true,
        updated_at: date + "T12:00:00Z",
      },
    ],
  };
}

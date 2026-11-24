import type { Transaction } from "../types/transaction";
// Exemples statiques uniquement : aucun calcul de solde ni aucune persistance.
export const demoSummary = {
  balance: 2450,
  income: 1800,
  expenses: 850,
  initialBalance: 1500,
};
export const demoTransactions: Transaction[] = [
  {
    id: "1",
    description: "Courses du quotidien",
    category: "Alimentation",
    date: "2026-11-15",
    amount: 52.5,
    type: "expense",
  },
  {
    id: "2",
    description: "Abonnement transport",
    category: "Transport",
    date: "2026-11-12",
    amount: 35,
    type: "expense",
  },
  {
    id: "3",
    description: "Cinéma entre amis",
    category: "Loisirs",
    date: "2026-11-10",
    amount: 12.5,
    type: "expense",
  },
  {
    id: "4",
    description: "Loyer de novembre",
    category: "Logement",
    date: "2026-11-05",
    amount: 650,
    type: "expense",
  },
  {
    id: "5",
    description: "Livres et fournitures",
    category: "Études",
    date: "2026-11-03",
    amount: 100,
    type: "expense",
  },
  {
    id: "6",
    description: "Revenu de novembre",
    category: "Salaire",
    date: "2026-11-01",
    amount: 1800,
    type: "income",
  },
];
export const categories = [
  "Alimentation",
  "Transport",
  "Loisirs",
  "Logement",
  "Études",
  "Salaire",
  "Autre",
];

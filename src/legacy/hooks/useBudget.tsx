import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { parseBudget } from "../lib/budget";
import type { Budget } from "../lib/budget";
const STORAGE_KEY = "moneypilot.budget.v1";
function readBudget(): { budget: Budget | null; error: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return { budget: stored ? parseBudget(stored) : null, error: "" };
  } catch {
    return {
      budget: null,
      error:
        "Le budget local ne peut pas être lu. Les données existantes n’ont pas été modifiées. Vérifiez l’accès au stockage de votre navigateur.",
    };
  }
}
const BudgetContext = createContext<{
  budget: Budget | null;
  storageError: string;
  save: (budget: Budget) => boolean;
} | null>(null);
export function BudgetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readBudget);
  function save(budget: Budget) {
    try {
      parseBudget(JSON.stringify(budget));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
      setState({ budget, error: "" });
      return true;
    } catch {
      setState((previous) => ({
        ...previous,
        error:
          "Enregistrement impossible. Votre budget n’a pas été modifié. Vérifiez l’espace et les autorisations de stockage du navigateur.",
      }));
      return false;
    }
  }
  return (
    <BudgetContext.Provider
      value={{ budget: state.budget, storageError: state.error, save }}
    >
      {children}
    </BudgetContext.Provider>
  );
}
export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("BudgetProvider manquant");
  return context;
}

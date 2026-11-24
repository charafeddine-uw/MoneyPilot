import { validateLongTermBudgets } from "./longTermValidation";
import type { Snapshot, Entry } from "../types/finance";
import type {
  LongTermBudget,
  FundingAllocation,
  SurplusDecision,
  EmergencyDecision,
  FixedMapping,
} from "../types/longTerm";
import {
  calculateLongTerm,
  closeExpiredBudgets,
  fundingAvailable,
  sumCents,
} from "../lib/longTerm";
import { MAX_CENTS, todayISO, validateEntry } from "../lib/finance";
import { transactDocument } from "./localDatabase";
export type LongTermCommand =
  | { type: "create"; budget: LongTermBudget; new_income?: Entry }
  | {
      type: "manual";
      id: string;
      expected: string;
      allocations: Record<string, number> | null;
    }
  | {
      type: "funding";
      id: string;
      expected: string;
      allocation: FundingAllocation | null;
      entry_id: string;
      new_income?: Entry;
    }
  | {
      type: "surplus";
      id: string;
      expected: string;
      decision: SurplusDecision | null;
      month: string;
    }
  | {
      type: "emergency";
      id: string;
      expected: string;
      decision: EmergencyDecision | null;
      entry_id: string;
    }
  | {
      type: "mapping";
      id: string;
      expected: string;
      mapping: FixedMapping | null;
      key: string;
    };
function newIncome(snapshot: Snapshot, entry: Entry | undefined) {
  if (!entry) return;
  validateEntry(entry);
  if (
    entry.type !== "income" ||
    entry.account_id !== snapshot.account?.id ||
    snapshot.entries.some((e) => e.id === entry.id)
  )
    throw new Error(
      "Ce revenu ne peut pas être créé. Vérifiez qu’il n’existe pas déjà.",
    );
  snapshot.entries.push(entry);
}
function checkFunding(
  snapshot: Snapshot,
  budget: LongTermBudget,
  allocation: FundingAllocation,
) {
  const entry = snapshot.entries.find(
    (e) =>
      e.id === allocation.entry_id &&
      !e.deleted_at &&
      e.type === "income" &&
      e.account_id === budget.account_id,
  );
  if (
    !entry ||
    !Number.isSafeInteger(allocation.amount_cents) ||
    allocation.amount_cents <= 0 ||
    allocation.amount_cents >
      fundingAvailable(entry, snapshot.longTermBudgets, budget.id)
  )
    throw new Error(
      "Le montant affecté dépasse le revenu réellement disponible, ou ce revenu n’est plus valide.",
    );
}
export function applyLongTermCommand(
  source: Snapshot,
  command: LongTermCommand,
  asOf = todayISO(),
): Snapshot {
  const snapshot = closeExpiredBudgets(source, asOf);
  if (command.type === "create") {
    if (snapshot.longTermBudgets.some((b) => !b.closing))
      throw new Error(
        "Un budget longue durée est déjà actif. Il sera clôturé après sa date de fin.",
      );
    if (snapshot.longTermBudgets.some((b) => b.id === command.budget.id))
      throw new Error("Ce budget a déjà été enregistré.");
    const budget = structuredClone(command.budget);
    if (budget.closing) throw new Error("Un nouveau budget doit être actif.");
    if (budget.end_date < asOf)
      throw new Error(
        "La date de fin doit être aujourd’hui ou une date future.",
      );
    newIncome(snapshot, command.new_income);
    for (const allocation of budget.funding)
      checkFunding(snapshot, budget, allocation);
    if (budget.payment_status === "received" && !budget.funding.length)
      throw new Error(
        "Pour indiquer « reçu », liez un revenu existant ou créez-en un explicitement.",
      );
    snapshot.longTermBudgets.push(budget);
    snapshot.longTermBudgets = validateLongTermBudgets(
      snapshot.longTermBudgets,
      snapshot,
    );
    return snapshot;
  }
  const budget = snapshot.longTermBudgets.find((b) => b.id === command.id);
  if (!budget || budget.closing)
    throw new Error(
      "Ce budget est clôturé ou introuvable. Les archives sont en lecture seule.",
    );
  if (budget.updated_at !== command.expected)
    throw new Error(
      "Ce budget a changé dans un autre onglet. Actualisez avant de réessayer.",
    );
  if (command.type === "manual") {
    const summary = calculateLongTerm(budget, snapshot, asOf);
    if (
      command.allocations &&
      sumCents(Object.values(command.allocations)) >
        summary.variable_capacity_cents
    )
      throw new Error(
        "La répartition dépasse le montant variable réellement financé.",
      );
    budget.manual_allocations = command.allocations;
  }
  if (command.type === "funding") {
    newIncome(snapshot, command.new_income);
    const entry = snapshot.entries.find(
      (e) => e.id === command.entry_id && !e.deleted_at && e.type === "income",
    );
    if (!entry) throw new Error("Revenu introuvable.");
    if (command.allocation) {
      if (command.allocation.entry_id !== command.entry_id)
        throw new Error("Affectation incohérente.");
      checkFunding(snapshot, budget, command.allocation);
    }
    budget.funding = budget.funding.filter(
      (f) => f.entry_id !== command.entry_id,
    );
    if (command.allocation) budget.funding.push(command.allocation);
    if (sumCents(budget.funding.map((f) => f.amount_cents)) > MAX_CENTS)
      throw new Error("Financement total supérieur à la limite autorisée.");
    budget.income_decisions = budget.income_decisions.filter(
      (d) => d.entry_id !== command.entry_id,
    );
    budget.income_decisions.push({
      entry_id: command.entry_id,
      decision: command.allocation ? "allocated" : "separate",
    });
    budget.payment_status = budget.funding.length ? "received" : "expected";
  }
  if (command.type === "surplus") {
    const without = {
      ...budget,
      surplus_decisions: budget.surplus_decisions.filter(
        (d) => d.month !== command.month,
      ),
    };
    const summary = calculateLongTerm(without, snapshot, asOf);
    const month = summary.months.find((m) => m.month === command.month);
    if (!month || month.status !== "closed")
      throw new Error(
        "Le choix du surplus est disponible après la fin du mois.",
      );
    if (
      command.decision &&
      (command.decision.month !== command.month ||
        command.decision.next_cents + command.decision.reserve_cents >
          month.remaining_cents ||
        (command.decision.next_cents &&
          !summary.months.some((m) => m.month > month.month)))
    )
      throw new Error(
        "Ce choix dépasse le surplus disponible ou aucun mois suivant n’est couvert.",
      );
    budget.surplus_decisions = without.surplus_decisions;
    if (command.decision) budget.surplus_decisions.push(command.decision);
  }
  if (command.type === "emergency") {
    const entry = snapshot.entries.find(
      (e) =>
        e.id === command.entry_id &&
        !e.deleted_at &&
        e.type === "expense" &&
        e.account_id === budget.account_id &&
        e.date >= budget.start_date &&
        e.date <= budget.end_date,
    );
    if (!entry)
      throw new Error(
        "Choisissez une dépense existante comprise dans la période.",
      );
    const without = {
      ...budget,
      emergencies: budget.emergencies.filter(
        (d) => d.entry_id !== command.entry_id,
      ),
    };
    const summary = calculateLongTerm(without, snapshot, asOf);
    if (command.decision) {
      if (summary.fixed_occurrences.some((o) => o.entry_id === entry.id))
        throw new Error(
          "Cette dépense est déjà rapprochée d’une charge réservée. Retirez le rapprochement ou utilisez une dépense imprévue distincte.",
        );
      if (
        command.decision.entry_id !== entry.id ||
        command.decision.reserve_cents + command.decision.future_cents !==
          entry.amount_cents ||
        command.decision.reserve_cents > summary.reserve_remaining_cents
      )
        throw new Error(
          "Répartissez exactement le montant de la dépense sans dépasser la réserve disponible.",
        );
    }
    budget.emergencies = without.emergencies;
    if (command.decision) budget.emergencies.push(command.decision);
  }
  if (command.type === "mapping") {
    const [recurringId, date] = command.key.split(":");
    const summary = calculateLongTerm(budget, snapshot, asOf);
    if (!summary.fixed_occurrences.some((o) => o.key === command.key))
      throw new Error("Échéance inconnue.");
    budget.fixed_mappings = budget.fixed_mappings.filter(
      (m) => !(m.recurring_id === recurringId && m.occurrence_date === date),
    );
    if (command.mapping) {
      const entry = snapshot.entries.find(
        (e) =>
          e.id === command.mapping!.entry_id &&
          !e.deleted_at &&
          e.type === "expense" &&
          e.expense_kind === "fixed" &&
          e.account_id === budget.account_id &&
          e.date >= budget.start_date &&
          e.date <= budget.end_date,
      );
      if (
        !entry ||
        command.mapping.recurring_id !== recurringId ||
        command.mapping.occurrence_date !== date ||
        budget.fixed_mappings.some((m) => m.entry_id === entry.id) ||
        summary.fixed_occurrences.some(
          (o) => o.key !== command.key && o.entry_id === entry.id,
        )
      )
        throw new Error(
          "Choisissez une dépense fixe existante non rapprochée d’une autre échéance.",
        );
      budget.fixed_mappings.push(command.mapping);
    }
  }
  budget.updated_at = new Date(
    Math.max(Date.now(), Date.parse(budget.updated_at) + 1),
  ).toISOString();
  snapshot.longTermBudgets = validateLongTermBudgets(
    snapshot.longTermBudgets,
    snapshot,
  );
  return snapshot;
}
export async function executeLongTerm(command: LongTermCommand) {
  const document = await transactDocument((d) => ({
    ...d,
    snapshot: applyLongTermCommand(d.snapshot, command),
  }));
  return document.snapshot;
}

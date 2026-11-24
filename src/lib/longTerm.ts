import type { Entry, Snapshot, RecurringExpense } from "../types/finance";
import type {
  LongTermBudget,
  FundingAllocation,
  LongTermSummary,
  LongTermMonth,
  RecurringPlan,
  FixedOccurrence,
} from "../types/longTerm";
import { nextMonthlyDate, todayISO, money } from "./finance";
const DAY = 86400000;
const utc = (date: string) => Date.parse(date + "T00:00:00Z");
export const calendarDays = (start: string, end: string) =>
  Math.round((utc(end) - utc(start)) / DAY) + 1;
const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);
export function sumCents(values: number[]) {
  const value = values.reduce((sum, n) => sum + BigInt(n), 0n);
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Total du budget hors précision autorisée.");
  return number;
}
// Plus forts restes, calculs entiers ; l’ordre des mois départage les égalités.
export function proportionalCents(total: number, weights: number[]): number[] {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0)
  )
    throw new Error("Répartition invalide.");
  const denominator = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (!denominator) return weights.map(() => 0);
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return {
      index,
      value: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let remainder = total - sumCents(parts.map((p) => p.value));
  for (const part of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (!remainder) break;
    parts[part.index].value++;
    remainder--;
  }
  return parts.map((p) => p.value);
}
export function coveredMonths(start: string, end: string) {
  const months: { month: string; start: string; end: string; days: number }[] =
    [];
  let first = start.slice(0, 7) + "-01";
  while (first <= end) {
    const next = nextMonthlyDate(first, 1);
    const last = new Date(utc(next) - DAY).toISOString().slice(0, 10);
    const from = maxDate(start, first),
      to = minDate(end, last);
    months.push({
      month: first.slice(0, 7),
      start: from,
      end: to,
      days: calendarDays(from, to),
    });
    first = next;
  }
  return months;
}
export function makeRecurringPlan(
  item: RecurringExpense,
  start: string,
): RecurringPlan {
  const [year, month] = start.split("-").map(Number);
  const day = Math.min(
    item.anchor_day,
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  );
  let first = `${start.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  if (first < start) first = nextMonthlyDate(first, item.anchor_day);
  return {
    recurring_id: item.id,
    description: item.description,
    amount_cents: item.amount_cents,
    anchor_day: item.anchor_day,
    first_date: first,
  };
}
export function fundingAvailable(
  entry: Entry,
  budgets: LongTermBudget[],
  exceptId?: string,
) {
  const reserved = sumCents(
    budgets
      .filter((b) => b.id !== exceptId)
      .flatMap((b) =>
        (b.closing?.funding ?? b.funding)
          .filter((f) => f.entry_id === entry.id)
          .map((f) => f.amount_cents),
      ),
  );
  return Math.max(0, entry.amount_cents - reserved);
}
// Une modification du revenu ne bloque jamais sa saisie ; le financement effectif est plafonné et signalé.
export function effectiveFunding(
  budget: LongTermBudget,
  entries: Entry[],
  budgets: LongTermBudget[],
): FundingAllocation[] {
  return budget.funding.map((allocation) => {
    const entry = entries.find(
      (e) =>
        e.id === allocation.entry_id &&
        !e.deleted_at &&
        e.type === "income" &&
        e.account_id === budget.account_id,
    );
    if (!entry) return { ...allocation, amount_cents: 0 };
    const sorted = [...budgets].sort(
      (a, b) =>
        Number(Boolean(b.closing)) - Number(Boolean(a.closing)) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
    const index = sorted.findIndex((b) => b.id === budget.id);
    const previous = index < 0 ? [] : sorted.slice(0, index);
    const reserved = sumCents(
      previous.flatMap((b) =>
        (b.closing?.funding ?? b.funding)
          .filter((f) => f.entry_id === entry.id)
          .map((f) => f.amount_cents),
      ),
    );
    return {
      ...allocation,
      amount_cents: Math.min(
        allocation.amount_cents,
        Math.max(0, entry.amount_cents - reserved),
      ),
    };
  });
}
export function calculateLongTerm(
  budget: LongTermBudget,
  snapshot: Pick<Snapshot, "entries" | "longTermBudgets">,
  asOf = todayISO(),
): LongTermSummary {
  const closed = budget.closing;
  const date = closed
    ? new Date(utc(budget.end_date) + DAY).toISOString().slice(0, 10)
    : asOf;
  const entries = closed ? closed.entries : snapshot.entries;
  const funding = closed
    ? closed.funding
    : effectiveFunding(budget, entries, snapshot.longTermBudgets ?? [budget]);
  const totalFunding = sumCents(funding.map((f) => f.amount_cents));
  const warnings: string[] = [];
  if (
    !closed &&
    funding.some((f, i) => f.amount_cents !== budget.funding[i].amount_cents)
  )
    warnings.push(
      "Un revenu affecté a été modifié, supprimé ou reclassé : le financement disponible a été réduit. Vérifiez son affectation.",
    );
  const actual = entries.filter(
    (e) =>
      !e.deleted_at &&
      e.account_id === budget.account_id &&
      e.type === "expense" &&
      e.date >= budget.start_date &&
      e.date <= budget.end_date &&
      e.date <= date,
  );
  const occurrences: FixedOccurrence[] = [];
  const matched = new Set<string>();
  for (const plan of budget.recurring_plans) {
    let occurrence = plan.first_date;
    while (occurrence <= budget.end_date) {
      if (occurrence >= budget.start_date) {
        const explicit = budget.fixed_mappings.find(
          (m) =>
            m.recurring_id === plan.recurring_id &&
            m.occurrence_date === occurrence,
        );
        const entry = actual.find(
          (e) =>
            !matched.has(e.id) &&
            e.expense_kind === "fixed" &&
            (explicit
              ? e.id === explicit.entry_id
              : e.recurring_id === plan.recurring_id &&
                e.occurrence_date === occurrence),
        );
        if (entry) matched.add(entry.id);
        occurrences.push({
          key: plan.recurring_id + ":" + occurrence,
          recurring_id: plan.recurring_id,
          date: occurrence,
          description: plan.description,
          forecast_cents: plan.amount_cents,
          actual_cents: entry?.amount_cents ?? null,
          entry_id: entry?.id ?? null,
        });
      }
      occurrence = nextMonthlyDate(occurrence, plan.anchor_day);
    }
  }
  if (budget.fixed_mappings.some((m) => !matched.has(m.entry_id)))
    warnings.push(
      "Un rapprochement fixe ne correspond plus à une dépense fixe de la période. La prévision est conservée ; vérifiez le lien.",
    );
  const validEmergencies = budget.emergencies.filter(
    (d) => actual.some((e) => e.id === d.entry_id) && !matched.has(d.entry_id),
  );
  if (validEmergencies.length !== budget.emergencies.length)
    warnings.push(
      "Un imprévu n’est plus applicable (dépense supprimée, déplacée ou rapprochée d’une charge fixe). La décision est conservée mais ignorée.",
    );
  const emergencyIds = new Set(validEmergencies.map((e) => e.entry_id));
  const variable = actual.filter(
    (e) =>
      !matched.has(e.id) &&
      (e.expense_kind === "variable" || emergencyIds.has(e.id)),
  );
  const fixed = sumCents([
    ...occurrences.map((o) => o.actual_cents ?? o.forecast_cents),
    ...actual
      .filter(
        (e) =>
          e.expense_kind === "fixed" &&
          !matched.has(e.id) &&
          !emergencyIds.has(e.id),
      )
      .map((e) => e.amount_cents),
  ]);
  const rawVariable = totalFunding - fixed - budget.initial_reserve_cents;
  const capacity = Math.max(0, rawVariable);
  const covered = coveredMonths(budget.start_date, budget.end_date);
  const forecastRaw =
    Math.max(budget.expected_amount_cents, totalFunding) -
    fixed -
    budget.initial_reserve_cents;
  const forecast = proportionalCents(
    Math.max(0, forecastRaw),
    covered.map((m) => m.days),
  );
  const recommended = proportionalCents(
    capacity,
    covered.map((m) => m.days),
  );
  const requested = budget.manual_allocations
    ? covered.map((m) => budget.manual_allocations![m.month] ?? 0)
    : recommended;
  const requestedTotal = sumCents(requested);
  const baseline =
    requestedTotal > capacity
      ? proportionalCents(capacity, requested)
      : requested;
  if (requestedTotal > capacity)
    warnings.push(
      "Le financement ou les charges ont changé : vos montants personnalisés sont conservés. Une réduction proportionnelle provisoire est affichée ; vérifiez la répartition.",
    );
  const months: LongTermMonth[] = covered.map((m, i) => ({
    ...m,
    forecast_cents: forecast[i],
    recommended_cents: recommended[i],
    planned_cents: requested[i],
    allocation_cents: baseline[i],
    adjustment_cents: 0,
    actual_spending_cents: 0,
    charged_spending_cents: 0,
    remaining_cents: 0,
    overspending_cents: 0,
    pending_cents: 0,
    status: m.end < date ? "closed" : m.start > date ? "future" : "current",
  }));
  let reserve = Math.min(
      budget.initial_reserve_cents,
      Math.max(0, totalFunding - fixed),
    ),
    reserveUsed = 0,
    reserveAdded = 0,
    uncovered = 0;
  function takeFuture(index: number, amount: number) {
    const future = months.slice(index + 1);
    const available = sumCents(future.map((m) => m.allocation_cents));
    const covered = Math.min(amount, available);
    const reduction = proportionalCents(
      covered,
      future.map((m) => m.allocation_cents),
    );
    future.forEach((m, i) => (m.allocation_cents -= reduction[i]));
    months[index].allocation_cents += covered;
    return amount - covered;
  }
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    const transactions = variable
      .filter((e) => e.date.slice(0, 7) === month.month)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    month.actual_spending_cents = sumCents(
      transactions.map((e) => e.amount_cents),
    );
    let usedThisMonth = 0;
    for (const entry of transactions) {
      const decision = validEmergencies.find((d) => d.entry_id === entry.id);
      if (!decision) continue;
      const requestedReserve = Math.min(
        entry.amount_cents,
        decision.reserve_cents,
      );
      const used = Math.min(requestedReserve, reserve);
      reserve -= used;
      reserveUsed += used;
      usedThisMonth += used;
      if (
        used < decision.reserve_cents ||
        decision.reserve_cents + decision.future_cents > entry.amount_cents
      )
        warnings.push(
          "Une décision d’imprévu doit être revue : montant modifié ou réserve devenue insuffisante. Seule la part disponible est appliquée.",
        );
      const future = Math.min(
        decision.future_cents,
        Math.max(0, entry.amount_cents - used),
      );
      const shortfall = takeFuture(index, future);
      if (shortfall)
        warnings.push(
          `Redistribution de l’imprévu du ${entry.date} : les mois futurs ne couvrent pas ${money(shortfall)}.`,
        );
    }
    month.charged_spending_cents = month.actual_spending_cents - usedThisMonth;
    month.overspending_cents = Math.max(
      0,
      month.charged_spending_cents - month.allocation_cents,
    );
    if (month.overspending_cents) {
      const shortfall = takeFuture(index, month.overspending_cents);
      uncovered += shortfall;
    }
    month.remaining_cents =
      month.allocation_cents - month.charged_spending_cents;
    if (month.status === "closed" && month.remaining_cents > 0) {
      const surplus = budget.surplus_decisions.find(
        (d) => d.month === month.month,
      );
      const total = surplus ? surplus.next_cents + surplus.reserve_cents : 0;
      if (
        surplus &&
        total <= month.remaining_cents &&
        (!surplus.next_cents || months[index + 1])
      ) {
        month.allocation_cents -= total;
        month.remaining_cents -= total;
        reserve += surplus.reserve_cents;
        reserveAdded += surplus.reserve_cents;
        if (months[index + 1])
          months[index + 1].allocation_cents += surplus.next_cents;
      } else if (surplus)
        warnings.push(
          `La décision de surplus de ${month.month} n’est plus possible. Le surplus reste en attente de votre choix.`,
        );
      month.pending_cents = Math.max(0, month.remaining_cents);
    } else if (
      month.status === "closed" &&
      budget.surplus_decisions.some((d) => d.month === month.month)
    )
      warnings.push(
        `Le surplus de ${month.month} a disparu après modification des opérations. La décision est suspendue.`,
      );
    month.adjustment_cents = month.allocation_cents - month.planned_cents;
  }
  // Les crédits de surplus peuvent modifier un mois futur après son initialisation.
  for (const month of months) {
    month.remaining_cents =
      month.allocation_cents - month.charged_spending_cents;
    month.adjustment_cents = month.allocation_cents - month.planned_cents;
  }
  const current = months.find((m) => m.status === "current") ?? null;
  const daysRemaining = current
    ? calendarDays(maxDate(date, current.start), current.end)
    : 0;
  const consumed = current ? Math.max(0, current.charged_spending_cents) : 0;
  const elapsed = current
    ? calendarDays(current.start, minDate(date, current.end))
    : 0;
  const variableSpent = sumCents(variable.map((e) => e.amount_cents));
  const deficit = Math.max(
    0,
    -rawVariable,
    fixed +
      variableSpent +
      Math.max(0, budget.initial_reserve_cents + reserveAdded - reserveUsed) -
      totalFunding,
  );
  return {
    expected_cents: budget.expected_amount_cents,
    funding_cents: totalFunding,
    fixed_cents: fixed,
    raw_variable_cents: rawVariable,
    forecast_variable_cents:
      Math.max(budget.expected_amount_cents, totalFunding) -
      fixed -
      budget.initial_reserve_cents,
    variable_capacity_cents: capacity,
    variable_spent_cents: variableSpent,
    reserve_remaining_cents: reserve,
    reserve_used_cents: reserveUsed,
    reserve_added_cents: reserveAdded,
    future_cents: sumCents(
      months
        .filter((m) => m.status === "future")
        .map((m) => m.allocation_cents),
    ),
    unallocated_cents: Math.max(0, capacity - sumCents(baseline)),
    pending_cents: sumCents(months.map((m) => m.pending_cents)),
    uncovered_cents: uncovered,
    deficit_cents: deficit,
    current,
    daily_guideline_cents: daysRemaining
      ? Math.floor(Math.max(0, current!.remaining_cents) / daysRemaining)
      : 0,
    elapsed_percent: current ? Math.round((100 * elapsed) / current.days) : 0,
    consumed_percent: current?.allocation_cents
      ? Math.round((100 * consumed) / current.allocation_cents)
      : consumed
        ? 100
        : 0,
    pace_warning:
      !!current &&
      current.allocation_cents > 0 &&
      BigInt(consumed) * BigInt(current.days) >
        BigInt(current.allocation_cents) * BigInt(elapsed),
    months,
    fixed_occurrences: occurrences,
    warnings: [...new Set(warnings)],
  };
}
export function closeExpiredBudgets(
  snapshot: Snapshot,
  asOf = todayISO(),
  timestamp = new Date().toISOString(),
): Snapshot {
  const next = structuredClone(snapshot);
  for (const budget of next.longTermBudgets ?? []) {
    if (budget.closing || budget.end_date >= asOf) continue;
    const summary = calculateLongTerm(
      budget,
      next,
      new Date(utc(budget.end_date) + DAY).toISOString().slice(0, 10),
    );
    const funding = effectiveFunding(
      budget,
      next.entries,
      next.longTermBudgets,
    );
    const relevant = next.entries.filter(
      (e) =>
        e.account_id === budget.account_id &&
        ((e.date >= budget.start_date && e.date <= budget.end_date) ||
          funding.some((f) => f.entry_id === e.id)),
    );
    budget.closing = {
      closed_at: timestamp,
      entries: structuredClone(relevant),
      funding,
      totals: {
        funding_cents: summary.funding_cents,
        fixed_cents: summary.fixed_cents,
        variable_spent_cents: summary.variable_spent_cents,
        reserve_remaining_cents: summary.reserve_remaining_cents,
        deficit_cents: summary.deficit_cents,
      },
    };
    budget.updated_at = timestamp;
  }
  return next;
}

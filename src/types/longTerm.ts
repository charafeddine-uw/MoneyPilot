import type { Entry } from "./finance";
export interface FundingAllocation {
  entry_id: string;
  amount_cents: number;
}
export interface RecurringPlan {
  recurring_id: string;
  description: string;
  amount_cents: number;
  anchor_day: number;
  first_date: string;
}
export interface FixedMapping {
  entry_id: string;
  recurring_id: string;
  occurrence_date: string;
}
export interface SurplusDecision {
  month: string;
  next_cents: number;
  reserve_cents: number;
}
export interface EmergencyDecision {
  entry_id: string;
  reserve_cents: number;
  future_cents: number;
}
export interface ClosingTotals {
  funding_cents: number;
  fixed_cents: number;
  variable_spent_cents: number;
  reserve_remaining_cents: number;
  deficit_cents: number;
}
export interface LongTermBudget {
  id: string;
  account_id: string;
  name: string;
  expected_amount_cents: number;
  start_date: string;
  end_date: string;
  payment_status: "expected" | "received";
  initial_reserve_cents: number;
  recurring_plans: RecurringPlan[];
  funding: FundingAllocation[];
  income_decisions: { entry_id: string; decision: "allocated" | "separate" }[];
  manual_allocations: Record<string, number> | null;
  fixed_mappings: FixedMapping[];
  surplus_decisions: SurplusDecision[];
  emergencies: EmergencyDecision[];
  created_at: string;
  updated_at: string;
  closing: {
    closed_at: string;
    entries: Entry[];
    funding: FundingAllocation[];
    totals: ClosingTotals;
  } | null;
}
export interface LongTermMonth {
  month: string;
  start: string;
  end: string;
  days: number;
  forecast_cents: number;
  recommended_cents: number;
  planned_cents: number;
  allocation_cents: number;
  adjustment_cents: number;
  actual_spending_cents: number;
  charged_spending_cents: number;
  remaining_cents: number;
  overspending_cents: number;
  pending_cents: number;
  status: "future" | "current" | "closed";
}
export interface FixedOccurrence {
  key: string;
  recurring_id: string;
  date: string;
  description: string;
  forecast_cents: number;
  actual_cents: number | null;
  entry_id: string | null;
}
export interface LongTermSummary extends ClosingTotals {
  expected_cents: number;
  raw_variable_cents: number;
  forecast_variable_cents: number;
  variable_capacity_cents: number;
  reserve_used_cents: number;
  reserve_added_cents: number;
  future_cents: number;
  unallocated_cents: number;
  pending_cents: number;
  uncovered_cents: number;
  current: LongTermMonth | null;
  daily_guideline_cents: number;
  pace_warning: boolean;
  elapsed_percent: number;
  consumed_percent: number;
  months: LongTermMonth[];
  fixed_occurrences: FixedOccurrence[];
  warnings: string[];
}

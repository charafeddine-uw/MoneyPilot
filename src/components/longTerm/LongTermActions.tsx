import { safeSubmit } from "./form";
import { useState } from "react";
import { Link } from "react-router";
import { useFinance } from "../../providers/FinanceProvider";
import { money, centsInput, parseCents, monthLabel } from "../../lib/finance";
import { fundingAvailable, sumCents } from "../../lib/longTerm";
import type { LongTermBudget, LongTermSummary } from "../../types/longTerm";
import type { LongTermCommand } from "../../services/longTermRepository";
type Props = {
  budget: LongTermBudget;
  summary: LongTermSummary;
  onSave: (command: LongTermCommand) => Promise<void>;
  onError: (error: unknown) => void;
};
export function ManualAllocations({ budget, summary, onSave, onError }: Props) {
  const { busy } = useFinance();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      summary.months.map((m) => [
        m.month,
        centsInput(budget.manual_allocations?.[m.month] ?? m.recommended_cents),
      ]),
    ),
  );
  let total: number | null = null;
  try {
    total = sumCents(Object.values(values).map((value) => parseCents(value)));
  } catch {
    /* Saisie intermédiaire, validée au submit. */
  }
  return (
    <details className="panel form-panel long-term-section">
      <summary>Personnaliser la répartition mensuelle</summary>
      <p className="muted">
        Seul l’argent réellement reçu peut être réparti. Les montants non
        affectés restent à part. Les dépassements et décisions sont ensuite
        appliqués sans modifier votre répartition enregistrée.
      </p>
      <form
        onSubmit={safeSubmit(onError, async (e) => {
          e.preventDefault();
          if (busy) return;
          const allocations = Object.fromEntries(
            Object.entries(values).map(([month, value]) => [
              month,
              parseCents(value),
            ]),
          );
          await onSave({
            type: "manual",
            id: budget.id,
            expected: budget.updated_at,
            allocations,
          });
        })}
      >
        <fieldset disabled={busy}>
          <div className="long-term-fields">
            {summary.months.map((m) => (
              <div key={m.month}>
                <label htmlFor={"lt-manual-" + m.month}>
                  {monthLabel(m.month)} (€)
                </label>
                <input
                  id={"lt-manual-" + m.month}
                  inputMode="decimal"
                  required
                  maxLength={14}
                  value={values[m.month] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [m.month]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <p
            className={
              total !== null && total > summary.variable_capacity_cents
                ? "negative"
                : "muted"
            }
          >
            Total saisi :{" "}
            {total === null ? "montant à compléter" : money(total)} · disponible
            : {money(summary.variable_capacity_cents)} · non affecté :{" "}
            {total === null
              ? "—"
              : money(summary.variable_capacity_cents - total)}
          </p>
          <div className="action-row">
            <button
              className="button primary"
              disabled={
                busy ||
                total === null ||
                total > summary.variable_capacity_cents
              }
            >
              Enregistrer la répartition
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void onSave({
                  type: "manual",
                  id: budget.id,
                  expected: budget.updated_at,
                  allocations: null,
                })
              }
            >
              Rétablir la répartition recommandée
            </button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
export function FundingForm({ budget, onSave, onError }: Props) {
  const { entries, longTermBudgets, busy, base } = useFinance();
  const incomes = entries.filter(
    (e) =>
      e.type === "income" &&
      !e.deleted_at &&
      e.account_id === budget.account_id,
  );
  const [selected, setSelected] = useState(""),
    [amount, setAmount] = useState("");
  const pending = incomes.filter(
    (e) =>
      e.date >= budget.start_date &&
      e.date <= budget.end_date &&
      !budget.income_decisions.some((d) => d.entry_id === e.id),
  );
  const source = incomes.find((e) => e.id === selected);
  return (
    <section className="panel form-panel long-term-section">
      <h2>Financement reçu</h2>
      <p>
        Un revenu supplémentaire reste séparé tant que vous n’en affectez pas
        une part à ce budget.
      </p>
      {pending.length > 0 && (
        <p className="feedback info">
          {pending.length} revenu(s) de la période sans choix d’affectation.
          Vous pouvez les garder séparés ; cette option ne sera plus proposée
          pour ces revenus.
        </p>
      )}
      <form
        onSubmit={safeSubmit(onError, async (e) => {
          e.preventDefault();
          if (busy || !source) return;
          await onSave({
            type: "funding",
            id: budget.id,
            expected: budget.updated_at,
            entry_id: source.id,
            allocation: {
              entry_id: source.id,
              amount_cents: parseCents(amount),
            },
          });
        })}
      >
        <fieldset disabled={busy}>
          <label htmlFor="lt-funding-income">
            Revenu à affecter ou à garder séparé
          </label>
          <select
            id="lt-funding-income"
            required
            value={selected}
            onChange={(e) => {
              const id = e.target.value;
              setSelected(id);
              const existing = budget.funding.find((f) => f.entry_id === id);
              setAmount(existing ? centsInput(existing.amount_cents) : "");
            }}
          >
            <option value="" disabled>
              Choisir un revenu existant
            </option>
            {incomes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.description || "Revenu"} · {e.date} · {money(e.amount_cents)}
                {budget.income_decisions.some((d) => d.entry_id === e.id)
                  ? " · choix enregistré"
                  : " · choix à faire"}
              </option>
            ))}
          </select>
          {source && (
            <p className="field-help">
              Affectable à ce budget :{" "}
              {money(fundingAvailable(source, longTermBudgets, budget.id))}.
              Part demandée enregistrée :{" "}
              {money(
                budget.funding.find((f) => f.entry_id === source.id)
                  ?.amount_cents ?? 0,
              )}
              .
            </p>
          )}
          <label htmlFor="lt-funding-amount">Part à affecter (€)</label>
          <input
            id="lt-funding-amount"
            inputMode="decimal"
            required
            maxLength={14}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="action-row">
            <button className="button primary" disabled={busy || !source}>
              Affecter cette part du revenu
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy || !source}
              onClick={() =>
                source &&
                void onSave({
                  type: "funding",
                  id: budget.id,
                  expected: budget.updated_at,
                  entry_id: source.id,
                  allocation: null,
                })
              }
            >
              Garder ce revenu séparé
            </button>
          </div>
        </fieldset>
      </form>
      <Link className="text-link form-cancel" to={base + "/add"}>
        Enregistrer un nouveau revenu dans le compte, puis revenir l’affecter →
      </Link>
    </section>
  );
}
export function SurplusForms({ budget, summary, onSave, onError }: Props) {
  const { busy } = useFinance();
  const candidates = summary.months.filter(
    (m) =>
      m.status === "closed" &&
      (m.pending_cents > 0 ||
        budget.surplus_decisions.some((d) => d.month === m.month)),
  );
  return (
    <details className="panel form-panel long-term-section">
      <summary>Décider des surplus des mois terminés</summary>
      <p>
        Sans choix explicite, un surplus reste en attente et n’augmente pas les
        montants disponibles des mois futurs. Une décision peut être modifiée ou
        annulée.
      </p>
      {!candidates.length && (
        <p className="muted">
          Aucun surplus mensuel en attente pour le moment.
        </p>
      )}
      {candidates.map((m) => {
        const existing = budget.surplus_decisions.find(
          (d) => d.month === m.month,
        );
        return (
          <form
            className="long-term-inset"
            key={m.month + JSON.stringify(existing)}
            onSubmit={safeSubmit(onError, async (e) => {
              e.preventDefault();
              if (busy) return;
              const d = new FormData(e.currentTarget);
              await onSave({
                type: "surplus",
                id: budget.id,
                expected: budget.updated_at,
                month: m.month,
                decision: {
                  month: m.month,
                  next_cents: parseCents(String(d.get("next") ?? "0")),
                  reserve_cents: parseCents(String(d.get("reserve"))),
                },
              });
            })}
          >
            <fieldset disabled={busy}>
              <h3>{monthLabel(m.month)}</h3>
              <p>
                En attente actuellement : {money(m.pending_cents)}. Pour
                modifier un choix existant, son montant précédent est réintégré
                au surplus lors de la validation.
              </p>
              <label htmlFor={"lt-next-" + m.month}>
                Vers le mois suivant (€)
              </label>
              <input
                id={"lt-next-" + m.month}
                name="next"
                inputMode="decimal"
                maxLength={14}
                required
                defaultValue={centsInput(existing?.next_cents ?? 0)}
                disabled={busy || m.month === summary.months.at(-1)?.month}
              />
              <label htmlFor={"lt-reserve-" + m.month}>
                Vers la réserve de sécurité (€)
              </label>
              <input
                id={"lt-reserve-" + m.month}
                name="reserve"
                inputMode="decimal"
                maxLength={14}
                required
                defaultValue={centsInput(existing?.reserve_cents ?? 0)}
              />
              <div className="action-row">
                <button className="button primary" disabled={busy}>
                  Enregistrer le choix du surplus
                </button>
                {existing && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void onSave({
                        type: "surplus",
                        id: budget.id,
                        expected: budget.updated_at,
                        month: m.month,
                        decision: null,
                      })
                    }
                  >
                    Remettre le surplus en attente
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        );
      })}
    </details>
  );
}
export function EmergencyForm({ budget, summary, onSave, onError }: Props) {
  const { entries, busy } = useFinance();
  const [selected, setSelected] = useState(""),
    [reserve, setReserve] = useState("0,00");
  const expenses = entries.filter(
    (e) =>
      e.type === "expense" &&
      !e.deleted_at &&
      e.account_id === budget.account_id &&
      e.date >= budget.start_date &&
      e.date <= budget.end_date &&
      !summary.fixed_occurrences.some((o) => o.entry_id === e.id),
  );
  const entry = expenses.find((e) => e.id === selected);
  let future: number | null = null;
  try {
    if (entry) future = entry.amount_cents - parseCents(reserve);
  } catch {
    /* Saisie en cours. */
  }
  return (
    <details className="panel form-panel long-term-section">
      <summary>Gérer une dépense imprévue</summary>
      <p>
        Choisissez une dépense déjà enregistrée. La décision utilise la réserve,
        les mois futurs, ou les deux ; elle ne crée pas de seconde dépense.
      </p>
      <p className="muted">
        Les paiements déjà rapprochés d’une charge fixe réservée ne sont pas
        proposés ici.
      </p>
      <form
        onSubmit={safeSubmit(onError, async (e) => {
          e.preventDefault();
          if (busy || !entry || future === null) return;
          await onSave({
            type: "emergency",
            id: budget.id,
            expected: budget.updated_at,
            entry_id: entry.id,
            decision: {
              entry_id: entry.id,
              reserve_cents: parseCents(reserve),
              future_cents: future,
            },
          });
        })}
      >
        <fieldset disabled={busy}>
          <label htmlFor="lt-emergency-entry">Dépense imprévue existante</label>
          <select
            id="lt-emergency-entry"
            value={selected}
            required
            onChange={(e) => {
              const id = e.target.value;
              setSelected(id);
              setReserve(
                centsInput(
                  budget.emergencies.find((d) => d.entry_id === id)
                    ?.reserve_cents ?? 0,
                ),
              );
            }}
          >
            <option value="" disabled>
              Choisir une dépense
            </option>
            {expenses.map((e) => (
              <option key={e.id} value={e.id}>
                {e.description || "Dépense"} · {e.date} ·{" "}
                {money(e.amount_cents)}
              </option>
            ))}
          </select>
          <label htmlFor="lt-emergency-reserve">
            Part à prendre sur la réserve (€)
          </label>
          <input
            id="lt-emergency-reserve"
            inputMode="decimal"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            required
            maxLength={14}
          />
          <p>
            Réserve restante actuelle : {money(summary.reserve_remaining_cents)}
            . Le reste sera pris proportionnellement sur les mois suivant la
            dépense : {future === null ? "—" : money(future)}.
          </p>
          <div className="action-row">
            <button
              className="button primary"
              disabled={busy || !entry || future === null || future < 0}
            >
              Appliquer à cet imprévu
            </button>
            {entry &&
              budget.emergencies.some((d) => d.entry_id === entry.id) && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void onSave({
                      type: "emergency",
                      id: budget.id,
                      expected: budget.updated_at,
                      entry_id: entry.id,
                      decision: null,
                    })
                  }
                >
                  Annuler la décision d’imprévu
                </button>
              )}
          </div>
        </fieldset>
      </form>
    </details>
  );
}
export function FixedReconciliation({ budget, summary, onSave }: Props) {
  const { entries, busy } = useFinance();
  const fixed = entries.filter(
    (e) =>
      e.type === "expense" &&
      e.expense_kind === "fixed" &&
      !e.deleted_at &&
      e.account_id === budget.account_id &&
      e.date >= budget.start_date &&
      e.date <= budget.end_date,
  );
  return (
    <details className="panel form-panel long-term-section">
      <summary>Charges fixes : prévisions et paiements</summary>
      <p>
        Le lien est automatique uniquement pour une récurrence et son échéance
        identifiées. Pour un paiement saisi manuellement, choisissez
        explicitement l’opération correspondante. Les autres dépenses fixes
        réelles sont aussi déduites du financement.
      </p>
      {!summary.fixed_occurrences.length && (
        <p className="muted">
          Aucune charge récurrente sélectionnée dans ce budget.
        </p>
      )}
      <div className="long-term-fixed-list">
        {summary.fixed_occurrences.map((o) => (
          <div className="long-term-inset" key={o.key}>
            <strong>
              {o.description} · {o.date}
            </strong>
            <p>
              Prévu : {money(o.forecast_cents)} ·{" "}
              {o.actual_cents === null
                ? "Paiement non rapproché"
                : `Réel : ${money(o.actual_cents)} · écart ${money(o.actual_cents - o.forecast_cents)}`}
            </p>
            <label htmlFor={"lt-match-" + o.key}>
              Paiement associé à {o.description} du {o.date}
            </label>
            <select
              id={"lt-match-" + o.key}
              value={
                budget.fixed_mappings.find(
                  (m) =>
                    m.recurring_id === o.recurring_id &&
                    m.occurrence_date === o.date,
                )?.entry_id ?? ""
              }
              disabled={busy}
              onChange={(e) =>
                void onSave({
                  type: "mapping",
                  id: budget.id,
                  expected: budget.updated_at,
                  key: o.key,
                  mapping: e.target.value
                    ? {
                        entry_id: e.target.value,
                        recurring_id: o.recurring_id,
                        occurrence_date: o.date,
                      }
                    : null,
                })
              }
            >
              <option value="">Rapprochement automatique par récurrence</option>
              {fixed
                .filter(
                  (e) =>
                    !summary.fixed_occurrences.some(
                      (other) => other.key !== o.key && other.entry_id === e.id,
                    ),
                )
                .map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.description || "Dépense fixe"} · {e.date} ·{" "}
                    {money(e.amount_cents)}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>
    </details>
  );
}

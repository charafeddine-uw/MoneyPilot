import { safeSubmit } from "./form";
import { useRef, useState } from "react";
import { useFinance } from "../../providers/FinanceProvider";
import type { LongTermBudget } from "../../types/longTerm";
import type { Entry } from "../../types/finance";
import { makeRecurringPlan, fundingAvailable } from "../../lib/longTerm";
import { parseCents, money, todayISO } from "../../lib/finance";
import type { LongTermCommand } from "../../services/longTermRepository";
export default function CreateLongTerm({
  onSave,
  onError,
}: {
  onSave: (command: LongTermCommand) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const { account, entries, recurring, longTermBudgets, busy, categories } =
    useFinance();
  const [received, setReceived] = useState(false),
    [mode, setMode] = useState("existing"),
    [start, setStart] = useState(todayISO());
  const stableId = useRef(crypto.randomUUID()),
    incomeId = useRef(crypto.randomUUID());
  const incomes = entries.filter(
    (e) =>
      e.type === "income" &&
      !e.deleted_at &&
      fundingAvailable(e, longTermBudgets) > 0,
  );
  if (!account) return null;
  return (
    <section className="panel form-panel long-term-section">
      <h2>Créer un budget longue durée</h2>
      <p className="muted">
        Une bourse ou un revenu irrégulier à répartir sur plusieurs mois. Un
        seul budget peut être actif.
      </p>
      <form
        onSubmit={safeSubmit(onError, async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          const now = new Date().toISOString();
          const startDate = String(data.get("start")),
            endDate = String(data.get("end"));
          const budget: LongTermBudget = {
            id: stableId.current,
            account_id: account.id,
            name: String(data.get("name")).trim(),
            expected_amount_cents: parseCents(String(data.get("expected"))),
            start_date: startDate,
            end_date: endDate,
            payment_status: received ? "received" : "expected",
            initial_reserve_cents: parseCents(String(data.get("reserve"))),
            recurring_plans: recurring
              .filter((r) => data.getAll("recurring").includes(r.id))
              .map((r) => makeRecurringPlan(r, startDate)),
            funding: [],
            income_decisions: [],
            manual_allocations: null,
            fixed_mappings: [],
            surplus_decisions: [],
            emergencies: [],
            created_at: now,
            updated_at: now,
            closing: null,
          };
          let income: Entry | undefined;
          if (received) {
            const entryId =
              mode === "new" ? incomeId.current : String(data.get("income"));
            const amount = parseCents(String(data.get("allocated")));
            budget.funding = [{ entry_id: entryId, amount_cents: amount }];
            budget.income_decisions = [
              { entry_id: entryId, decision: "allocated" },
            ];
            if (mode === "new")
              income = {
                id: entryId,
                user_id: account.user_id,
                account_id: account.id,
                type: "income",
                amount_cents: parseCents(String(data.get("newAmount"))),
                category_id: String(data.get("category")),
                date: String(data.get("incomeDate")),
                description: budget.name,
                expense_kind: "variable",
                recurring_id: null,
                occurrence_date: null,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              };
          }
          await onSave({ type: "create", budget, new_income: income });
        })}
      >
        <fieldset disabled={busy}>
          <label htmlFor="lt-name">Nom du budget</label>
          <input
            id="lt-name"
            name="name"
            required
            maxLength={80}
            placeholder="Ex. : Bourse de novembre à février"
          />
          <label htmlFor="lt-expected">Montant total attendu (€)</label>
          <input
            id="lt-expected"
            name="expected"
            inputMode="decimal"
            required
            maxLength={14}
            placeholder="0,00"
          />
          <div className="long-term-fields">
            <div>
              <label htmlFor="lt-start">Début de la période (inclus)</label>
              <input
                id="lt-start"
                name="start"
                type="date"
                required
                min="1900-01-01"
                max="2100-12-31"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="lt-end">Fin de la période (incluse)</label>
              <input
                id="lt-end"
                name="end"
                type="date"
                required
                min={start > todayISO() ? start : todayISO()}
                max="2100-12-31"
              />
            </div>
          </div>
          <label htmlFor="lt-status">État du versement</label>
          <select
            id="lt-status"
            value={received ? "received" : "expected"}
            onChange={(e) => setReceived(e.target.value === "received")}
          >
            <option value="expected">Attendu · prévision uniquement</option>
            <option value="received">Reçu · lier un revenu réel</option>
          </select>
          <p className="field-help">
            Un montant attendu n’augmente ni le solde du compte ni l’argent
            réellement disponible pour les répartitions.
          </p>
          {received && (
            <div className="long-term-inset">
              <label htmlFor="lt-source">Source du financement</label>
              <select
                id="lt-source"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="existing">Lier un revenu déjà enregistré</option>
                <option value="new">
                  Créer explicitement un nouveau revenu
                </option>
              </select>
              {mode === "existing" ? (
                <>
                  <label htmlFor="lt-income">Revenu existant</label>
                  <select id="lt-income" name="income" required defaultValue="">
                    <option value="" disabled>
                      Choisir le revenu reçu
                    </option>
                    {incomes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.description || "Revenu"} · {e.date} ·{" "}
                        {money(fundingAvailable(e, longTermBudgets))}{" "}
                        disponibles
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label htmlFor="lt-new-amount">
                    Montant du nouveau revenu à enregistrer (€)
                  </label>
                  <input
                    id="lt-new-amount"
                    name="newAmount"
                    inputMode="decimal"
                    maxLength={14}
                    required
                  />
                  <label htmlFor="lt-income-date">
                    Date de réception réelle
                  </label>
                  <input
                    id="lt-income-date"
                    name="incomeDate"
                    type="date"
                    required
                    min="1900-01-01"
                    max={todayISO()}
                    defaultValue={todayISO()}
                  />
                  <label htmlFor="lt-income-category">
                    Catégorie du revenu
                  </label>
                  <select id="lt-income-category" name="category">
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="confirmation-label">
                    <input type="checkbox" required />
                    Je confirme que ce revenu n’existe pas déjà et demande son
                    enregistrement dans le compte.
                  </label>
                </>
              )}
              <label htmlFor="lt-allocated">
                Part du revenu affectée à ce budget (€)
              </label>
              <input
                id="lt-allocated"
                name="allocated"
                inputMode="decimal"
                required
                maxLength={14}
              />
            </div>
          )}
          <label htmlFor="lt-reserve">Réserve de sécurité initiale (€)</label>
          <input
            id="lt-reserve"
            name="reserve"
            inputMode="decimal"
            required
            maxLength={14}
            defaultValue="0,00"
          />
          <fieldset className="long-term-recurring">
            <legend>Charges récurrentes à réserver</legend>
            <p className="field-help">
              Les charges choisies sont projetées sur toute la période selon
              leur jour mensuel. Cette copie de prévision reste stable si vous
              modifiez ensuite une récurrence.
            </p>
            {recurring
              .filter((r) => r.active)
              .map((r) => (
                <label className="confirmation-label" key={r.id}>
                  <input type="checkbox" name="recurring" value={r.id} />
                  {r.description} · {money(r.amount_cents)}/mois
                </label>
              ))}
            {!recurring.some((r) => r.active) && (
              <p className="muted">
                Aucune dépense récurrente active. Vous pouvez en créer dans «
                Dépenses régulières ».
              </p>
            )}
          </fieldset>
          <button className="button primary form-submit" disabled={busy}>
            {busy
              ? "Enregistrement…"
              : received && mode === "new"
                ? "Créer le budget et enregistrer le revenu"
                : "Créer le budget"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

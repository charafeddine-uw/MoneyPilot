import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, FormFeedback } from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import {
  budgetProgress,
  centsInput,
  money,
  monthLabel,
  parseCents,
  todayISO,
} from "../lib/finance";
import type { MonthlyBudget } from "../types/finance";
export default function Budgets() {
  const { budgets, entries, categories, account, base, busy, saveBudget } =
    useFinance();
  const [month, setMonth] = useState(todayISO().slice(0, 7)),
    [editing, setEditing] = useState<MonthlyBudget | undefined>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const stableId = useRef(crypto.randomUUID());
  const form = useRef<HTMLFormElement>(null);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const visible = budgets
    .filter((b) => b.month === month + "-01")
    .sort(
      (a, b) => Number(Boolean(a.category_id)) - Number(Boolean(b.category_id)),
    );
  return (
    <>
      <PageHeader
        eyebrow="DONNER UN CAP À VOS DÉPENSES"
        title="Vos budgets mensuels"
        description="Fixez vos repères, puis suivez vos dépenses sans les bloquer."
      />
      <div className="period">
        <label htmlFor="budget-month">
          Mois concerné{" "}
          <input
            id="budget-month"
            type="month"
            min="1900-01"
            max="2100-12"
            required
            value={month}
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value)) {
                setMonth(event.target.value);
                setEditing(undefined);
                setError("");
                setMessage("");
                stableId.current = crypto.randomUUID();
              }
            }}
          />
        </label>
      </div>
      {!account ? (
        <section className="panel">
          <EmptyState
            title="Commençons par votre compte"
            to={base + "/setup"}
            label="Configurer mon compte"
          >
            Définissez votre point de départ avant de créer vos budgets.
          </EmptyState>
        </section>
      ) : (
        <div className="budget-layout">
          <section
            aria-label="Progression des budgets"
            className="budget-cards"
          >
            {visible.length ? (
              visible.map((budget) => {
                const progress = budgetProgress(budget, entries);
                return (
                  <article key={budget.id} className="panel budget-card">
                    <div className="panel-heading">
                      <h2>
                        {budget.category_id
                          ? names.get(budget.category_id)
                          : "Budget global"}
                      </h2>
                      <button
                        className="icon-button"
                        aria-label={`Modifier ${budget.category_id ? names.get(budget.category_id) : "le budget global"}`}
                        onClick={() => {
                          setEditing(budget);
                          setError("");
                          setMessage("");
                          form.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        }}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                    <div className="budget-card-content">
                      <p>
                        <strong>{money(progress.spent)}</strong>{" "}
                        <span className="muted">
                          sur {money(budget.amount_cents)}
                        </span>
                      </p>
                      <progress
                        max={100}
                        value={Math.min(progress.percent, 100)}
                        aria-label={`Consommation ${budget.category_id ? names.get(budget.category_id) : "globale"}`}
                      />
                      <div className="budget-remaining">
                        <span
                          className={
                            progress.remaining < 0 ? "negative" : "positive"
                          }
                        >
                          {money(Math.abs(progress.remaining))}{" "}
                          {progress.remaining < 0
                            ? "de dépassement"
                            : "restants"}
                        </span>
                        <span>{progress.percent} %</span>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <section className="panel">
                <EmptyState title="Un mois à dessiner">
                  Aucun budget pour {monthLabel(month)}. Commencez par un
                  montant global ou une catégorie.
                </EmptyState>
              </section>
            )}
          </section>
          <section className="panel form-panel">
            <h2>{editing ? "Modifier le budget" : "Définir un budget"}</h2>
            <p className="muted">
              {monthLabel(month)} · les dépassements restent autorisés
            </p>
            <form
              ref={form}
              key={`${month}-${editing?.id ?? "new"}`}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const data = new FormData(event.currentTarget);
                setError("");
                setMessage("");
                try {
                  await saveBudget(
                    editing?.id ?? stableId.current,
                    month,
                    parseCents(String(data.get("amount"))),
                    String(data.get("category")) || null,
                    editing,
                  );
                  setMessage("Budget enregistré.");
                  setEditing(undefined);
                  stableId.current = crypto.randomUUID();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <fieldset disabled={busy}>
                <label htmlFor="budget-category">Périmètre</label>
                <select
                  id="budget-category"
                  name="category"
                  defaultValue={editing?.category_id ?? ""}
                >
                  <option value="">Global · toutes les dépenses</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="budget-amount">Montant autorisé (€)</label>
                <input
                  id="budget-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  maxLength={14}
                  required
                  defaultValue={editing ? centsInput(editing.amount_cents) : ""}
                  placeholder="0,00"
                />
                <FormFeedback error={error} message={message} />
                <button className="button primary form-submit" disabled={busy}>
                  {busy ? "Enregistrement…" : "Enregistrer le budget"}
                </button>
              </fieldset>
            </form>
            {editing && (
              <button
                className="text-button form-cancel"
                onClick={() => {
                  setEditing(undefined);
                  setError("");
                }}
              >
                Annuler
              </button>
            )}
            <p className="field-help">
              Le budget global comprend toutes les dépenses. Les budgets de
              catégorie sont des vues complémentaires : ils ne s’ajoutent pas au
              budget global.
            </p>
          </section>
        </div>
      )}
    </>
  );
}

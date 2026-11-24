import { useRef, useState } from "react";
import { Pencil, Repeat } from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  ConfirmDialog,
  EmptyState,
  FormFeedback,
} from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import {
  centsInput,
  dateLabel,
  money,
  parseCents,
  todayISO,
} from "../lib/finance";
import type { RecurringExpense } from "../types/finance";
export default function Recurring() {
  const {
    account,
    recurring,
    categories,
    base,
    busy,
    saveRecurring,
    confirmRecurring,
  } = useFinance();
  const [editing, setEditing] = useState<RecurringExpense | undefined>(),
    [confirmation, setConfirmation] = useState<RecurringExpense | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const id = useRef(crypto.randomUUID()),
    confirmationId = useRef(crypto.randomUUID());
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader
        eyebrow="ANTICIPER, SANS DOUBLE COMPTER"
        title="Vos dépenses régulières"
        description="Loyers et abonnements : vos prochaines échéances, à confirmer."
      />
      <p className="feedback info">
        Une échéance prévue ne change jamais votre solde. Confirmez uniquement
        une dépense réellement effectuée ; vérifiez qu’elle n’a pas déjà été
        saisie manuellement.
      </p>
      {!account ? (
        <section className="panel">
          <EmptyState
            title="Votre compte d’abord"
            to={base + "/setup"}
            label="Configurer mon compte"
          >
            Votre compte principal accueillera les échéances confirmées.
          </EmptyState>
        </section>
      ) : (
        <div className="budget-layout">
          <section
            className="recurring-cards"
            aria-label="Échéances mensuelles"
          >
            {recurring.length ? (
              [...recurring]
                .sort((a, b) => a.next_date.localeCompare(b.next_date))
                .map((item) => (
                  <article key={item.id} className="panel recurring-card">
                    <div className="panel-heading">
                      <div className="action-row">
                        <Repeat size={18} />
                        <h2>{item.description}</h2>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Modifier ${item.description}`}
                        onClick={() => {
                          setEditing(item);
                          setError("");
                          setMessage("");
                        }}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                    <div className="budget-card-content">
                      <strong className="recurring-amount">
                        {money(item.amount_cents)}{" "}
                        <span className="muted">/ mois</span>
                      </strong>
                      <p className="muted">
                        {names.get(item.category_id)} ·{" "}
                        {item.active ? "Active" : "En pause"}
                      </p>
                      <p>Prochaine échéance : {dateLabel(item.next_date)}</p>
                      <button
                        className="button secondary"
                        disabled={
                          busy || !item.active || item.next_date > todayISO()
                        }
                        onClick={() => {
                          confirmationId.current = crypto.randomUUID();
                          setConfirmation(item);
                          setError("");
                        }}
                      >
                        {!item.active
                          ? "En pause"
                          : item.next_date > todayISO()
                            ? "Échéance à venir"
                            : "Confirmer le paiement"}
                      </button>
                    </div>
                  </article>
                ))
            ) : (
              <section className="panel">
                <EmptyState title="Plus de visibilité sur vos habitudes">
                  Ajoutez votre première dépense mensuelle. Elle restera une
                  prévision jusqu’à votre confirmation.
                </EmptyState>
              </section>
            )}
          </section>
          <section className="panel form-panel">
            <h2>
              {editing
                ? "Modifier la dépense régulière"
                : "Nouvelle dépense régulière"}
            </h2>
            <form
              key={editing?.id ?? "new"}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const data = new FormData(event.currentTarget),
                  date = String(data.get("date"));
                setError("");
                setMessage("");
                try {
                  await saveRecurring(
                    editing?.id ?? id.current,
                    {
                      description: String(data.get("description")).trim(),
                      amount_cents: parseCents(String(data.get("amount"))),
                      category_id: String(data.get("category")),
                      next_date: date,
                      anchor_day: Number(data.get("anchor")),
                      active: data.get("active") === "on",
                    },
                    editing,
                  );
                  setEditing(undefined);
                  id.current = crypto.randomUUID();
                  setMessage(
                    "Dépense régulière enregistrée, sans modification du solde.",
                  );
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <fieldset disabled={busy}>
                <label htmlFor="recurring-description">Description</label>
                <input
                  id="recurring-description"
                  name="description"
                  maxLength={200}
                  required
                  defaultValue={editing?.description ?? ""}
                  placeholder="Ex. : Loyer"
                />
                <label htmlFor="recurring-amount">Montant mensuel (€)</label>
                <input
                  id="recurring-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  maxLength={14}
                  required
                  defaultValue={editing ? centsInput(editing.amount_cents) : ""}
                />
                <label htmlFor="recurring-category">Catégorie</label>
                <select
                  id="recurring-category"
                  name="category"
                  defaultValue={editing?.category_id}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="recurring-date">Prochaine échéance</label>
                <input
                  id="recurring-date"
                  name="date"
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  required
                  defaultValue={editing?.next_date ?? todayISO()}
                />
                <label htmlFor="anchor-day">Jour habituel du mois</label>
                <input
                  id="anchor-day"
                  name="anchor"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  required
                  defaultValue={
                    editing?.anchor_day ?? Number(todayISO().slice(8))
                  }
                />
                <p className="field-help">
                  Pour le 31, février utilisera son dernier jour, puis mars
                  reviendra au 31.
                </p>
                <label className="consent">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing?.active ?? true}
                  />
                  Dépense active
                </label>
                <FormFeedback error={error} message={message} />
                <button className="button primary form-submit" disabled={busy}>
                  {busy
                    ? "Enregistrement…"
                    : "Enregistrer la dépense régulière"}
                </button>
              </fieldset>
            </form>
            {editing && (
              <button
                className="text-button form-cancel"
                onClick={() => setEditing(undefined)}
              >
                Annuler
              </button>
            )}
          </section>
        </div>
      )}
      {confirmation && (
        <ConfirmDialog
          title="Enregistrer cette dépense effectuée ?"
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            try {
              await confirmRecurring(confirmation, confirmationId.current);
              setConfirmation(null);
              setMessage(
                "Échéance confirmée : une seule transaction a été créée et la prochaine date est calculée.",
              );
            } catch (err) {
              setError((err as Error).message);
              setConfirmation(null);
            }
          }}
        >
          {confirmation.description} · {money(confirmation.amount_cents)} ·{" "}
          {dateLabel(confirmation.next_date)}. Cette confirmation créera une
          dépense fixe dans votre historique.
        </ConfirmDialog>
      )}
    </>
  );
}

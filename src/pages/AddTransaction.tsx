import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Info, Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, FormFeedback } from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import { centsInput, parseCents, todayISO } from "../lib/finance";
import type { TransactionType } from "../types/finance";
export default function AddTransaction() {
  const { id } = useParams();
  return <TransactionForm key={id ?? "new"} id={id} />;
}
function TransactionForm({ id }: { id?: string }) {
  const { account, entries, categories, base, saveEntry, busy } = useFinance();
  // Conserve la version ouverte : une actualisation en arrière-plan ne doit pas masquer un conflit.
  const [previous] = useState(() => entries.find((e) => e.id === id));
  const [type, setType] = useState<TransactionType>(
      previous?.type ?? "expense",
    ),
    [error, setError] = useState("");
  const stableId = useRef(id ?? crypto.randomUUID());
  const navigate = useNavigate();
  if (id && !previous)
    return (
      <EmptyState
        title="Transaction introuvable"
        to={base + "/history"}
        label="Revenir à l’historique"
      >
        Elle a pu être supprimée ou appartient à un autre compte.
      </EmptyState>
    );
  return (
    <>
      <PageHeader
        eyebrow="UN BUDGET AU QUOTIDIEN"
        title={id ? "Modifier la transaction" : "Ajouter une transaction"}
        description="Un revenu ou une dépense, chaque mouvement compte."
      />
      {!account ? (
        <section className="panel">
          <EmptyState
            title="Un point de départ, puis vos transactions."
            to={base + "/setup"}
            label="Configurer mon compte"
          >
            Définissez votre solde de référence pour commencer.
          </EmptyState>
        </section>
      ) : (
        <div className="form-layout">
          <section className="panel form-panel">
            <h2>{id ? "Votre transaction" : "Nouvelle transaction"}</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const data = new FormData(event.currentTarget);
                setError("");
                try {
                  await saveEntry(
                    stableId.current,
                    {
                      type,
                      amount_cents: parseCents(String(data.get("amount"))),
                      category_id: String(data.get("category")),
                      date: String(data.get("date")),
                      description: String(data.get("description")).trim(),
                      expense_kind:
                        type === "expense" && data.get("kind") === "fixed"
                          ? "fixed"
                          : "variable",
                    },
                    previous,
                  );
                  navigate(base + "/history", {
                    state: {
                      notice: "Transaction enregistrée.",
                      savedEntryId: stableId.current,
                    },
                  });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <fieldset disabled={busy}>
                <legend>Type de transaction</legend>
                <div className="type-options">
                  {(["expense", "income"] as const).map((value) => (
                    <label
                      className={type === value ? "selected" : ""}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="type"
                        checked={type === value}
                        onChange={() => setType(value)}
                      />
                      {value === "expense" ? "Dépense" : "Revenu"}
                    </label>
                  ))}
                </div>
                <label htmlFor="amount">Montant (€)</label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  required
                  maxLength={14}
                  autoFocus
                  placeholder="0,00"
                  defaultValue={
                    previous ? centsInput(previous.amount_cents) : ""
                  }
                />
                <div className="form-row">
                  <div>
                    <label htmlFor="category">Catégorie</label>
                    <select
                      id="category"
                      name="category"
                      required
                      defaultValue={
                        previous?.category_id ??
                        categories.find((c) => c.name === "Alimentation")?.id ??
                        ""
                      }
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="date">Date de l’opération</label>
                    <input
                      id="date"
                      name="date"
                      type="date"
                      min="1900-01-01"
                      max={todayISO()}
                      required
                      defaultValue={previous?.date ?? todayISO()}
                    />
                  </div>
                </div>
                {type === "expense" && (
                  <>
                    <label htmlFor="kind">Nature de la dépense</label>
                    <select
                      id="kind"
                      name="kind"
                      defaultValue={previous?.expense_kind ?? "variable"}
                    >
                      <option value="variable">Variable</option>
                      <option value="fixed">Fixe</option>
                    </select>
                  </>
                )}
                <label htmlFor="description">
                  Description <span className="muted">(facultatif)</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={2}
                  maxLength={200}
                  defaultValue={previous?.description}
                  placeholder="Ex. : courses du quotidien"
                />
                <FormFeedback error={error} />
                <button
                  type="submit"
                  className="button primary form-submit"
                  disabled={busy}
                >
                  <Plus size={18} />
                  {busy ? "Enregistrement…" : "Enregistrer la transaction"}
                </button>
              </fieldset>
            </form>
            {id && (
              <Link
                className="text-link form-cancel"
                to={base + "/transactions/" + id}
              >
                Annuler les modifications
              </Link>
            )}
          </section>
          <aside className="info-panel">
            <Info size={22} />
            <h2>Un montant. Un mouvement.</h2>
            <p>
              Une dépense diminue votre solde estimé. Un revenu l’augmente. Le
              type fixe ou variable ne change pas le calcul.
            </p>
            <p>
              Les opérations datées au plus tard à la référence sont visibles
              dans l’historique et les totaux mensuels, mais déjà incluses dans
              le solde initial.
            </p>
            <p>
              La confirmation apparaît uniquement après l’enregistrement. Les
              transferts et les remboursements avec compensation sont exclus de
              cette V1.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Download, Pencil, Trash2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  ConfirmDialog,
  EmptyState,
  EntryList,
  FormFeedback,
} from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import { dateLabel, exportCSV, money } from "../lib/finance";
export default function History() {
  const {
    entries,
    categories,
    account,
    base,
    busy,
    deleteEntry,
    demo,
    longTermBudgets,
    runLongTerm,
  } = useFinance();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [type, setType] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [order, setOrder] = useState("desc"),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const filtered = entries
    .filter(
      (entry) =>
        (!query ||
          [entry.description, names.get(entry.category_id) ?? ""].some((text) =>
            text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )) &&
        (!category || entry.category_id === category) &&
        (!type || entry.type === type) &&
        (!from || entry.date >= from) &&
        (!to || entry.date <= to),
    )
    .sort(
      (a, b) =>
        (order === "desc" ? -1 : 1) *
        (a.date.localeCompare(b.date) ||
          a.created_at.localeCompare(b.created_at)),
    );
  const selected = entries.find((entry) => entry.id === id);
  const incomeBudget = longTermBudgets.find((b) => !b.closing);
  const newIncome = entries.find(
    (e) => e.id === location.state?.savedEntryId && e.type === "income",
  );
  const offerFunding =
    incomeBudget &&
    newIncome &&
    newIncome.date >= incomeBudget.start_date &&
    newIncome.date <= incomeBudget.end_date &&
    !incomeBudget.income_decisions.some((d) => d.entry_id === newIncome.id);
  if (id)
    return (
      <>
        <PageHeader
          eyebrow="TOUS LES DÉTAILS"
          title="Votre transaction"
          description="Un mouvement de votre compte principal."
        />
        {selected ? (
          <section className="panel detail-panel">
            <span className="small-badge">
              {selected.type === "income" ? "Revenu" : "Dépense"}
              {selected.recurring_id ? " · Échéance confirmée" : ""}
            </span>
            <h2>{selected.description || names.get(selected.category_id)}</h2>
            <p className="detail-amount">
              {selected.type === "income" ? "+" : "−"}
              {money(selected.amount_cents)}
            </p>
            <dl>
              <dt>Date</dt>
              <dd>{dateLabel(selected.date)}</dd>
              <dt>Catégorie</dt>
              <dd>{names.get(selected.category_id)}</dd>
              <dt>Compte</dt>
              <dd>{account?.name}</dd>
              {selected.type === "expense" && (
                <>
                  <dt>Nature</dt>
                  <dd>
                    {selected.expense_kind === "fixed" ? "Fixe" : "Variable"}
                  </dd>
                </>
              )}
              <dt>Création</dt>
              <dd>{dateLabel(selected.created_at.slice(0, 10))}</dd>
            </dl>
            <div className="action-row">
              <Link
                className="button primary"
                to={base + "/transactions/" + id + "/edit"}
              >
                <Pencil size={16} />
                Modifier
              </Link>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={16} />
                Supprimer
              </button>
              <Link className="button secondary" to={base + "/history"}>
                Retour
              </Link>
            </div>
            <FormFeedback error={error} />
          </section>
        ) : (
          <EmptyState
            title="Transaction introuvable"
            to={base + "/history"}
            label="Retour à l’historique"
          >
            Cette transaction n’est pas disponible dans votre compte.
          </EmptyState>
        )}
        {confirm && selected && (
          <ConfirmDialog
            title="Supprimer cette transaction ?"
            busy={busy}
            onCancel={() => setConfirm(false)}
            onConfirm={async () => {
              try {
                await deleteEntry(selected);
                navigate(base + "/history", {
                  replace: true,
                  state: {
                    notice: "Transaction supprimée. Les totaux sont à jour.",
                  },
                });
              } catch (err) {
                setError((err as Error).message);
                setConfirm(false);
              }
            }}
          >
            {selected.description || names.get(selected.category_id)} ·{" "}
            {money(selected.amount_cents)}. Elle sera retirée des totaux et de
            l’historique. Une trace technique est conservée pour éviter les
            doublons de récurrence.
          </ConfirmDialog>
        )}
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="CHAQUE MOUVEMENT, EN CLAIR"
        title="Votre historique"
        description="Recherchez, retrouvez et ajustez vos transactions."
        action={
          <button
            className="button secondary"
            disabled={!filtered.length || busy}
            onClick={() => {
              const csv = exportCSV(
                filtered,
                names,
                account?.name ?? "Compte principal",
              );
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv;charset=utf-8;" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `moneypilot-${demo ? "demo-" : ""}transactions.csv`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={17} />
            Exporter la sélection
          </button>
        }
      />
      {location.state?.notice && (
        <p className="feedback success" role="status">
          {String(location.state.notice)}
        </p>
      )}
      {offerFunding && (
        <section className="feedback info">
          <p>
            Ce revenu reste séparé de votre budget longue durée. Souhaitez-vous
            y affecter une part ?
          </p>
          <div className="action-row">
            <Link className="text-link" to={base + "/long-term"}>
              Choisir une part à affecter
            </Link>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  await runLongTerm({
                    type: "funding",
                    id: incomeBudget.id,
                    expected: incomeBudget.updated_at,
                    entry_id: newIncome.id,
                    allocation: null,
                  });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              Garder ce revenu séparé
            </button>
          </div>
          <FormFeedback error={error} />
        </section>
      )}
      <section className="panel">
        <div className="history-filters">
          <div className="search-field">
            <label htmlFor="search">Recherche</label>
            <input
              id="search"
              type="search"
              value={query}
              maxLength={200}
              placeholder="Description ou catégorie"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="filter-category">Catégorie</label>
            <select
              id="filter-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Toutes</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-type">Type</label>
            <select
              id="filter-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Tous</option>
              <option value="expense">Dépenses</option>
              <option value="income">Revenus</option>
            </select>
          </div>
          <div>
            <label htmlFor="from">Du</label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="to">Au</label>
            <input
              id="to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="order">Tri par date</label>
            <select
              id="order"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="desc">Plus récentes</option>
              <option value="asc">Plus anciennes</option>
            </select>
          </div>
        </div>
        <div className="panel-heading">
          <h2>
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
          </h2>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setCategory("");
              setType("");
              setFrom("");
              setTo("");
              setOrder("desc");
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
        {from && to && from > to ? (
          <p role="alert" className="feedback error">
            La date de fin doit suivre la date de début.
          </p>
        ) : filtered.length ? (
          <EntryList entries={filtered} />
        ) : (
          <EmptyState
            title={
              entries.length
                ? "Aucun résultat"
                : "Votre historique commence ici."
            }
            to={entries.length ? undefined : base + "/add"}
            label="Ajouter une transaction"
          >
            {entries.length
              ? "Essayez une autre recherche ou élargissez la période."
              : "Ajoutez votre premier revenu ou votre première dépense."}
          </EmptyState>
        )}
      </section>
      <p className="field-help">
        Export CSV : montants positifs en euros, virgule décimale, séparateur
        point-virgule, type dans une colonne distincte. Seule la sélection
        visible est exportée.
      </p>
    </>
  );
}

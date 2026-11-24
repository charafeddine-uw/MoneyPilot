import { Link } from "react-router";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Wallet,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, EntryList } from "../components/FinanceUI";
import SpendingCharts from "../components/SpendingCharts";
import { useFinance } from "../providers/FinanceProvider";
import {
  budgetProgress,
  monthLabel,
  money,
  todayISO,
  totals,
} from "../lib/finance";
import { useState } from "react";
export default function Dashboard() {
  const { account, entries, categories, budgets, base } = useFinance();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const summary = totals(account, entries, month);
  const monthly = entries.filter((e) => e.date.slice(0, 7) === month);
  const recent = [...monthly]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    )
    .slice(0, 4);
  const global = budgets.find(
    (b) => b.month === month + "-01" && !b.category_id,
  );
  const progress = global ? budgetProgress(global, entries) : null;
  return (
    <>
      <PageHeader
        eyebrow="LE CAP SUR VOS FINANCES"
        title="Votre vue d’ensemble"
        description="Un regard simple sur votre budget, l’esprit plus léger."
        action={
          <Link className="button primary" to={base + "/add"}>
            <Plus size={18} />
            Ajouter une transaction
          </Link>
        }
      />
      {!account && (
        <section className="panel">
          <EmptyState
            title="Votre budget commence ici."
            to={base + "/setup"}
            label="Configurer mon compte"
          >
            Définissez votre solde à une date de référence pour calculer votre
            solde estimé.
          </EmptyState>
        </section>
      )}
      <div className="period">
        <label htmlFor="dashboard-month">
          Période{" "}
          <input
            id="dashboard-month"
            type="month"
            min="1900-01"
            max={todayISO().slice(0, 7)}
            value={month}
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value))
                setMonth(event.target.value);
            }}
          />
        </label>
        <span className="muted">
          Les totaux portent sur {monthLabel(month)}.
        </span>
      </div>
      <section className="summary-grid" aria-label="Résumé du budget">
        <article className="balance-card">
          <div className="card-label">
            <span>Solde estimé aujourd’hui</span>
            <Wallet size={20} />
          </div>
          <p className="balance-value">
            {account ? money(summary.balance) : "À configurer"}
          </p>
          <div className="balance-bottom">
            <span>Estimation · pas un solde bancaire vérifié</span>
            <span>EUR</span>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon income">
            <ArrowDownLeft size={21} />
          </span>
          <p>Revenus du mois</p>
          <strong>{money(summary.income)}</strong>
          <span className="stat-caption">{monthLabel(month)}</span>
        </article>
        <article className="stat-card">
          <span className="stat-icon expense">
            <ArrowUpRight size={21} />
          </span>
          <p>Dépenses du mois</p>
          <strong>{money(summary.expenses)}</strong>
          <span className="stat-caption">{monthLabel(month)}</span>
        </article>
      </section>
      <section className="month-overview">
        <article className="panel mini-panel">
          <span className="muted">Résultat du mois</span>
          <strong className={summary.result >= 0 ? "positive" : "negative"}>
            {summary.result > 0 ? "+" : ""}
            {money(summary.result)}
          </strong>
          <p>Revenus − dépenses de la période</p>
        </article>
        <article className="panel mini-panel budget-summary">
          <div>
            <span className="muted">Budget mensuel global</span>
            {global && progress ? (
              <>
                <strong className={progress.remaining < 0 ? "negative" : ""}>
                  {money(Math.abs(progress.remaining))}{" "}
                  {progress.remaining < 0 ? "de dépassement" : "restants"}
                </strong>
                <p>
                  {money(progress.spent)} dépensés sur{" "}
                  {money(global.amount_cents)}
                </p>
                <progress
                  max={100}
                  value={Math.min(progress.percent, 100)}
                  aria-label="Budget mensuel consommé"
                />
                {progress.percent > 100 && (
                  <span className="negative">
                    {progress.percent} % consommés
                  </span>
                )}
              </>
            ) : (
              <p>Aucun budget global défini pour ce mois.</p>
            )}
          </div>
          <Link className="text-link" to={base + "/budgets"}>
            Gérer <ArrowRight size={16} />
          </Link>
        </article>
      </section>
      <SpendingCharts
        entries={entries}
        categories={categories}
        account={account}
        month={month}
      />
      <section className="panel recent">
        <div className="panel-heading">
          <div>
            <h2>Transactions de la période</h2>
            <p className="muted">
              Les mouvements les plus récents de {monthLabel(month)}.
            </p>
          </div>
          <Link className="text-link" to={base + "/history"}>
            Tout voir <ArrowRight size={16} />
          </Link>
        </div>
        {recent.length ? (
          <EntryList entries={recent} />
        ) : (
          <EmptyState title="Un mois sans transaction">
            Aucun revenu ni dépense enregistré pour cette période.
          </EmptyState>
        )}
      </section>
    </>
  );
}

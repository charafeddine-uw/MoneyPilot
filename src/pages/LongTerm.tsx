import { useState } from "react";
import { Link } from "react-router";
import PageHeader from "../components/PageHeader";
import { FormFeedback, EmptyState } from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import { calculateLongTerm } from "../lib/longTerm";
import { dateLabel, money, monthLabel, todayISO } from "../lib/finance";
import CreateLongTerm from "../components/longTerm/CreateLongTerm";
import {
  ManualAllocations,
  FundingForm,
  SurplusForms,
  EmergencyForm,
  FixedReconciliation,
} from "../components/longTerm/LongTermActions";
import type { LongTermCommand } from "../services/longTermRepository";
export default function LongTerm() {
  const finance = useFinance();
  const { account, longTermBudgets, runLongTerm, base } = finance;
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const active = longTermBudgets.find((b) => !b.closing);
  const selected =
    selectedId === null
      ? active
      : longTermBudgets.find((b) => b.id === selectedId);
  const summary = selected ? calculateLongTerm(selected, finance) : null;
  function showError(error: unknown) {
    setError(
      error instanceof Error
        ? error.message
        : "Impossible d’enregistrer ce choix.",
    );
    setMessage("");
  }
  async function save(command: LongTermCommand) {
    setError("");
    setMessage("");
    try {
      await runLongTerm(command);
      if (command.type === "create") setSelectedId(null);
      setMessage(
        "Budget longue durée : choix enregistré. Aucune dépense supplémentaire créée.",
      );
    } catch (err) {
      showError(err);
    }
  }
  const actualEntries = selected?.closing?.entries ?? finance.entries;
  const actualCurrent =
    selected && summary?.current
      ? actualEntries
          .filter(
            (e) =>
              !e.deleted_at &&
              e.type === "expense" &&
              e.account_id === selected.account_id &&
              e.date >= summary.current!.start &&
              e.date <= summary.current!.end &&
              e.date <= todayISO(),
          )
          .reduce((s, e) => s + e.amount_cents, 0)
      : 0;
  return (
    <>
      <PageHeader
        eyebrow="PRÉVOIR PLUSIEURS MOIS"
        title="Budget longue durée"
        description="Une bourse, une aide ou un revenu irrégulier : donnez un rôle à chaque euro, sur toute la période."
      />
      <p className="feedback info">
        Ces enveloppes ne déplacent pas d’argent et ne changent pas le solde du
        compte. Les dépenses restent enregistrées une seule fois dans votre
        historique.
      </p>
      <FormFeedback error={error} message={message} />
      {!account ? (
        <section className="panel">
          <EmptyState
            title="Votre compte d’abord"
            to={base + "/setup"}
            label="Configurer mon compte"
          >
            Définissez le solde initial avant de préparer votre budget longue
            durée.
          </EmptyState>
        </section>
      ) : (
        <>
          {longTermBudgets.length > 0 && (
            <div className="period">
              <label htmlFor="lt-select-budget">
                Budget à consulter
                <select
                  id="lt-select-budget"
                  value={selected?.id ?? ""}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setError("");
                    setMessage("");
                  }}
                >
                  {!active && <option value="">Créer un nouveau budget</option>}
                  {longTermBudgets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.closing ? "archive clôturée" : "actif"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {!selected && !active && (
            <CreateLongTerm onSave={save} onError={showError} />
          )}
          {selected && summary && (
            <>
              <section className="panel long-term-section">
                <div className="panel-heading">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted">
                      Du {dateLabel(selected.start_date)} au{" "}
                      {dateLabel(selected.end_date)}, bornes incluses.
                    </p>
                  </div>
                  <span className="demo-badge">
                    {selected.closing
                      ? "Clôturé · archive figée"
                      : summary.funding_cents === 0
                        ? "Financement attendu"
                        : summary.funding_cents < selected.expected_amount_cents
                          ? "Financement reçu partiellement"
                          : "Financement reçu"}
                  </span>
                </div>
                {selected.closing ? (
                  <p className="feedback info">
                    Clôturé le{" "}
                    {new Date(selected.closing.closed_at).toLocaleDateString(
                      "fr-BE",
                    )}
                    . Les montants ci-dessous proviennent d’un instantané
                    enregistré à la clôture. Les modifications ultérieures de
                    l’historique ne changent pas cette archive.
                  </p>
                ) : (
                  summary.funding_cents === 0 && (
                    <p className="feedback info">
                      Le versement n’est pas encore affecté. Prévision variable
                      : {money(summary.forecast_variable_cents)}. Ce montant est
                      prévisionnel et ne peut pas encore être réparti comme de
                      l’argent reçu.
                    </p>
                  )
                )}
                {summary.deficit_cents > 0 && (
                  <p className="feedback error" role="alert">
                    {summary.funding_cents === 0
                      ? "Charges et réserve encore non financées :"
                      : "Déficit projeté sur les fonds réellement affectés :"}{" "}
                    {money(summary.deficit_cents)}. La formule donne{" "}
                    {money(summary.raw_variable_cents)} pour l’enveloppe
                    variable avant prise en compte des dépenses. Les dépenses
                    réelles restent autorisées.
                  </p>
                )}
                {summary.uncovered_cents > 0 && (
                  <p className="feedback error">
                    Dépassement non couvert par les allocations futures :{" "}
                    {money(summary.uncovered_cents)}.
                  </p>
                )}
                {summary.warnings.map((w) => (
                  <p className="feedback info" key={w}>
                    {w}
                  </p>
                ))}
                <div className="long-term-stats">
                  {[
                    ["Financement attendu", selected.expected_amount_cents],
                    ["Reçu et affecté", summary.funding_cents],
                    ["Charges fixes réservées et payées", summary.fixed_cents],
                    [
                      "Réserve de sécurité restante",
                      summary.reserve_remaining_cents,
                    ],
                    [
                      "Enveloppe variable avant dépenses",
                      summary.variable_capacity_cents,
                    ],
                    ["Allocations futures", summary.future_cents],
                    ["Surplus en attente de choix", summary.pending_cents],
                    ["Non affecté à un mois", summary.unallocated_cents],
                  ].map(([label, value]) => (
                    <article className="long-term-stat" key={String(label)}>
                      <span>{label}</span>
                      <strong>{money(Number(value))}</strong>
                    </article>
                  ))}
                </div>
              </section>
              {summary.current && (
                <section className="panel long-term-section">
                  <h2>Votre cap pour {monthLabel(summary.current.month)}</h2>
                  <div className="long-term-stats">
                    {[
                      [
                        "Budget variable ajusté",
                        summary.current.allocation_cents,
                      ],
                      [
                        "Dépenses variables et imprévus",
                        summary.current.actual_spending_cents,
                      ],
                      ["Toutes les dépenses du mois", actualCurrent],
                      ["Reste variable", summary.current.remaining_cents],
                    ].map(([label, value]) => (
                      <article className="long-term-stat" key={String(label)}>
                        <span>{label}</span>
                        <strong className={Number(value) < 0 ? "negative" : ""}>
                          {money(Number(value))}
                        </strong>
                      </article>
                    ))}
                  </div>
                  <p>
                    <strong>
                      Repère quotidien : {money(summary.daily_guideline_cents)}
                      /jour
                    </strong>{" "}
                    jusqu’à la fin de la partie couverte de ce mois, journée
                    actuelle incluse. C’est un conseil, jamais une limite de
                    saisie.
                  </p>
                  <p className="muted">
                    Rythme : {summary.elapsed_percent} % des jours couverts
                    écoulés · {summary.consumed_percent} % de l’enveloppe
                    consommés. Dont{" "}
                    {money(
                      summary.current.actual_spending_cents -
                        summary.current.charged_spending_cents,
                    )}{" "}
                    pris sur la réserve, sans débit de l’enveloppe variable.
                  </p>
                  {summary.pace_warning && (
                    <p className="feedback info">
                      Votre budget variable est consommé plus vite que les jours
                      ne passent. Les ajustements des mois futurs restent
                      visibles ci-dessous.
                    </p>
                  )}
                </section>
              )}
              <section className="long-term-section">
                <h2>Répartition mois par mois</h2>
                <p className="muted">
                  Les jours partiels comptent au prorata. Les centimes d’arrondi
                  sont répartis de façon déterministe pour conserver le total
                  exact. Les dépenses fixes sont déjà déduites du financement.
                </p>
                <div className="long-term-months">
                  {summary.months.map((m) => (
                    <article className="panel long-term-month" key={m.month}>
                      <div className="panel-heading">
                        <h3>{monthLabel(m.month)}</h3>
                        <span className="muted">
                          {m.status === "future"
                            ? "À venir"
                            : m.status === "current"
                              ? "En cours"
                              : "Terminé"}
                        </span>
                      </div>
                      <p className="field-help">
                        {dateLabel(m.start)} — {dateLabel(m.end)} · {m.days}{" "}
                        jours couverts
                      </p>
                      <dl className="long-term-ledger">
                        {summary.funding_cents <
                          selected.expected_amount_cents && (
                          <div>
                            <dt>Prévision si versement reçu</dt>
                            <dd>{money(m.forecast_cents)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Répartition prévue (financée)</dt>
                          <dd>{money(m.planned_cents)}</dd>
                        </div>
                        <div>
                          <dt>Ajustements calculés</dt>
                          <dd>{money(m.adjustment_cents)}</dd>
                        </div>
                        <div>
                          <dt>Enveloppe ajustée</dt>
                          <dd>{money(m.allocation_cents)}</dd>
                        </div>
                        <div>
                          <dt>Dépenses variables</dt>
                          <dd>{money(m.actual_spending_cents)}</dd>
                        </div>
                        <div>
                          <dt>Part débitée de l’enveloppe</dt>
                          <dd>{money(m.charged_spending_cents)}</dd>
                        </div>
                        <div>
                          <dt>
                            Reste
                            {m.pending_cents > 0
                              ? " · en attente de choix"
                              : ""}
                          </dt>
                          <dd
                            className={
                              m.remaining_cents < 0 ? "negative" : "positive"
                            }
                          >
                            {money(m.remaining_cents)}
                          </dd>
                        </div>
                      </dl>
                      <progress
                        value={Math.min(
                          100,
                          m.allocation_cents
                            ? (100 * m.charged_spending_cents) /
                                m.allocation_cents
                            : m.charged_spending_cents
                              ? 100
                              : 0,
                        )}
                        max={100}
                        aria-label={
                          "Consommation du budget de " + monthLabel(m.month)
                        }
                      />
                      {m.overspending_cents > 0 && (
                        <p className="negative">
                          Dépassement avant compensation :{" "}
                          {money(m.overspending_cents)}. Compensation calculée
                          sur les mois suivants.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              {!selected.closing ? (
                <>
                  <ManualAllocations
                    key={
                      selected.id +
                      JSON.stringify(selected.manual_allocations) +
                      (selected.manual_allocations
                        ? ""
                        : summary.variable_capacity_cents)
                    }
                    budget={selected}
                    summary={summary}
                    onSave={save}
                    onError={showError}
                  />
                  <FundingForm
                    key={selected.id}
                    budget={selected}
                    summary={summary}
                    onSave={save}
                    onError={showError}
                  />
                  <SurplusForms
                    budget={selected}
                    summary={summary}
                    onSave={save}
                    onError={showError}
                  />
                  <EmergencyForm
                    key={selected.id + "-emergency"}
                    budget={selected}
                    summary={summary}
                    onSave={save}
                    onError={showError}
                  />
                  <FixedReconciliation
                    budget={selected}
                    summary={summary}
                    onSave={save}
                    onError={showError}
                  />
                </>
              ) : (
                <section className="panel form-panel long-term-section">
                  <h2>Bilan conservé à la clôture</h2>
                  <p>
                    Financement : {money(selected.closing.totals.funding_cents)}{" "}
                    · charges fixes :{" "}
                    {money(selected.closing.totals.fixed_cents)} · dépenses
                    variables :{" "}
                    {money(selected.closing.totals.variable_spent_cents)} ·
                    réserve restante :{" "}
                    {money(selected.closing.totals.reserve_remaining_cents)}.
                  </p>
                  <p>
                    Les paramètres initiaux, références, répartitions et
                    décisions sont conservés dans cette archive et dans les
                    sauvegardes JSON. Aucun nouveau budget n’est créé
                    automatiquement.
                  </p>
                </section>
              )}
              <p className="field-help">
                Les catégories ne servent jamais à deviner un rapprochement. Les
                affectations à une réserve sont internes : elles ne sont ni un
                revenu ni une dépense. Les transferts entre comptes ne sont pas
                implémentés dans la V1 et ne sont pas simulés par ce module.
              </p>
              <Link className="text-link" to={base + "/settings"}>
                Sauvegarder tous mes budgets dans les paramètres →
              </Link>
            </>
          )}
        </>
      )}
    </>
  );
}

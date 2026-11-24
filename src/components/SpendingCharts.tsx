import { money, todayISO, totals } from "../lib/finance";
import type { Account, Entry, Category } from "../types/finance";
export default function SpendingCharts({
  entries,
  categories,
  account,
  month,
}: {
  entries: Entry[];
  categories: Category[];
  account: Account | null;
  month: string;
}) {
  const spending = categories
    .map((category) => ({
      ...category,
      total: entries
        .filter(
          (e) =>
            !e.deleted_at &&
            e.type === "expense" &&
            e.date.slice(0, 7) === month &&
            e.category_id === category.id,
        )
        .reduce((sum, e) => sum + e.amount_cents, 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(...spending.map((c) => c.total), 1);
  const year = Number(month.slice(0, 4)),
    monthNumber = Number(month.slice(5));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const points = account
    ? Array.from(
        { length: days },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      )
        .filter((date) => date >= account.reference_date && date <= todayISO())
        .map((date) => ({
          date,
          balance: totals(account, entries, month, date).balance,
        }))
    : [];
  const low = Math.min(...points.map((p) => p.balance), 0),
    high = Math.max(...points.map((p) => p.balance), 1),
    range = high - low || 1;
  const path = points
    .map(
      (point, i) =>
        `${i === 0 ? "M" : "L"} ${28 + (i / Math.max(points.length - 1, 1)) * 444} ${154 - ((point.balance - low) / range) * 128}`,
    )
    .join(" ");
  return (
    <section className="charts-grid">
      <article className="panel">
        <div className="panel-heading">
          <h2>Évolution du solde estimé</h2>
          <span className="small-badge">Fin de journée</span>
        </div>
        {points.length ? (
          <div className="real-chart">
            <svg
              viewBox="0 0 500 184"
              role="img"
              aria-label={`Solde estimé du mois, de ${money(points[0].balance)} à ${money(points[points.length - 1].balance)}. Détails disponibles ci-dessous.`}
            >
              <path
                d="M28 26H472 M28 90H472 M28 154H472"
                fill="none"
                stroke="#e9ede1"
              />
              <path
                d={path}
                fill="none"
                stroke="#557c42"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {points.length === 1 && (
                <circle
                  cx="28"
                  cy={154 - ((points[0].balance - low) / range) * 128}
                  r="4"
                  fill="#557c42"
                />
              )}
            </svg>
            <div className="chart-labels">
              <span>{points[0].date.slice(8)} du mois</span>
              <strong>{money(points[points.length - 1].balance)}</strong>
              <span>{points[points.length - 1].date.slice(8)} du mois</span>
            </div>
            <details>
              <summary>Consulter les valeurs par jour</summary>
              <div className="chart-values">
                {points.map((point) => (
                  <p key={point.date}>
                    <time dateTime={point.date}>{point.date}</time>
                    <span>{money(point.balance)}</span>
                  </p>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <p className="chart-empty">
            Aucune période calculable : configurez une date de référence
            antérieure à la fin de ce mois.
          </p>
        )}
      </article>
      <article className="panel">
        <div className="panel-heading">
          <h2>Dépenses par catégorie</h2>
        </div>
        {spending.length ? (
          <ul className="category-bars">
            {spending.map((category) => (
              <li key={category.id}>
                <div>
                  <span>{category.name}</span>
                  <strong>{money(category.total)}</strong>
                </div>
                <div className="bar-track">
                  <span
                    style={{
                      width: `${(category.total / max) * 100}%`,
                      background: category.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chart-empty">
            Aucune dépense ce mois-ci. Vos catégories apparaîtront après votre
            première dépense.
          </p>
        )}
      </article>
    </section>
  );
}

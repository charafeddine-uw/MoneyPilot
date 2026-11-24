import { useState } from "react";
import { Link } from "react-router";
import { Flag } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { FormFeedback } from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import { centsInput, parseCents, todayISO } from "../lib/finance";
export default function Setup() {
  const { account, base, demo, busy, saveAccount, addCategory, categories } =
    useFinance();
  const [expected, setExpected] = useState(account);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [categoryError, setCategoryError] = useState(""),
    [categoryMessage, setCategoryMessage] = useState("");
  const [oldData] = useState(() => {
    try {
      return Boolean(localStorage.getItem("moneypilot.budget.v1"));
    } catch {
      return false;
    }
  });
  return (
    <>
      <PageHeader
        eyebrow="VOTRE POINT DE DÉPART"
        title="Posons les bases"
        description="Un compte principal, une date de référence et un budget clair."
      />
      {oldData && (
        <p className="feedback info">
          Des données de la V0 existent dans ce navigateur. Elles sont
          préservées, ne sont pas importées dans la V1 et peuvent suivre une
          ancienne règle de calcul. Conservez-en une copie avant toute migration
          manuelle.
        </p>
      )}
      <div className="form-layout">
        <section className="panel form-panel">
          <h2>Votre compte principal</h2>
          <p className="muted">
            {account
              ? "Les transactions restent inchangées lorsque vous ajustez la référence."
              : "Le compte démarre vide, sans les exemples de démonstration."}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const data = new FormData(event.currentTarget);
              setError("");
              setMessage("");
              try {
                const saved = await saveAccount(
                  String(data.get("name")),
                  parseCents(String(data.get("balance")), true),
                  String(data.get("date")),
                  expected,
                );
                setExpected(saved);
                setMessage("Configuration enregistrée.");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label htmlFor="account-name">Nom du compte</label>
              <input
                id="account-name"
                name="name"
                required
                maxLength={80}
                defaultValue={account?.name ?? "Compte principal"}
              />
              <label htmlFor="initial-balance">Solde initial (€)</label>
              <input
                id="initial-balance"
                name="balance"
                type="text"
                inputMode="decimal"
                required
                maxLength={15}
                defaultValue={
                  account ? centsInput(account.initial_balance_cents) : ""
                }
                placeholder="0,00"
                aria-describedby="balance-help"
              />
              <p id="balance-help" className="field-help">
                Le montant disponible à la fin de la date de référence. Un solde
                négatif est accepté.
              </p>
              <label htmlFor="initial-date">
                Date de référence (fin de journée)
              </label>
              <input
                id="initial-date"
                name="date"
                type="date"
                required
                min="1900-01-01"
                max={todayISO()}
                defaultValue={account?.reference_date ?? todayISO()}
              />
              <p className="field-help">
                Seules les opérations strictement après cette date modifient le
                solde estimé. Celles du même jour sont déjà comprises dans votre
                solde de départ.
              </p>
              <FormFeedback error={error} message={message} />
              <button className="button primary form-submit" disabled={busy}>
                {busy ? "Enregistrement…" : "Enregistrer la configuration"}
              </button>
            </fieldset>
          </form>
          {message && (
            <Link className="text-link form-cancel" to={base || "/"}>
              Voir mon tableau de bord →
            </Link>
          )}
        </section>
        <aside className="info-panel">
          <Flag size={23} />
          <h2>Une estimation, pas votre banque.</h2>
          <p>
            Solde estimé = solde initial + revenus − dépenses strictement après
            la référence. Les totaux mensuels incluent toutes les opérations
            enregistrées du mois.
          </p>
          <p>
            {demo
              ? "Vous explorez une démonstration temporaire. Un rechargement rétablit les exemples fictifs."
              : "Vos données sont enregistrées sur cet appareil. Pensez à effectuer régulièrement une sauvegarde pour éviter toute perte."}
          </p>
          <p>
            Les transferts entre comptes et le traitement spécifique des
            remboursements sont exclus de la V1.
          </p>
        </aside>
      </div>
      <section className="panel form-panel category-settings">
        <h2>Vos catégories</h2>
        <p className="muted">
          Toutes les catégories sont conservées sur cet appareil. Gérez-les dans
          les paramètres.
        </p>
        <ul className="category-chips">
          {categories.map((c) => (
            <li key={c.id}>
              {c.name}
              {c.user_id ? " · personnelle" : ""}
            </li>
          ))}
        </ul>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = event.currentTarget;
            setCategoryError("");
            setCategoryMessage("");
            try {
              await addCategory(String(new FormData(form).get("name")));
              form.reset();
              setCategoryMessage("Catégorie ajoutée.");
            } catch (err) {
              setCategoryError((err as Error).message);
            }
          }}
        >
          <label htmlFor="category-name">Nouvelle catégorie</label>
          <div className="action-row">
            <input
              id="category-name"
              name="name"
              maxLength={60}
              required
              placeholder="Ex. : Santé"
              disabled={busy}
            />
            <button className="button primary" disabled={busy}>
              Ajouter
            </button>
          </div>
          <FormFeedback error={categoryError} message={categoryMessage} />
        </form>
      </section>
    </>
  );
}

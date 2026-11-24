import { useEffect, useState } from "react";
import { Link } from "react-router";
import PageHeader from "../components/PageHeader";
import { FormFeedback } from "../components/FinanceUI";
import { useFinance } from "../providers/FinanceProvider";
import { exportCSV } from "../lib/finance";
import { prepareOffline } from "../lib/offline";
import { downloadFile } from "../lib/download";
import { parseBackup } from "../services/localModel";
import type { Backup } from "../services/localModel";
import { transactDocument } from "../services/localDatabase";
import {
  prepareBackup,
  markBackup,
  removeCategory,
  renameCategory,
  resetLocal,
  restoreBackup,
} from "../services/repository";
export default function Settings() {
  const {
    account,
    entries,
    categories,
    budgets,
    recurring,
    longTermBudgets,
    demo,
    base,
    busy,
    refresh,
    addCategory,
  } = useFinance();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [working, setWorking] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null),
    [preview, setPreview] = useState<{
      backup: Backup;
      revision: number;
    } | null>(null);
  const [backupOffered, setBackupOffered] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [resetRevision, setResetRevision] = useState<number | null>(null),
    [resetText, setResetText] = useState("");
  const [offlineMessage, setOfflineMessage] = useState(
    "Préparation des ressources hors ligne…",
  );
  useEffect(() => {
    let active = true;
    void prepareOffline().then((message) => {
      if (active) setOfflineMessage(message);
    });
    return () => {
      active = false;
    };
  }, []);
  const [legacyAvailable] = useState(() => {
    try {
      return localStorage.getItem("moneypilot.budget.v1") !== null;
    } catch {
      return false;
    }
  });
  const disabled = busy || working || demo;
  useEffect(() => {
    if (!demo)
      void transactDocument()
        .then((d) => setLastBackup(d.preferences.lastBackupAt))
        .catch((err) => setError((err as Error).message));
  }, [demo]);
  async function act(action: () => Promise<void>) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function backupCurrent() {
    const { backup, revision } = await prepareBackup();
    downloadFile(
      JSON.stringify(backup, null, 2),
      `moneypilot-sauvegarde-${backup.createdAt.replaceAll(":", "-")}.json`,
      "application/json;charset=utf-8",
    );
    // Le navigateur ne permet pas de vérifier que le fichier a été conservé par la personne.
    const saved = await markBackup(backup.createdAt, revision);
    setLastBackup(backup.createdAt);
    return saved.revision;
  }
  return (
    <>
      <PageHeader
        eyebrow="VOTRE ESPACE LOCAL"
        title="Paramètres"
        description="Vos données et vos sauvegardes, sous votre contrôle."
      />
      <p className="feedback info">
        Vos données sont enregistrées sur cet appareil. Pensez à effectuer
        régulièrement une sauvegarde pour éviter toute perte.
      </p>
      {demo && (
        <p className="feedback info">
          La sauvegarde, la restauration et la réinitialisation sont désactivées
          dans la démonstration pour protéger votre espace personnel.
        </p>
      )}
      <FormFeedback error={error} message={message} />
      {legacyAvailable && (
        <section className="panel form-panel settings-section">
          <h2>Archive de la V0 détectée</h2>
          <p>
            Ces anciennes données sont conservées sans modification. Leur règle
            de calcul peut différer : cette archive est destinée à une migration
            manuelle, elle ne peut pas être restaurée comme une sauvegarde V1.
          </p>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                const raw = localStorage.getItem("moneypilot.budget.v1");
                if (raw === null) throw new Error("Archive V0 indisponible.");
                downloadFile(
                  raw,
                  "moneypilot-archive-v0.json",
                  "application/json;charset=utf-8",
                );
                setMessage(
                  "Archive V0 téléchargée, données originales préservées.",
                );
              })
            }
          >
            Télécharger l’archive V0 originale
          </button>
        </section>
      )}
      <section className="panel form-panel">
        <h2>Informations générales</h2>
        <p role="status">{offlineMessage}</p>
        <p>
          {account?.name ?? "Compte à configurer"} · EUR · {entries.length}{" "}
          transactions · {budgets.length} budgets · {recurring.length}{" "}
          récurrences · {longTermBudgets.length} budgets longue durée
        </p>
        <p className="muted">
          IndexedDB sur ce navigateur. Aucune inscription ni synchronisation
          entre appareils. Le stockage n’est pas chiffré par MoneyPilot : une
          personne ayant accès à ce profil de navigateur peut consulter les
          données. Effacer les données du site ou utiliser la navigation privée
          peut les faire disparaître.
        </p>
        <Link className="button secondary" to={base + "/setup"}>
          Modifier le solde initial et sa date
        </Link>
      </section>
      <section className="panel form-panel settings-section">
        <h2>Sauvegarder mes données</h2>
        <p>
          Le JSON permet une restauration complète sur un autre appareil. Le CSV
          sert à l’analyse dans Excel ou Pandas.
        </p>
        <p>
          Dernier téléchargement JSON déclenché :{" "}
          {lastBackup ? new Date(lastBackup).toLocaleString("fr-BE") : "aucun"}.
          Vérifiez que le fichier se trouve bien dans vos téléchargements et
          conservez-en une copie.
        </p>
        <div className="action-row">
          <button
            className="button primary"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                await backupCurrent();
                setMessage(
                  "Téléchargement lancé. Vérifiez et conservez le fichier JSON.",
                );
              })
            }
          >
            Télécharger la sauvegarde JSON
          </button>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                downloadFile(
                  exportCSV(
                    entries,
                    new Map(categories.map((c) => [c.id, c.name])),
                    account?.name ?? "",
                  ),
                  "moneypilot-transactions.csv",
                  "text/csv;charset=utf-8",
                );
                setMessage("Export CSV téléchargé.");
              })
            }
          >
            Exporter les transactions CSV
          </button>
        </div>
      </section>
      <section className="panel form-panel settings-section">
        <h2>Restaurer une sauvegarde</h2>
        <p>
          La restauration remplace intégralement les données locales. Elle ne
          fusionne pas les transactions et ne modifie aucun autre appareil.
        </p>
        <label htmlFor="backup-file">
          Choisir un fichier JSON MoneyPilot (20 Mo maximum)
        </label>
        <input
          id="backup-file"
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            setPreview(null);
            setBackupOffered(false);
            setConfirmed(false);
            if (!file) return;
            void act(async () => {
              if (file.size > 20_000_000)
                throw new Error("Fichier trop volumineux (20 Mo maximum).");
              const backup = parseBackup(await file.text());
              const current = await transactDocument();
              setPreview({ backup, revision: current.revision });
            });
          }}
        />
        {preview && (
          <div className="restore-preview">
            <h3>Résumé du fichier validé</h3>
            <p>
              Créé le{" "}
              {new Date(preview.backup.createdAt).toLocaleString("fr-BE")} ·{" "}
              {preview.backup.data.account ? "1 compte" : "0 compte"} ·{" "}
              {preview.backup.data.entries.length} transactions ·{" "}
              {preview.backup.data.categories.length} catégories ·{" "}
              {preview.backup.data.budgets.length} budgets ·{" "}
              {preview.backup.data.recurring.length} récurrences ·{" "}
              {preview.backup.data.longTermBudgets.length} budgets longue durée.
            </p>
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() =>
                void act(async () => {
                  const revision = await backupCurrent();
                  setPreview((p) => (p ? { ...p, revision } : null));
                  setBackupOffered(true);
                })
              }
            >
              1. Télécharger une sauvegarde des données actuelles
            </button>
            <label className="confirmation-label">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!backupOffered || disabled}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              J’ai conservé ma sauvegarde actuelle et je confirme son
              remplacement intégral par ce fichier.
            </label>
            <div className="action-row">
              <button
                className="button primary"
                disabled={disabled || !confirmed || !backupOffered}
                onClick={() =>
                  void act(async () => {
                    await restoreBackup(preview.backup, preview.revision);
                    setLastBackup(preview.backup.createdAt);
                    setPreview(null);
                    await refresh();
                    setMessage("Sauvegarde restaurée intégralement.");
                  })
                }
              >
                2. Confirmer la restauration
              </button>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setPreview(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel form-panel settings-section">
        <h2>Catégories</h2>
        <p className="muted">
          Les catégories utilisées sont conservées pour préserver l’historique.
          Vous pouvez les renommer.
        </p>
        {categories.map((c) => (
          <form
            className="category-edit"
            key={c.id}
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              void act(async () => {
                await renameCategory(c.id, name);
                await refresh();
                setMessage("Catégorie renommée.");
              });
            }}
          >
            <label className="sr-only" htmlFor={"category-" + c.id}>
              Nom de la catégorie {c.name}
            </label>
            <input
              key={c.id + c.name}
              id={"category-" + c.id}
              name="name"
              required
              maxLength={60}
              defaultValue={c.name}
              disabled={disabled}
            />
            <button className="button secondary" disabled={disabled}>
              Renommer
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() =>
                void act(async () => {
                  await removeCategory(c.id);
                  await refresh();
                  setMessage("Catégorie inutilisée supprimée.");
                })
              }
            >
              Supprimer
            </button>
          </form>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = String(new FormData(form).get("name"));
            void act(async () => {
              await addCategory(name);
              form.reset();
              setMessage("Catégorie ajoutée.");
            });
          }}
        >
          <label htmlFor="new-category">Nouvelle catégorie</label>
          <div className="action-row">
            <input
              id="new-category"
              name="name"
              required
              maxLength={60}
              disabled={disabled}
            />
            <button className="button primary" disabled={disabled}>
              Ajouter
            </button>
          </div>
        </form>
      </section>
      <section className="panel form-panel settings-section">
        <h2>Réinitialiser cet appareil</h2>
        <p>
          Cette action efface le compte, les transactions, budgets, catégories,
          récurrences et budgets longue durée de cette installation. Les
          anciennes données V0 et Supabase restent intactes.
        </p>
        {resetRevision === null ? (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                const revision = await backupCurrent();
                setResetRevision(revision);
                setResetText("");
              })
            }
          >
            Sauvegarder puis préparer la réinitialisation
          </button>
        ) : (
          <>
            <p className="feedback info">
              Première confirmation : une sauvegarde a été proposée au
              téléchargement. Vérifiez et conservez ce fichier avant de
              continuer.
            </p>
            <label htmlFor="reset-confirm">
              Deuxième confirmation : saisissez EFFACER pour autoriser la
              suppression de toutes les données locales actuelles.
            </label>
            <input
              id="reset-confirm"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              disabled={disabled}
            />
            <div className="action-row">
              <button
                className="button primary"
                disabled={disabled || resetText !== "EFFACER"}
                onClick={() =>
                  void act(async () => {
                    await resetLocal(resetRevision);
                    setResetRevision(null);
                    setLastBackup(null);
                    setPreview(null);
                    await refresh();
                    setMessage("Espace local réinitialisé.");
                  })
                }
              >
                Confirmer l’effacement des données locales
              </button>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setResetRevision(null)}
              >
                Annuler
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

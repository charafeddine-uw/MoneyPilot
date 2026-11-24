import {
  defaultDocument,
  validateSnapshot,
  validatePreferences,
} from "./localModel";
import type { LocalDocument } from "./localModel";
export const DATABASE_NAME = "moneypilot-local-v1";
// Un document structuré dans une transaction IndexedDB : remplacement et récurrence atomiques.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB)
      return reject(
        new Error(
          "IndexedDB indisponible. Utilisez un navigateur avec stockage local autorisé.",
        ),
      );
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents");
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Fermez les autres onglets MoneyPilot puis réessayez."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
export async function transactDocument(
  change?: (current: LocalDocument) => LocalDocument,
): Promise<LocalDocument> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", change ? "readwrite" : "readonly");
    const store = tx.objectStore("documents");
    const request = store.get("personal");
    let result: LocalDocument;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const current = request.result as LocalDocument | undefined;
        const document = current ?? defaultDocument();
        if (
          document.schemaVersion !== undefined &&
          document.schemaVersion !== 2
        )
          throw new Error("Version des données locales incompatible.");
        document.snapshot = validateSnapshot(document.snapshot);
        document.schemaVersion = 2;
        validatePreferences(document.preferences);
        if (!Number.isSafeInteger(document.revision) || document.revision < 0)
          throw new Error("Version locale invalide.");
        result = change ? change(structuredClone(document)) : document;
        if (change) {
          result.snapshot = validateSnapshot(result.snapshot);
          result.preferences = validatePreferences(result.preferences);
          result.revision = document.revision + 1;
          store.put(result, "personal");
        }
      } catch (err) {
        failure = err;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        failure ??
          tx.error ??
          new Error("Échec du stockage local. Aucune modification validée."),
      );
    };
  });
}
export function storageError(err: unknown) {
  return err instanceof Error
    ? `Stockage local : ${err.message}`
    : "Le stockage local est inaccessible. Vos données existantes sont conservées. Réessayez avant de modifier votre budget.";
}

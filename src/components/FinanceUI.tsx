import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useFinance } from "../providers/FinanceProvider";
import { dateLabel, money } from "../lib/finance";
import type { Entry } from "../types/finance";
export function EmptyState({
  title,
  children,
  to,
  label,
}: {
  title: string;
  children: ReactNode;
  to?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
      {to && (
        <Link className="button primary" to={to}>
          {label ?? "Continuer"} <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function EntryList({ entries }: { entries: Entry[] }) {
  const { categories, base } = useFinance();
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <ul className="entry-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link to={`${base}/transactions/${entry.id}`}>
            <span className={`entry-avatar ${entry.type}`}>
              {entry.type === "income" ? "+" : "−"}
            </span>
            <div className="entry-description">
              <strong>
                {entry.description ||
                  names.get(entry.category_id) ||
                  "Transaction"}
              </strong>
              <span>
                {names.get(entry.category_id)} · {dateLabel(entry.date)}
                {entry.type === "expense" &&
                  ` · ${entry.expense_kind === "fixed" ? "Fixe" : "Variable"}`}
              </span>
            </div>
            <strong
              className={entry.type === "income" ? "positive amount" : "amount"}
            >
              {entry.type === "income" ? "+" : "−"}
              {money(entry.amount_cents)}
            </strong>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
export function ConfirmDialog({
  title,
  children,
  onCancel,
  onConfirm,
  busy,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <h2 id="dialog-title">{title}</h2>
      <p>{children}</p>
      <div className="action-row">
        <button
          className="button secondary"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          Annuler
        </button>
        <button className="button primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Enregistrement…" : "Confirmer"}
        </button>
      </div>
    </dialog>
  );
}
export function FormFeedback({
  error,
  message,
}: {
  error: string;
  message?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="feedback success">
          {message}
        </p>
      )}
    </>
  );
}

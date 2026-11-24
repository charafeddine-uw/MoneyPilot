import {
  ArrowDownLeft,
  ShoppingBasket,
  TramFront,
  Clapperboard,
  House,
  BookOpen,
} from "lucide-react";
import type { Transaction } from "../types/transaction";
import { formatDate, formatMoney } from "../lib/format";
const icons = {
  Alimentation: ShoppingBasket,
  Transport: TramFront,
  Loisirs: Clapperboard,
  Logement: House,
  Études: BookOpen,
  Salaire: ArrowDownLeft,
};
export default function TransactionList({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <ul className="transaction-list">
      {transactions.map((transaction) => {
        const Icon =
          icons[transaction.category as keyof typeof icons] ?? ShoppingBasket;
        return (
          <li key={transaction.id}>
            <span className={`transaction-icon ${transaction.type}`}>
              <Icon size={20} aria-hidden="true" />
            </span>
            <div className="transaction-description">
              <strong>{transaction.description}</strong>
              <span>
                {transaction.category}{" "}
                <span className="mobile-date">
                  · {formatDate(transaction.date)}
                </span>
              </span>
            </div>
            <time dateTime={transaction.date} className="transaction-date">
              {formatDate(transaction.date)}
            </time>
            <strong
              className={
                transaction.type === "income" ? "positive amount" : "amount"
              }
            >
              {transaction.type === "income" ? "+" : "−"}
              {formatMoney(transaction.amount)}
            </strong>
          </li>
        );
      })}
    </ul>
  );
}

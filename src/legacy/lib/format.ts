export const formatMoney = (amount: number) =>
  new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" }).format(
    amount,
  );
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("fr-BE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

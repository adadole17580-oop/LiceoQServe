const HISTORY_TYPE_ALIASES = new Map([
  ["queue", "Queue"],
  ["queues", "Queue"],
  ["queue ticket", "Queue"],
  ["queue tickets", "Queue"],
  ["appointment", "Appointment"],
  ["appointments", "Appointment"],
  ["request", "Request"],
  ["requests", "Request"],
  ["reservation", "Reservation"],
  ["reservations", "Reservation"],
  ["room reservation", "Reservation"],
  ["room reservations", "Reservation"],
]);

export function normalizeHistoryType(transactionType) {
  const type = typeof transactionType === "string" ? transactionType.trim() : "";
  if (!type) return "Transaction";

  const normalizedType = type.toLowerCase().replace(/[\s_-]+/g, " ");
  return HISTORY_TYPE_ALIASES.get(normalizedType) || type;
}

export function filterHistoryTransactions(transactions, activeFilter) {
  if (activeFilter === "All") return transactions;

  return transactions.filter((transaction) => (
    normalizeHistoryType(transaction.type ?? transaction.transaction_type) === activeFilter
  ));
}

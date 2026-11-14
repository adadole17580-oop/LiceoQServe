import assert from "node:assert/strict";
import test from "node:test";
import { filterHistoryTransactions, normalizeHistoryType } from "./historyTypes.js";

const transactions = [
  { id: "queue-1", transaction_type: "queue", office: "Cashier" },
  { id: "appointment-1", transaction_type: "APPOINTMENTS", office: "Guidance" },
  { id: "request-1", transaction_type: "Requests", office: "Registrar" },
  { id: "reservation-1", transaction_type: "room_reservation", office: "Library" },
  { id: "book-loan-1", transaction_type: "Book Loan", office: "Library" },
];

test("normalizes the four history categories regardless of case or singular/plural form", () => {
  assert.equal(normalizeHistoryType("queue"), "Queue");
  assert.equal(normalizeHistoryType("APPOINTMENTS"), "Appointment");
  assert.equal(normalizeHistoryType("Requests"), "Request");
  assert.equal(normalizeHistoryType("room_reservation"), "Reservation");
});

test("filters each category without hiding records from All History", () => {
  assert.equal(filterHistoryTransactions(transactions, "All"), transactions);
  assert.deepEqual(
    filterHistoryTransactions(transactions, "Queue"),
    [transactions[0]],
  );
  assert.deepEqual(
    filterHistoryTransactions(transactions, "Appointment"),
    [transactions[1]],
  );
  assert.deepEqual(
    filterHistoryTransactions(transactions, "Request"),
    [transactions[2]],
  );
  assert.deepEqual(
    filterHistoryTransactions(transactions, "Reservation"),
    [transactions[3]],
  );
  assert.deepEqual(filterHistoryTransactions(transactions, "Queue"), [transactions[0]]);
  assert.equal(filterHistoryTransactions(transactions, "Unknown").length, 0);
  assert.equal(transactions.length, 5);
});

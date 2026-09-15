(function (root) {
  'use strict';
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  function date(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return null;
    const parsed = new Date(key + 'T00:00:00Z');
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === key ? parsed : null;
  }
  function days(start, end) { const a = date(start), b = date(end); return a && b && b >= a ? Math.round((b - a) / 86400000) + 1 : 0; }
  function rent(rental, end = rental.returnDate || rental.endDate) {
    const rate = Number(rental.monthlyRate || 0) || Number(rental.dailyRate || 0) * 30;
    if (!rental.returnDate && rental.billingPolicy !== 'calendar-monthly') return round(days(rental.startDate, end) / 30 * rate);
    const first = date(rental.startDate), last = date(end);
    if (!first || !last || last < first) return 0;
    let total = 0;
    for (let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      const endOfMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const from = first > cursor ? first : cursor, to = last < endOfMonth ? last : endOfMonth;
      total += rate * (Math.round((to - from) / 86400000) + 1) / endOfMonth.getUTCDate();
    }
    return round(total);
  }
  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function schedule(rental) {
    if (rental.cancelledAt) return [];
    const start = date(rental.startDate), end = date(rental.returnDate || rental.endDate);
    if (!start || !end || end < start) return [];
    const rate = Number(rental.monthlyRate || 0) || Number(rental.dailyRate || 0) * 30;
    // Anchor every installment to the original start day, so February never shifts later due dates.
    const anniversary = offset => {
      const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
      const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(start.getUTCDate(), lastDay)));
    };
    const rows = [];
    for (let index = 0, from = start; from <= end; from = anniversary(++index)) {
      const next = anniversary(index + 1);
      const to = new Date(Math.min(+end, +next - 86400000));
      rows.push({ dueDate: from.toISOString().slice(0, 10), through: to.toISOString().slice(0, 10), amount: round(rate * ((+to - +from) / 86400000 + 1) / ((+next - +from) / 86400000)) });
    }
    return rows;
  }
  function summary(rental, payments, asOf = today()) {
    const installments = schedule(rental), deposit = rental.cancelledAt ? 0 : Number(rental.deposit || 0);
    const rentCharged = round(installments.reduce((sum, row) => sum + row.amount, 0));
    const received = round(payments.filter(p => String(p.rentalId) === String(rental.id) && (!p.date || p.date <= asOf)).reduce((sum, p) => sum + Number(p.amount || 0), 0));
    const rentDue = round(installments.filter(row => row.dueDate <= asOf).reduce((sum, row) => sum + row.amount, 0));
    const total = round(rentCharged + deposit);
    const billed = round(rentDue + (rental.startDate <= asOf ? deposit : 0));
    let allocated = Math.max(0, received - deposit), nextDueDate = null, nextAmount = 0;
    const allocations = [];
    const allocation = (row, paid, kind) => ({ ...row, kind, paid: round(paid), remaining: round(Math.max(0, row.amount - paid)), status: paid >= row.amount ? 'Paid' : row.dueDate > asOf ? 'Upcoming' : paid > 0 ? 'Partly paid' : row.dueDate < asOf ? 'Overdue' : 'Due today' });
    if (deposit > 0) allocations.push(allocation({ dueDate: rental.startDate, amount: deposit }, Math.min(deposit, Math.max(0, received)), 'Deposit'));
    for (const row of installments) {
      const paid = Math.min(row.amount, allocated);
      allocations.push(allocation(row, paid, 'Rent'));
      const unpaid = round(Math.max(0, row.amount - allocated));
      allocated = Math.max(0, allocated - row.amount);
      const depositUnpaid = row.dueDate === rental.startDate && row.dueDate > asOf ? Math.max(0, deposit - received) : 0;
      if (!nextDueDate && row.dueDate > asOf && unpaid + depositUnpaid > 0) { nextDueDate = row.dueDate; nextAmount = round(unpaid + depositUnpaid); }
    }
    return { allocations, rentCharged, deposit, total, received, due: round(Math.max(0, billed - received)), credit: round(Math.max(0, received - total)), rentDue, futureRent: round(rentCharged - rentDue), remainingBalance: round(Math.max(0, total - received)), nextDueDate, nextAmount };
  }
  const api = { round, date, days, rent, schedule, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RentalMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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
  function summary(rental, payments) {
    const rentCharged = rent(rental), deposit = Number(rental.deposit || 0);
    const received = round(payments.filter(p => String(p.rentalId) === String(rental.id)).reduce((sum, p) => sum + Number(p.amount || 0), 0));
    // Preserve the existing contract's separate deposit obligation. Never mix in business costs.
    const total = round(rentCharged + deposit);
    return { rentCharged, deposit, total, received, due: round(Math.max(0, total - received)), credit: round(Math.max(0, received - total)) };
  }
  const api = { round, date, days, rent, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RentalMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

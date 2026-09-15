const { test } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../rental-math');

test('returned monthly rental is prorated by calendar day without maintenance deductions', () => {
  const rental = { id: 'r1', startDate: '2026-08-01', endDate: '2026-09-30', returnDate: '2026-09-10', monthlyRate: 3000, deposit: 500 };
  const payments = [{ rentalId: 'r1', amount: 1000 }, { rentalId: 'other', amount: 9999 }];
  const summary = math.summary(rental, payments, '2026-09-14');
  for (const [key, value] of Object.entries({ rentCharged: 4000, deposit: 500, total: 4500, received: 1000, due: 3500, credit: 0 })) assert.equal(summary[key], value);
  rental.maintenance = 9000;
  rental.expenses = 9999;
  assert.equal(math.summary(rental, payments).due, 3500);
});

test('six-month contract bills each start-date anniversary, not the whole term', () => {
  const rental = { id: 'six', startDate: '2026-09-14', endDate: '2027-03-13', monthlyRate: 500, deposit: 200 };
  assert.equal(math.schedule(rental).length, 6);
  assert.equal(math.summary(rental, [], '2026-09-13').due, 0);
  const first = math.summary(rental, [], '2026-09-14');
  assert.equal(first.total, 3200); assert.equal(first.due, 700);
  assert.equal(first.nextDueDate, '2026-10-14'); assert.equal(first.futureRent, 2500);
  const payments = [{ rentalId: 'six', date: '2026-09-14', amount: 700 }];
  assert.equal(math.summary(rental, payments, '2026-10-13').due, 0);
  assert.equal(math.summary(rental, payments, '2026-10-14').due, 500);
  assert.equal(math.summary(rental, payments, '2027-03-14').due, 2500);
});

test('anniversaries clamp in February without drifting and prepayments cover future installments', () => {
  const rental = { id: 'end', startDate: '2024-01-31', endDate: '2024-04-29', monthlyRate: 600, deposit: 0 };
  assert.deepEqual(math.schedule(rental).map(row => row.dueDate), ['2024-01-31', '2024-02-29', '2024-03-31']);
  const payments = [{ rentalId: 'end', amount: 1200, date: '2024-01-31' }, { rentalId: 'end', amount: 600, date: '2024-04-01' }];
  const summary = math.summary(rental, payments, '2024-02-01');
  assert.equal(summary.received, 1200); assert.equal(summary.due, 0); assert.equal(summary.nextDueDate, '2024-03-31');
});

test('early return stops future charges and prorates the final anniversary period', () => {
  const rental = { id: 'return', startDate: '2026-09-14', endDate: '2027-03-13', returnDate: '2026-10-23', monthlyRate: 600, deposit: 0 };
  const summary = math.summary(rental, [], '2026-10-23');
  assert.equal(summary.total, 793.55); assert.equal(summary.due, 793.55); // 600 + 10/31 of the next monthly period.
  assert.equal(summary.futureRent, 0); assert.equal(summary.nextDueDate, null);
});

test('same-day, leap-year and DST dates preserve inclusive calendar days', () => {
  assert.equal(math.days('2026-03-07', '2026-03-09'), 3);
  assert.equal(math.rent({ startDate: '2024-02-01', returnDate: '2024-02-29', monthlyRate: 2900 }), 2900);
  assert.equal(math.rent({ startDate: '2026-09-10', returnDate: '2026-09-10', monthlyRate: 3000 }), 100);
  assert.equal(math.date('2026-02-30'), null);
});

test('credits are retained and unreturned historical contracts preserve their calculation', () => {
  const rental = { id: 'r1', startDate: '2026-08-01', endDate: '2026-08-31', monthlyRate: 3000, deposit: 0 };
  assert.equal(math.rent(rental), 3100);
  rental.returnDate = '2026-08-31';
  assert.equal(math.summary(rental, [{ rentalId: 'r1', amount: 3200 }]).credit, 200);
});


test('late payments clear oldest rent first and expose each monthly balance', () => {
  const rental = { id: 'fifo', startDate: '2026-06-30', endDate: '2026-12-31', monthlyRate: 450, deposit: 0 };
  const payments = [{ rentalId: 'fifo', date: '2026-09-10', amount: 600 }, { rentalId: 'other', amount: 1000 }, { rentalId: 'fifo', date: '2026-09-20', amount: 750 }];
  const before = math.summary(rental, payments, '2026-09-09');
  assert.equal(before.received, 0);
  const now = math.summary(rental, payments, '2026-09-14');
  assert.deepEqual(now.allocations.slice(0, 3).map(r => [r.dueDate, r.paid, r.remaining, r.status]), [['2026-06-30', 450, 0, 'Paid'], ['2026-07-30', 150, 300, 'Partly paid'], ['2026-08-30', 0, 450, 'Overdue']]);
  assert.equal(now.due, 750); assert.equal(now.nextDueDate, '2026-09-30');
  assert.equal(now.allocations[3].status, 'Upcoming');
  const later = math.summary(rental, payments, '2026-09-20');
  assert.equal(later.due, 0); assert.deepEqual(later.allocations.slice(0, 3).map(r => r.remaining), [0,0,0]);
  rental.startDate = '2026-07-30';
  assert.equal(math.summary(rental, payments, '2026-09-14').due, 300);
});

test('allocation reconciles deposits, prepayments, return proration and excess credit', () => {
  const rental = { id: 'fifo', startDate: '2026-07-30', endDate: '2026-12-31', returnDate: '2026-09-10', monthlyRate: 450, deposit: 100 };
  const value = math.summary(rental, [{ rentalId: 'fifo', amount: 2000 }], '2026-09-14');
  assert.equal(value.allocations[0].kind, 'Deposit');
  assert.equal(math.round(value.allocations.reduce((s,r) => s+r.paid, 0) + value.credit), value.received);
  assert.ok(value.allocations.every(r => r.remaining === 0));
  rental.cancelledAt = '2026-09-14';
  assert.deepEqual(math.summary(rental, [], '2026-09-14').allocations, []);
});


test('payment history sorts receipts and scopes safe fields while allocating oldest charges first', () => {
  const rental = { id: 'history', startDate: '2026-07-30', endDate: '2026-12-31', monthlyRate: 450, deposit: 0 };
  const payments = [
    { rentalId: 'history', date: '2026-08-10', amount: 400, method: 'Transfer', reference: 'REF2', notes: 'Private staff notes' },
    { rentalId: 'other', date: '2026-08-01', amount: 999 },
    { rentalId: 'history', date: '2026-07-30', amount: 200, method: 'Cash' },
    { rentalId: 'history', date: '2026-09-20', amount: 300 }
  ];
  const value = math.summary(rental, payments, '2026-09-14');
  assert.equal(value.overdue, 300); assert.equal(value.due, 300);
  assert.equal(value.nextDueDate, '2026-09-30'); assert.equal(value.nextAmount, 450);
  assert.equal(value.paymentHistory.length, 2);
  assert.equal(value.paymentHistory[0].date, '2026-07-30');
  assert.deepEqual(value.paymentHistory[1].applied.map(r => [r.dueDate, r.through, r.amount]), [['2026-07-30', '2026-08-29', 250], ['2026-08-30', '2026-09-29', 150]]);
  assert.equal(value.paymentHistory[1].reference, 'REF2');
  assert.equal(value.paymentHistory[1].notes, undefined);
  assert.equal(math.summary(rental, payments, '2026-08-30').overdue, 0);
  assert.equal(math.summary(rental, payments, '2026-08-30').due, 300);
});

test('receipt allocations reconcile deposit, prorated rent and credit', () => {
  const rental = { id: 'history', startDate: '2026-07-30', endDate: '2026-12-31', returnDate: '2026-08-05', monthlyRate: 450, deposit: 100 };
  const value = math.summary(rental, [{ rentalId: 'history', amount: 600 }], '2026-09-14');
  const receipt = value.paymentHistory[0];
  assert.equal(receipt.applied[0].kind, 'Deposit');
  assert.equal(receipt.applied[0].amount, 100);
  assert.equal(receipt.applied[1].through, '2026-08-05');
  assert.equal(math.round(receipt.applied.reduce((sum, r) => sum+r.amount, 0) + receipt.creditApplied), 600);
});


test('ongoing rental renews monthly, carries advances and ends with prorated return', () => {
  const rental = { id: 'ongoing', startDate: '2026-07-30', endDate: '', status: 'active', monthlyRate: 450, deposit: 0 };
  const payments = [{ rentalId: 'ongoing', date: '2026-07-30', amount: 600 }];
  const first = math.summary(rental, payments, '2026-09-14');
  assert.equal(first.ongoing, true); assert.equal(first.due, 300); assert.equal(first.nextDueDate, '2026-09-30'); assert.equal(first.nextAmount, 450);
  assert.equal(math.summary(rental, payments, '2027-01-30').due, 2550);
  const advance = math.summary(rental, [{ rentalId: 'ongoing', date: '2026-07-30', amount: 4500 }], '2026-09-14');
  assert.equal(advance.credit, 0); assert.equal(advance.due, 0); assert.equal(advance.nextDueDate, '2027-05-30');
  rental.returnDate = '2026-09-10'; rental.status = 'closed';
  const returned = math.summary(rental, payments, '2026-09-14');
  assert.equal(returned.ongoing, false); assert.equal(returned.total, 624.19); assert.equal(returned.due, 24.19); assert.equal(returned.nextDueDate, null);
});

test('ongoing month-end anniversaries do not drift and future starts have no current due', () => {
  const rental = { id:'ongoing', startDate:'2024-01-31', monthlyRate:600, status:'active' };
  assert.deepEqual(math.schedule(rental, '2024-03-01').map(row=>row.dueDate), ['2024-01-31','2024-02-29','2024-03-31']);
  assert.equal(math.summary(rental, [], '2024-01-01').due, 0);
  rental.cancelledAt='2024-03-01'; assert.equal(math.summary(rental, [], '2024-03-01').due, 0);
});

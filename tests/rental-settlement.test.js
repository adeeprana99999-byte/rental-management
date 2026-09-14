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

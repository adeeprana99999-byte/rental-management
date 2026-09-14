const { test } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../rental-math');

test('returned monthly rental is prorated by calendar day without maintenance deductions', () => {
  const rental = { id: 'r1', startDate: '2026-08-01', endDate: '2026-09-30', returnDate: '2026-09-10', monthlyRate: 3000, deposit: 500 };
  const payments = [{ rentalId: 'r1', amount: 1000 }, { rentalId: 'other', amount: 9999 }];
  assert.deepEqual(math.summary(rental, payments), { rentCharged: 4000, deposit: 500, total: 4500, received: 1000, due: 3500, credit: 0 });
  rental.maintenance = 9000;
  rental.expenses = 9999;
  assert.equal(math.summary(rental, payments).due, 3500);
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

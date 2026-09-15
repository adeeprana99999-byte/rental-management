const { test } = require('node:test');
const assert = require('node:assert/strict');
const emails = require('../email-notifications');
function data() {
  return { settings: { currency: 'USD', companyName: 'Test Rentals' }, customers: [{ id: 'c', name: 'Renter', email: 'renter@example.test' }], rentals: [{ id: 'ren_1', customerId: 'c', startDate: '2026-09-14', endDate: '2027-03-13', monthlyRate: 500, deposit: 200, status: 'active' }], payments: [] };
}
test('reminder starts three days before monthly due date and excludes future rent and maintenance', () => {
  const fixture = data();
  fixture.expenses = [{ amount: 9000 }];
  assert.equal(emails.messages(fixture, '2026-09-10').length, 0);
  const [reminder] = emails.messages(fixture, '2026-09-11');
  assert.match(reminder.text, /\$700\.00/);
  assert.doesNotMatch(reminder.text, /\$3,200|9,000/);
  assert.equal(reminder.dueDate, '2026-09-14');
  assert.equal(emails.messages(fixture, '2026-09-15').length, 0);
  fixture.payments = [{ rentalId: 'ren_1', amount: 700, date: '2026-09-11' }];
  assert.equal(emails.messages(fixture, '2026-09-12').length, 0);
});
test('only requested positive rental receipts are included, with valid address and customer exclusions', () => {
  const fixture = data();
  fixture.payments = [{ id: 'old', rentalId: 'ren_1', amount: 100, date: '2026-09-14' }, { id: 'new', rentalId: 'ren_1', amount: 200, date: '2026-09-14', emailReceiptRequestedAt: '2026-09-14T00:00:00Z' }, { id: 'maintenance', amount: 800, date: '2026-09-14', emailReceiptRequestedAt: '2026-09-14T00:00:00Z' }];
  const receipts = emails.messages(fixture, '2026-09-15');
  assert.equal(receipts.length, 1); assert.equal(receipts[0].paymentId, 'new');
  fixture.customers[0].emailNotifications = 'off';
  assert.equal(emails.messages(fixture, '2026-09-15').length, 0);
  assert.equal(emails.validEmail('a@example.test\r\nBcc:b@example.test'), false);
  assert.equal(emails.config({}).enabled, false);
});
function fakeDb(fixture) {
  const rows = new Map([['activation', { activatedAt: '2000-01-01T00:00:00Z' }]]);
  return { rows, collection(name) {
    if (name !== 'emailNotifications') return { find: () => ({ toArray: async () => fixture[name] || [] }), findOne: async () => fixture.settings };
    return { updateOne: async (filter, update) => rows.set(filter._id, { ...(rows.get(filter._id) || update.$setOnInsert), ...update.$set }), findOne: async filter => rows.get(filter._id), insertOne: async row => { if (rows.has(row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); rows.set(row._id, row); } };
  } };
}
test('persistent send claims prevent repeats and failures remain reviewable without resending', async () => {
  for (const failing of [false, true]) {
    const fixture = data();
    fixture.rentals[0].status = 'closed';
    fixture.payments = [{ id: 'new', rentalId: 'ren_1', amount: 200, date: '2001-01-01', emailReceiptRequestedAt: '2001-01-01T00:00:00Z' }];
    const db = fakeDb(fixture); let sends = 0;
    const transport = { sendMail: async () => { sends++; if (failing) throw new Error('timeout'); return { accepted: ['renter@example.test'], messageId: 'test' }; } };
    const options = { enabled: true, key: 'test-only', from: 'sender@example.test', timezone: 'America/New_York' };
    await emails.run(db, options, transport); await emails.run(db, options, transport);
    assert.equal(sends, 1);
    assert.equal([...db.rows.values()].find(row => row.kind).status, failing ? 'unknown' : 'accepted');
  }
});
test('disabled email and pre-activation receipts never send', async () => {
  const fixture = data(); fixture.rentals[0].status = 'closed';
  fixture.payments = [{ id: 'old', rentalId: 'ren_1', amount: 100, date: '1999-01-01', emailReceiptRequestedAt: '1999-01-01T00:00:00Z' }];
  const db = fakeDb(fixture); let sends = 0;
  const transport = { sendMail: async () => { sends++; } };
  await emails.run(db, { enabled: false }, transport);
  await emails.run(db, { enabled: true, key: 'test', from: 'sender@example.test', timezone: 'America/New_York' }, transport);
  assert.equal(sends, 0);
});


test('ongoing rentals keep generating renewal reminders in later months', () => {
 const fixture=data(); fixture.rentals[0].endDate='';
 const reminders=emails.messages(fixture,'2027-05-11');
 assert.equal(reminders.length,1); assert.equal(reminders[0].dueDate,'2027-05-14');
 fixture.rentals[0].returnDate='2027-04-20'; fixture.rentals[0].status='closed';
 assert.equal(emails.messages(fixture,'2027-05-11').length,0);
});

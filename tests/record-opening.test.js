const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
// Exercise the real server functions without starting a listener or connecting to MongoDB.
const server = vm.createContext({ require: createRequire(path.join(root, 'server.js')), __dirname: root, process, console, URL, Buffer });
vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8').replace(
  'listen(preferredPort, preferredPort !== fallbackPort);', ''
), server);
const clean = server.cleanMongoDocument;

test('customer rental summary includes only the scoped contract and its payments', () => {
  const rental = { id: 'rental-a', startDate: '2026-09-01', returnDate: '2026-09-10', monthlyRate: 3000, deposit: 0 };
  const visible = server.sanitizeCustomerRental(rental, [{ rentalId: 'rental-a', amount: 400 }, { rentalId: 'other', amount: 99999 }]);
  assert.equal(visible.settlement.rentCharged, 1000);
  assert.equal(visible.settlement.due, 600);
  assert.equal(visible.monthlyRate, undefined);
  assert.equal(visible.payments, undefined);
});

function frontend(data) {
  const app = { innerHTML: '' };
  const events = {};
  const cache = new Map([
    ['rental_management_real_app_v1', JSON.stringify(data)],
    ['rental_management_session_v1', JSON.stringify({ role: 'staff', user: { name: 'Test Staff' } })]
  ]);
  const context = vm.createContext({
    document: { getElementById: () => app, addEventListener: (type, handler) => { events[type] = handler; } },
    localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) },
    RentalMath: require("../rental-math"),
    window: { location: { search: '?view=fleet' } }, URLSearchParams, Intl, console,
    setTimeout: () => 0, clearTimeout() {}, alert: message => { throw new Error(message); }
  });
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.testApp = { saveVehicle, saveCustomer, saveVehicleChange, saveRentalReturn, saveContract }; })();'), context);
  return {
    app,
    saveVehicle: context.testApp.saveVehicle,
    saveCustomer: context.testApp.saveCustomer,
    saveVehicleChange: context.testApp.saveVehicleChange,
    saveRentalReturn: context.testApp.saveRentalReturn,
    saveContract: context.testApp.saveContract,
    savedData: () => JSON.parse(cache.get('rental_management_real_app_v1')),
    click(dataset) {
      // The delegated click handler must also work when a child inside the row is clicked.
      events.click({ target: { closest: selector => selector === '[data-action]' ? { dataset } : null } });
    }
  };
}

const imported = { _id: '6a2a025596bd8c47284493e3', vehicleNumber: 'IMPORT-01', make: 'Toyota', model: 'Corolla', status: 'available', mileage: 100 };
const normal = { _id: 'veh_regular', id: 'veh_regular', unit: 'NORMAL-01', make: 'Honda', model: 'Civic', status: 'available' };
function dataset(vehicles) {
  return { vehicles, customers: [], rentals: [], payments: [], expenses: [], maintenance: [], inspections: [], documents: [], activity: [] };
}

function assignmentData() {
  const data = dataset([{ id: 'old', unit: 'OLD', status: 'rented', mileage: 100 }, { id: 'new', unit: 'NEW', status: 'available', mileage: 20 }]);
  data.customers = [{ id: 'customer', name: 'Existing customer', status: 'active' }];
  data.rentals = [{ id: 'rental', vehicleId: 'old', customerId: 'customer', status: 'active', startDate: '2026-01-01', endDate: '2099-12-31', monthlyRate: 900, deposit: 300 }];
  data.payments = [{ id: 'payment', rentalId: 'rental', customerId: 'customer', vehicleId: 'old', amount: 400 }];
  return data;
}

function contractInput(extra = {}) {
  return { rentalId: 'rental', previousVehicleId: 'old', vehicleId: 'old', name: 'Updated renter', phone: '5551234567', email: 'new@example.test', address: 'New address', license: 'UPDATED-LICENSE', unit: 'UPDATED-CAR', make: 'Toyota', model: 'Corolla', plate: 'NEWPLATE', vin: 'VIN-123', mileage: '150', returnMileage: '150', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRate: '1200', deposit: '250', status: 'active', notes: 'Updated contract', ...extra };
}

test('one contract save updates linked customer, fleet, rental and balance without replacing history', async () => {
  const data = assignmentData();
  data.rentals.push({ ...data.rentals[0], id: 'other', vehicleId: 'elsewhere', status: 'reserved' });
  data.documents = [{ id: 'doc', ownerType: 'rental', ownerId: 'rental', fileName: 'original.pdf' }];
  data.vehicles[0].acquisitionCost = 19000;
  const page = frontend(data);
  page.click({ action: 'edit-contract', id: 'rental' });
  assert.match(page.app.innerHTML, /Save entire contract/);
  await page.saveContract(contractInput());
  const saved = page.savedData();
  assert.equal(saved.customers[0].name, 'Updated renter');
  assert.equal(saved.customers[0].license, 'UPDATED-LICENSE');
  assert.equal(saved.vehicles[0].unit, 'UPDATED-CAR');
  assert.equal(saved.vehicles[0].acquisitionCost, 19000);
  assert.equal(saved.rentals[0].monthlyRate, 1200);
  assert.equal(saved.rentals[1].driverName, 'Updated renter');
  assert.equal(saved.payments[0].amount, 400);
  assert.equal(saved.documents[0].ownerId, 'rental');
  const reloaded = frontend(saved);
  reloaded.click({ action: 'select-rental', id: 'rental' });
  assert.match(reloaded.app.innerHTML, /Updated renter/);
  assert.match(reloaded.app.innerHTML, /UPDATED-CAR/);
  assert.equal(server.sanitizeCustomerRental(saved.rentals[0], saved.payments).settlement.received, 400);
});

test('invalid contract edits leave every record unchanged', async () => {
  for (const invalid of [{ endDate: '2025-01-01' }, { monthlyRate: '-1' }, { mileage: '50' }, { previousVehicleId: 'stale' }, { status: 'closed' }, { vehicleId: 'new', unit: 'NEW', mileage: '100', returnMileage: '50' }]) {
    const page = frontend(assignmentData());
    const before = page.savedData();
    await assert.rejects(page.saveContract(contractInput(invalid)));
    assert.deepEqual(page.savedData(), before);
  }
});

test('contract vehicle swap keeps payment attribution and releases previous car', async () => {
  const page = frontend(assignmentData());
  await page.saveContract(contractInput({ vehicleId: 'new', unit: 'NEW', mileage: '100' }));
  const saved = page.savedData();
  assert.equal(saved.rentals[0].vehicleId, 'new');
  assert.equal(saved.vehicles[0].status, 'available');
  assert.equal(saved.vehicles[1].status, 'rented');
  assert.equal(saved.payments[0].vehicleId, 'old');
  assert.equal(saved.rentals[0].vehicleChanges.length, 1);
});

test('vehicle change preserves the contract, linked payment and old vehicle history after reload', () => {
  const data = assignmentData();
  const page = frontend(data);
  page.click({ action: 'select-customer', id: 'customer' });
  assert.match(page.app.innerHTML, />Assign vehicle</);
  assert.match(page.app.innerHTML, />Change vehicle</);
  page.click({ action: 'change-vehicle', id: 'rental' });
  assert.match(page.app.innerHTML, /Replacement vehicle/);
  page.saveVehicleChange({ rentalId: 'rental', previousVehicleId: 'old', vehicleId: 'new', returnMileage: 150, notes: 'Swap for service' });
  const saved = page.savedData();
  assert.equal(saved.rentals[0].vehicleId, 'new');
  for (const key of ['id', 'customerId', 'monthlyRate', 'deposit', 'startDate', 'endDate', 'status']) assert.equal(saved.rentals[0][key], data.rentals[0][key]);
  assert.equal(saved.payments[0].vehicleId, 'old');
  assert.equal(saved.payments[0].amount, 400);
  assert.equal(saved.vehicles[0].status, 'available');
  assert.equal(saved.vehicles[0].mileage, 150);
  assert.equal(saved.vehicles[1].status, 'rented');
  assert.equal(saved.rentals[0].vehicleChanges[0].fromVehicleId, 'old');
  const reloaded = frontend(saved);
  reloaded.click({ action: 'select-rental', id: 'rental' });
  assert.match(reloaded.app.innerHTML, /Vehicle change history/);
  assert.match(reloaded.app.innerHTML, /Swap for service/);
  assert.throws(() => reloaded.saveRentalReturn({ rentalId: 'rental', returnDate: '2026-01-01', returnMileage: 200 }), /before the last vehicle change/);
});

test('replacement rejects reserved, occupied, maintenance and stale choices without changing records', () => {
  for (const kind of ['reserved', 'active', 'maintenance', 'stale', 'mileage']) {
    const data = assignmentData();
    if (kind === 'reserved' || kind === 'active') data.rentals.push({ id: 'conflict', vehicleId: 'new', customerId: 'other', status: kind, startDate: '2026-01-01', endDate: '2099-12-31' });
    if (kind === 'maintenance') data.maintenance.push({ id: 'service', vehicleId: 'new', status: 'scheduled' });
    const page = frontend(data);
    assert.throws(() => page.saveVehicleChange({ rentalId: 'rental', previousVehicleId: kind === 'stale' ? 'outdated' : 'old', vehicleId: 'new', returnMileage: kind === 'mileage' ? 99 : 150 }));
    assert.equal(page.savedData().rentals[0].vehicleId, 'old');
    assert.equal(page.savedData().payments[0].amount, 400);
  }
});

test('released car stays in maintenance and unavailable replacements show a clear empty state', () => {
  const data = assignmentData();
  data.maintenance = [{ id: 'service', vehicleId: 'old', status: 'in_progress' }];
  const page = frontend(data);
  page.saveVehicleChange({ rentalId: 'rental', previousVehicleId: 'old', vehicleId: 'new', returnMileage: 150 });
  assert.equal(page.savedData().vehicles[0].status, 'maintenance');
  page.click({ action: 'change-vehicle', id: 'rental' });
  assert.match(page.app.innerHTML, /No available replacement vehicles/);
  assert.match(page.app.innerHTML, /disabled>Confirm vehicle change/);
});

test('database mapping preserves imported identity, labels, and string reference types', () => {
  const mapped = clean(imported);
  assert.equal(mapped.id, imported._id);
  assert.equal(mapped.unit, imported.vehicleNumber);
  assert.equal(mapped.vehicleNumber, imported.vehicleNumber);
  assert.equal(mapped._id, undefined);
  assert.equal(imported.id, undefined, 'mapping must not mutate the stored record');
  assert.equal(clean(normal).id, normal.id);
  assert.equal(clean({ _id: 'db-key', id: 42, vehicleId: 7 }).id, '42');
  assert.equal(clean({ _id: 'db-key', id: 0, vehicleId: 0 }).vehicleId, '0');
  assert.equal(clean({ _id: 'fallback', id: '' }).id, 'fallback');
  const { ObjectId } = createRequire(path.join(root, 'server.js'))('mongodb');
  const objectId = new ObjectId(imported._id);
  assert.equal(clean({ _id: objectId, vehicleId: objectId }).id, imported._id);
  assert.equal(clean({ _id: objectId, vehicleId: objectId }).vehicleId, imported._id);
  assert.equal(clean({ ...imported, unit: 'EXPLICIT' }).unit, 'EXPLICIT');
});

test('imported and normal cards open the correct profile through the actual delegated handler', () => {
  const page = frontend(dataset([clean(imported), clean(normal)]));
  for (const [id, label] of [[imported._id, 'IMPORT-01'], [normal.id, 'NORMAL-01']]) {
    assert.ok(page.app.innerHTML.includes(`data-id="${id}"`));
    page.click({ action: 'select-vehicle', id });
    assert.match(page.app.innerHTML, /class="profile-header"/);
    assert.ok(page.app.innerHTML.includes(`<span class="plate">${label}</span>`));
    page.click({ action: 'vehicle-tab', tab: 'info' });
    assert.match(page.app.innerHTML, /Ownership/);
    page.click({ action: 'back-to-list', list: 'fleet' });
    assert.match(page.app.innerHTML, /Choose a car/);
  }
});

test('new vehicle creation and reopening still work', () => {
  const page = frontend(dataset([clean(imported), clean(normal)]));
  page.saveVehicle({ unit: 'NEW-01', make: 'Ford', model: 'Focus', vin: '', plate: '', status: 'available', location: '', color: '' });
  assert.ok(page.app.innerHTML.includes('<span class="plate">NEW-01</span>'));
  page.click({ action: 'back-to-list', list: 'fleet' });
  const id = page.app.innerHTML.match(/data-action="select-vehicle" data-id="([^"]+)"/)[1];
  assert.match(id, /^veh_/);
  page.click({ action: 'select-vehicle', id });
  assert.ok(page.app.innerHTML.includes('<span class="plate">NEW-01</span>'));
});

test('mapped imported relationships support customer and rental navigation', () => {
  const data = dataset([clean(imported)]);
  data.customers = [clean({ _id: 17, name: 'Imported Customer', status: 'active' })];
  data.rentals = [clean({ _id: 23, vehicleId: imported._id, customerId: 17, startDate: '2026-09-01', endDate: '2026-10-01', status: 'active', monthlyRate: 900 })];
  data.expenses = [clean({ _id: 29, vehicleId: imported._id, amount: 50 })];
  assert.equal(data.expenses[0].vehicleId, data.vehicles[0].id);
  const page = frontend(data);
  page.click({ action: 'select-customer', id: '17' });
  assert.match(page.app.innerHTML, /class="profile-header"/);
  assert.match(page.app.innerHTML, /Imported Customer/);
  page.click({ action: 'select-rental', id: '23' });
  assert.match(page.app.innerHTML, /REN-23/);
  assert.match(page.app.innerHTML, /IMPORT-01/);
});

test('vehicle editing prefills legacy values, cancels safely, and updates without breaking links', () => {
  const data = dataset([clean({ ...imported, status: 'active', legacyNote: 'preserve me' }), clean(normal)]);
  data.expenses = [{ id: 'expense-linked', vehicleId: imported._id, amount: 10 }];
  const page = frontend(data);
  page.click({ action: 'select-vehicle', id: imported._id });
  page.click({ action: 'edit-vehicle', id: imported._id });
  assert.match(page.app.innerHTML, /<h2>Edit vehicle<\/h2>/);
  assert.match(page.app.innerHTML, /name="unit"[^>]*value="IMPORT-01"/);
  assert.match(page.app.innerHTML, /value="active" selected/);
  assert.match(page.app.innerHTML, /name="vin"[^>]*value=""\s+>/);
  page.click({ action: 'close-modal' });
  assert.equal(page.savedData().vehicles[0].unit, 'IMPORT-01');
  page.click({ action: 'edit-vehicle', id: imported._id });
  page.saveVehicle({ editVehicleId: imported._id, unit: 'CORRECTED-01', make: 'VW', model: 'Tiguan', year: '2012', vin: '', plate: '', status: 'active', mileage: '1234', location: 'Yard', color: 'Blue', nextService: '', insuranceExpiry: '' });
  const saved = page.savedData();
  assert.equal(saved.vehicles.length, 2);
  assert.equal(saved.vehicles[0].id, imported._id);
  assert.equal(saved.vehicles[0].legacyNote, 'preserve me');
  assert.equal(saved.vehicles[0].mileage, 1234);
  assert.equal(saved.expenses[0].vehicleId, imported._id);
  const reloaded = frontend(saved);
  reloaded.click({ action: 'select-vehicle', id: imported._id });
  assert.match(reloaded.app.innerHTML, /<span class="plate">CORRECTED-01<\/span>/);
  assert.throws(() => page.saveVehicle({ editVehicleId: 'missing' }), /no longer exists/);
});

test('imported identities survive the existing database save and reload path', async () => {
  const storage = new Map();
  const collection = {
    bulkWrite: async operations => operations.forEach(({ replaceOne: op }) => storage.set(op.filter._id, op.replacement)),
    deleteMany: async query => {
      for (const id of storage.keys()) if (!query._id.$nin.includes(id)) storage.delete(id);
    }
  };
  await server.replaceCollection({ collection: () => collection }, 'vehicles', [clean(imported), clean(normal)]);
  assert.equal(storage.size, 2);
  assert.ok(storage.has(imported._id));
  const page = frontend(dataset([...storage.values()].map(clean)));
  page.click({ action: 'select-vehicle', id: imported._id });
  assert.ok(page.app.innerHTML.includes('<span class="plate">IMPORT-01</span>'));
});

test('customer editing prefills, cancels, and preserves linked records after save and reload', () => {
  const data = dataset([clean(normal)]);
  data.customers = [{ id: 'customer-imported', name: 'Original Name', phone: '3125550100', status: 'legacy', legacyNote: 'keep' }, { id: 'customer-other', name: 'Other', phone: '3125550101' }];
  data.rentals = [{ id: 'rental-linked', customerId: 'customer-imported', vehicleId: normal.id, status: 'active', startDate: '2026-09-01', endDate: '2026-10-01' }];
  data.documents = [{ id: 'document-linked', ownerType: 'customer', ownerId: 'customer-imported', type: 'Driver license', fileName: 'license.pdf' }];
  const page = frontend(data);
  page.click({ action: 'select-customer', id: 'customer-imported' });
  page.click({ action: 'edit-customer', id: 'customer-imported' });
  assert.match(page.app.innerHTML, /<h2>Edit customer<\/h2>/);
  assert.match(page.app.innerHTML, /name="name"[^>]*value="Original Name"/);
  assert.match(page.app.innerHTML, /value="legacy" selected/);
  assert.match(page.app.innerHTML, /name="license"[^>]*value=""\s+>/);
  page.click({ action: 'close-modal' });
  assert.equal(page.savedData().customers[0].name, 'Original Name');
  const correction = { editCustomerId: 'customer-imported', name: 'Corrected Name', phone: '3125550100', email: 'corrected@example.com', license: '', status: 'active', address: 'New address', notes: 'Corrected' };
  assert.throws(() => page.saveCustomer({ ...correction, phone: '(312) 555-0101' }), /already used/);
  page.saveCustomer(correction);
  const saved = page.savedData();
  assert.equal(saved.customers.length, 2);
  assert.equal(saved.customers[0].name, 'Corrected Name');
  assert.equal(saved.customers[0].legacyNote, 'keep');
  assert.equal(saved.rentals[0].customerId, 'customer-imported');
  assert.equal(saved.documents[0].ownerId, 'customer-imported');
  const reloaded = frontend(saved);
  reloaded.click({ action: 'select-customer', id: 'customer-imported' });
  assert.match(reloaded.app.innerHTML, /Corrected Name/);
  assert.throws(() => page.saveCustomer({ editCustomerId: 'missing' }), /no longer exists/);
  page.saveCustomer({ ...correction, editCustomerId: '', name: 'New Customer', phone: '3125550102' });
  assert.equal(page.savedData().customers.length, 3);
  assert.match(page.savedData().customers[0].id, /^cus_/);
});

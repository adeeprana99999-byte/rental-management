// Run against a local static app: NODE_PATH must contain Playwright, or install it in your test environment.
// Every API request is intercepted. These fixtures never write live customer data or send email.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webkit, chromium } = require('playwright');
const math = require('../rental-math');
const email = require('../email-notifications');
const base = process.env.TEST_APP_URL || 'http://127.0.0.1:4341';
const results = [];
async function test(engine, width) {
  let saved = { settings: { companyName: 'Linkage test', currency: 'USD', location: 'Test desk' }, customers: [{ id: 'test-c', name: 'Linkage Customer', phone: '5551112222', email: 'test@example.test', address: 'Test address', license: 'TESTLICENSE', status: 'active' }], vehicles: [{ id: 'test-v1', unit: 'TEST-ONE', make: 'Toyota', model: 'Corolla', status: 'available', mileage: 100 }, { id: 'test-v2', unit: 'TEST-TWO', make: 'Honda', model: 'Civic', status: 'available', mileage: 50 }], rentals: [], payments: [], expenses: [], maintenance: [], inspections: [], documents: [], activity: [] };
  let customerMode = false;
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : {}));
  const page = await browser.newPage({ viewport: { width, height: width === 844 ? 390 : 844 }, serviceWorkers: 'block' });
  await page.clock.install({time:new Date('2026-09-14T12:00:00')});
  page.setDefaultTimeout(10000); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(dialog.message()); void dialog.dismiss(); });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/data') {
      if (route.request().method() === 'POST') saved = route.request().postDataJSON();
      const data = structuredClone(saved);
      if (customerMode) { data.rentals = data.rentals.map(r => ({ ...r, settlement: math.summary(r, data.payments) })); data.payments = []; data.expenses = []; data.maintenance = []; }
      return route.fulfill({ json: { data, user: { role: customerMode ? 'customer' : 'staff', name: 'Test staff' }, status: { connected: true } } });
    }
    if (url.pathname === '/api/email-notifications') return route.fulfill({ json: { enabled: false, from: 'test@example.test', drafts: email.messages(saved, '2026-09-14').filter(r => r.rentalId === url.searchParams.get('rentalId')).map(r => ({ ...r, status: 'preview' })), history: [] } });
    return route.fulfill({ status: 400, json: { error: 'Unexpected API call in isolated test' } });
  });
  const go = async view => { await page.goto(`${base}/?view=${view}`); await page.waitForTimeout(200); };
  const save = async type => { await page.locator(`[data-form="${type}"] button.primary-add`).click(); await page.waitForTimeout(350); };
  const field = async (name, value) => page.locator(`[name="${name}"]`).fill(String(value));
  const openRental = async () => { await go('rentals'); await page.locator(`[data-action=select-rental][data-id="${saved.rentals[0].id}"]`).first().click(); };
  const checkDetails = async () => {
    const box = page.locator('details.more-details').first();
    await box.waitFor(); assert.equal(await box.getAttribute('open'), null);
    await box.locator('summary').click(); assert.equal(await box.evaluate(el => el.open), true);
    assert(await box.locator('.detail-grid, .customer-grid').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'expanded details overflow');
    await box.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await box.evaluate(el => el.open), false);
  };
  await go('fleet'); await page.locator('[data-action=select-vehicle][data-id=test-v1]').first().click(); await checkDetails();
  await go('customers'); await page.locator('[data-action=select-customer][data-id=test-c]').click(); await checkDetails();
  await page.getByRole('button', { name: 'Assign vehicle', exact: true }).click();
  await page.locator('[name=vehicleId]').selectOption('test-v1');
  for (const [name, value] of Object.entries({ startDate: '2026-09-01', endDate: process.env.TEST_ONGOING ? '' : '2026-10-01', monthlyRate: 600, deposit: 100, licenseExpiry: '2027-09-01', insuranceCompany: 'Test insurer', insurancePolicy: 'TESTPOLICY', insuranceExpiry: '2027-09-01' })) await field(name, value);
  assert.equal(await page.locator('[name=endDate]').getAttribute('required'), null);
  await save('rental'); if (process.env.TEST_ONGOING) { assert.equal(saved.rentals[0].endDate, ''); assert.match(await page.locator('.rental-profile').innerText(), /Ongoing/); } assert.equal(saved.rentals.length, 1); assert.equal(saved.customers.length, 1); const rentalId = saved.rentals[0].id;
  await page.getByRole('button', { name: 'Edit contract', exact: true }).click(); await field('name', 'Updated Linkage Customer'); await field('unit', 'UPDATED-ONE'); if (process.env.TEST_ONGOING) assert.equal(await page.locator('[name=endDate]').inputValue(), ''); await save('contract');
  assert.equal(saved.customers[0].name, 'Updated Linkage Customer'); assert.equal(saved.vehicles[0].unit, 'UPDATED-ONE');
  await page.getByRole('button', { name: 'Actions', exact: true }).click(); await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await field('amount', 100); await field('date', '2026-09-14'); await save('payment');
  assert.equal(saved.payments[0].rentalId, rentalId); assert(saved.payments[0].emailReceiptRequestedAt);
  await openRental(); await checkDetails();
  await page.getByRole('heading', { name: 'Account summary', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Payment history', exact: true }).waitFor();
  assert.equal(await page.locator('.installment-breakdown table').count(), 3);
  assert.equal(await page.locator('.installment-breakdown table').nth(2).locator('tbody tr').count(), 1);
  const paymentId = saved.payments[0].id;
  await page.locator('[data-action=correct-payment][data-operation=edit]').first().click();
  await field('amount',120); await field('reason','Correct amount'); await save('payment-correction');
  assert.equal(saved.payments[0].amount,120); assert.equal(saved.payments[0].corrections[0].before.amount,100);
  await page.locator('[data-action=correct-payment][data-operation=void]').first().click(); await field('reason','Duplicate entry'); await save('payment-correction');
  assert.ok(saved.payments[0].voidedAt); assert.equal(math.summary(saved.rentals[0], saved.payments).received,0);
  await page.locator('summary').filter({hasText:'Payment corrections / voided entries'}).click();
  await page.getByRole('button',{name:'Restore payment',exact:true}).click(); await field('reason','Restore test receipt'); await save('payment-correction');
  assert.equal(saved.payments[0].voidedAt,undefined);
  await page.locator('[data-action=correct-payment][data-operation=edit]').first().click(); await field('amount',100); await field('reason','Restore original test amount'); await save('payment-correction');
  assert.equal(saved.payments[0].id,paymentId); assert.equal(saved.payments[0].corrections.length,4);

  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'contract billing overflow');
  await page.getByRole('button', { name: 'Change vehicle', exact: true }).click(); await page.locator('[name=vehicleId]').selectOption('test-v2'); await field('returnMileage', 150); await save('change-vehicle');
  assert.equal(saved.rentals[0].vehicleId, 'test-v2'); assert.equal(saved.payments[0].vehicleId, 'test-v1');
  await page.getByRole('button', { name: 'Actions', exact: true }).click(); await page.locator('.context-menu').getByRole('button', { name: 'Add file', exact: true }).click();
  await page.locator('[name=type]').selectOption('Driver license');
  await page.locator('input[name=file]').setInputFiles({ name: 'test-licence.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }); await save('document');
  assert.equal(saved.documents[0].ownerId, rentalId);
  await page.getByRole('button', { name: 'Return vehicle', exact: true }).first().click(); await field('returnDate', '2026-09-14'); await field('returnMileage', 80); await save('return');
  assert.equal(saved.rentals[0].status, 'closed'); await page.getByText('No upcoming installments. Unpaid balance: $280', { exact: true }).waitFor(); assert.equal(saved.vehicles[1].status, 'available'); assert.equal(math.summary(saved.rentals[0], saved.payments).due, 280);
  await go('customers'); assert.equal(await page.locator('[data-action=select-customer][data-id=test-c]').count(), 0);
  await page.getByRole('button', { name: 'Closed / archived', exact: true }).click(); await page.locator('[data-action=select-customer][data-id=test-c]').click();
  await page.getByRole('button', { name: 'Actions', exact: true }).click(); await page.getByRole('button', { name: 'Restore / delete customer', exact: true }).click(); await page.getByRole('button', { name: 'Restore to current list', exact: true }).click(); await page.waitForTimeout(350);
  assert.equal(saved.rentals[0].status, 'closed');
  await go('rentals'); await page.getByRole('button', { name: 'Closed', exact: true }).click(); await page.getByRole('button', { name: 'Pay', exact: true }).click(); await field('date', '2026-09-14'); await field('amount', 280); await save('payment'); assert.equal(math.summary(saved.rentals[0], saved.payments).due, 0);
  for (const view of ['dashboard', 'fleet', 'rentals', 'customers', 'documents', 'finance', 'reports', 'alerts', 'settings']) { await go(view); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${view} ${width}: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".content *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(e => ({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.innerText?.slice(0,40)}))))}`); }
  await go('documents'); await page.locator('footer [data-action=open-document]').first().click(); await page.waitForFunction(() => document.querySelector('.document-preview-image')?.naturalWidth > 0, null, { timeout: 5000 });
  await page.locator('[data-action=close-modal]').first().click();
  await go('fleet');await page.locator('[data-action=select-vehicle][data-id=test-v2]').first().click();
  await page.getByRole('button',{name:'Record registration renewal',exact:true}).click();
  await field('plate','TEST-PLATE');await field('date','2026-09-14');await field('expiryDate','2027-09-14');await field('cost',120);
  await page.locator('input[name=file]').setInputFiles({name:'registration.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')});await save('vehicle-renewal');
  assert.equal(saved.vehicles[1].registrationExpiry,'2027-09-14');assert.equal(saved.expenses.filter(e=>e.category==='Registration renewal').length,1);
  await page.locator('.vehicle-renewals').getByRole('button',{name:'Open document',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.document-preview-image')?.naturalWidth>0);await page.locator('[data-action=close-modal]').first().click();
  await page.getByRole('button',{name:'Record insurance renewal',exact:true}).click();await field('provider','Test Insurer');await field('policy','POLICY-123');await field('date','2026-09-14');await field('expiryDate','2026-10-01');await save('vehicle-renewal');
  assert.equal(saved.vehicles[1].insurancePolicy,'POLICY-123');assert.equal(saved.vehicles[1].renewalHistory.length,2);assert.equal(math.summary(saved.rentals[0],saved.payments).due,0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'renewal card overflow');
  saved.rentals.push({ ...saved.rentals[0], id: 'second-contract', status: 'active', returnDate: undefined, vehicleId: 'test-v1' }); customerMode = true;
  await go('rentals'); await page.locator('[data-portal-rental]').selectOption(rentalId); assert.equal(await page.locator('[data-form=customer-checkin]').count(), 0);
  await page.getByRole('heading', { name: 'Payment history', exact: true }).waitFor(); await checkDetails();
  assert.equal(await page.locator('[data-action=correct-payment]').count(),0);
  await page.getByText('No payment remaining', { exact: true }).waitFor();
  assert.equal(await page.getByText('Credit above contract', { exact: true }).count(), 0);
  assert.equal(await page.locator('.installment-breakdown table').nth(2).locator('tbody tr').count(), 2);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'customer billing overflow');
  await page.locator('[data-portal-rental]').selectOption('second-contract'); await page.locator('[data-form=customer-checkin]').waitFor();
  assert.deepEqual(errors, []); results.push({ engine, width, passed: true }); console.log(`${engine} ${width}: full linkage flow passed`); await browser.close();
}
(async () => { for (const engine of process.env.TEST_ENGINE ? [process.env.TEST_ENGINE] : ['webkit', 'chromium']) for (const width of process.env.TEST_WIDTH ? [Number(process.env.TEST_WIDTH)] : [320,390,430,844,1440]) await test(engine, width); if (process.env.TEST_REPORT) fs.writeFileSync(process.env.TEST_REPORT, JSON.stringify(results, null, 2)); })().catch(error => { console.error(error); process.exit(1); });

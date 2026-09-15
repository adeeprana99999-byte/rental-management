const assert = require('node:assert/strict');
const { webkit, chromium } = require('playwright');
const path = require('node:path');
const data = { settings: { currency: 'USD' }, vehicles: [{ id:'v', unit:'TEST-001', make:'Toyota', model:'Camry', status:'rented', mileage:100 }], customers:[{id:'c',name:'Test Customer',phone:'5551234567',status:'active'}], rentals:[{id:'r',customerId:'c',vehicleId:'v',startDate:'2026-09-01',endDate:'2026-12-31',monthlyRate:1500,deposit:0,status:'active'}], payments:[{id:'p1',rentalId:'r',customerId:'c',vehicleId:'v',date:'2026-09-03',amount:600,method:'ACH',reference:'ACH-TEST'},{id:'p2',rentalId:'r',customerId:'c',vehicleId:'v',date:'2026-09-01',amount:464,method:'Card'}], expenses:[{id:'e1',vehicleId:'v',date:'2026-09-04',category:'Repair',amount:410,status:'pending',paymentMethod:'Card'},{id:'e2',vehicleId:'v',date:'2026-09-03',category:'Fuel',amount:76,status:'paid',paymentMethod:'Fleet card'},{id:'e3',vehicleId:'v',date:'2026-09-02',category:'Cleaning',amount:38,status:'paid',paymentMethod:'Fleet card'}], maintenance:[],inspections:[],documents:[],activity:[] };
data.vehicles.push({id:'v2',unit:'TEST-002',make:'Honda',model:'Fit',status:'inactive'});
data.customers.push({id:'c2',name:'Second Customer',status:'inactive'});
data.rentals.push({id:'r2',vehicleId:'v2',customerId:'c2',startDate:'2026-07-01',endDate:'2026-07-31',returnDate:'2026-07-31',monthlyRate:400,status:'closed'});
data.payments.push({id:'p3',vehicleId:'v2',customerId:'c2',rentalId:'r2',date:'2026-07-10',amount:333,method:'Cash'});
data.expenses[2].rentalId='r';
(async () => {
 for (const [engine,width] of [['webkit',320],['webkit',390],['chromium',1440]]) {
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({executablePath:process.env.EDGE_PATH}));
  try {
   const page = await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**', route => route.fulfill({json:{data,user:{role:'staff',name:'Test Staff'},status:{connected:true}}}));
   await page.goto('http://127.0.0.1:4341/?view=finance');
   await page.locator('[data-finance-month]').fill('2026-09');await page.locator('[data-finance-month]').press('Tab');
   await page.locator('.finance-result-amount').filter({hasText:'$540'}).waitFor();
   assert.match(await page.locator('.finance-equation').innerText(), /\$950/);
   assert.equal(await page.locator('.finance-ledger tbody tr').count(),5);
   assert.equal(await page.getByText('ACH-TEST',{exact:true}).count(),1);
   assert.match(await page.locator('.finance-ledger').innerText(),/Received/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'page overflow');
   if(process.env.FINANCE_SCREENSHOTS) await page.screenshot({path:path.join(process.env.FINANCE_SCREENSHOTS,`finance-${width}.png`),fullPage:true});
   await page.locator('[data-finance-vehicle]').selectOption('v');assert.equal(await page.locator('.finance-result-amount').innerText(),'$540');
   await page.locator('[data-finance-customer]').selectOption('c');assert.equal(await page.locator('.finance-result-amount').innerText(),'$1,026');assert.equal(await page.locator('.finance-ledger tbody tr').count(),3);
   assert.equal(await page.locator('.finance-kpis .metric').filter({hasText:'Customers owe'}).locator('b').innerText(),'$436');
   await page.locator('[data-finance-vehicle]').selectOption('v2');assert.equal(await page.locator('.finance-result-amount').innerText(),'$0');assert.equal(await page.locator('.finance-ledger tbody tr').count(),0);
   await page.locator('[data-finance-customer]').selectOption('c2');
   await page.locator('[data-finance-month]').fill('2026-07');await page.locator('[data-finance-month]').press('Tab');assert.equal(await page.locator('.finance-result-amount').innerText(),'$333');
   assert.equal(await page.locator('.finance-kpis .metric').filter({hasText:'Customers owe'}).locator('b').innerText(),'$67');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'filter overflow');
   await page.locator('[data-action=clear-finance-entities]').click();assert.equal(await page.locator('[data-finance-vehicle]').inputValue(),'');assert.equal(await page.locator('[data-finance-customer]').inputValue(),'');assert.equal(await page.locator('[data-finance-month]').inputValue(),'2026-07');
   await page.locator('[data-finance-month]').fill('2026-09');await page.locator('[data-finance-month]').press('Tab');
   await page.locator('[data-action=finance-filter][data-filter=expense]').click();assert.equal(await page.locator('.finance-ledger tbody tr').count(),3);
   assert.equal(await page.locator('.finance-result-amount').innerText(),'$540');
   await page.locator('[data-action=finance-filter][data-filter=income]').click();assert.equal(await page.locator('.finance-ledger tbody tr').count(),2);
   await page.locator('[data-finance-month]').fill('2026-08');await page.locator('[data-finance-month]').press('Tab');await page.getByText('No transactions in this period.',{exact:true}).waitFor();assert.equal(await page.locator('.finance-result-amount').innerText(),'$0');
   await page.locator('[data-finance-month]').fill('2026-09');await page.locator('[data-finance-month]').press('Tab');
   await page.locator('[data-action=open-add][data-type=payment]').click();await page.locator('[data-form=payment]').waitFor();await page.locator('[data-action=close-modal]').first().click();
   await page.locator('[data-action=open-add][data-type=expense]').click();await page.locator('[data-form=expense]').waitFor();
   const originalCount=data.payments.length;
   for(let i=0;i<6;i++) data.payments.push({id:'recent-'+i,rentalId:'r',customerId:'c',vehicleId:'v',date:'2026-09-14',amount:10,method:'Cash'});
   await page.goto('http://127.0.0.1:4341/?view=finance');await page.locator('.finance-ledger tbody tr').first().waitFor();
   assert.equal(await page.locator('.finance-ledger tbody tr').count(),5);assert.equal(await page.locator('.finance-result-amount').innerText(),'$600');
   await page.locator('[data-action=finance-more]').click();assert.equal(await page.locator('.finance-ledger tbody tr').count(),10);
   await page.locator('[data-action=finance-more]').click();assert.equal(await page.locator('.finance-ledger tbody tr').count(),11);assert.equal(await page.locator('[data-action=finance-more]').count(),0);
   await page.locator('[data-action=finance-fewer]').click();assert.equal(await page.locator('.finance-ledger tbody tr').count(),5);
   await page.locator('[data-action=finance-more]').click();await page.locator('[data-finance-vehicle]').selectOption('v');assert.equal(await page.locator('.finance-ledger tbody tr').count(),5);
   assert.equal(await page.locator('.finance-result-amount').innerText(),'$600');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   data.payments.splice(originalCount);
   assert.deepEqual(errors,[]);console.log(`${engine} ${width}: finance totals, filters, month changes, forms and overflow passed`);
  } finally { await browser.close(); }
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

const math = require('./rental-math');
const crypto = require('crypto');

function config(env = process.env) {
  return { enabled: env.EMAIL_ENABLED === 'true', key: env.GMAIL_APP_PASSWORD || '', from: env.GMAIL_USER || 'NRICARRENTALS@gmail.com', timezone: env.EMAIL_TIMEZONE || 'America/New_York' };
}
function today(timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function validEmail(value) { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '')); }
function messages(data, asOf) {
  const result = [], settings = data.settings || {};
  const payments = (data.payments || []).filter(payment => !payment.date || payment.date <= asOf);
  const currency = ['USD', 'CAD', 'INR'].includes(settings.currency) ? settings.currency : 'USD';
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  for (const rental of data.rentals || []) {
    const customer = (data.customers || []).find(c => c.id === rental.customerId);
    if (!customer || customer.emailNotifications === 'off') continue;
    const code = String(rental.id).toUpperCase().replace(/^REN_/, 'REN-');
    const balance = math.summary(rental, payments, asOf);
    const tail = `\n\nDue today: ${money(balance.due)}. Future rent is billed separately each month.\n${settings.companyName || 'Rental team'}${settings.supportPhone ? '\n' + settings.supportPhone : ''}`;
    const base = { rentalId: rental.id, customerId: customer.id, to: customer.email || '' };
    if (!rental.returnDate && rental.status !== 'closed') {
      const target = math.schedule(rental).find(row => row.dueDate >= asOf && math.days(asOf, row.dueDate) <= 4 && math.summary(rental, payments, row.dueDate).due > 0);
      if (target) {
        const amount = math.summary(rental, payments, target.dueDate).due;
        result.push({ ...base, key: `reminder:${rental.id}:${target.dueDate}`, kind: 'Rent reminder', dueDate: target.dueDate,
          subject: `${code}: payment due ${target.dueDate}`,
          text: `Hello ${customer.name || 'there'},\n\nYour next rental payment is due on ${target.dueDate}. Amount due by that date: ${money(amount)} (including any unpaid earlier installments and deposit). Payments recorded so far are included.` + tail });
      }
    }
    for (const payment of (data.payments || []).filter(p => p.rentalId === rental.id && p.emailReceiptRequestedAt && p.date <= asOf && Number(p.amount) > 0)) {
      result.push({ ...base, key: `receipt:${payment.id}`, kind: 'Payment receipt', paymentId: payment.id, requestedAt: payment.emailReceiptRequestedAt,
        subject: `${code}: payment received`, text: `Hello ${customer.name || 'there'},\n\nWe recorded your payment of ${money(payment.amount)} on ${payment.date}.${payment.method ? '\nPayment method: ' + payment.method : ''}${payment.reference ? '\nReference: ' + payment.reference : ''}\nContract: ${code}` + tail });
    }
  }
  return result;
}
async function loadData(db) {
  const [rentals, customers, payments, settings] = await Promise.all([
    db.collection('rentals').find({}).toArray(), db.collection('customers').find({}).toArray(),
    db.collection('payments').find({}).toArray(), db.collection('settings').findOne({ _id: 'main' })
  ]);
  return { rentals, customers, payments, settings };
}
async function run(db, options = config(), transport) {
  if (!options.enabled || !options.key || !options.from) return;
  const sender = transport || require('nodemailer').createTransport({ service: 'gmail', auth: { user: options.from, pass: options.key }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  const collection = db.collection('emailNotifications');
  // Establish an activation watermark: old receipts are never mailed when email is first enabled.
  await collection.updateOne({ _id: 'activation' }, { $setOnInsert: { activatedAt: new Date().toISOString() } }, { upsert: true });
  const activation = await collection.findOne({ _id: 'activation' });
  for (const draft of messages(await loadData(db), today(options.timezone))) {
    if (draft.requestedAt && draft.requestedAt < activation.activatedAt) continue;
    if (!validEmail(draft.to)) continue;
    const id = crypto.createHash('sha256').update(draft.key).digest('hex');
    // A unique database insert claims the send across processes and restarts. Ambiguous sends
    // stay in the history for staff review rather than risking a duplicate after provider expiry.
    try { await collection.insertOne({ _id: id, ...draft, status: 'submitting', createdAt: new Date().toISOString() }); }
    catch (error) { if (error.code === 11000) continue; throw error; }
    try {
      const payload = await sender.sendMail({ from: options.from, to: draft.to, subject: draft.subject, text: draft.text, messageId: `<${id}@rental-notifications.local>` });
      const accepted = Array.isArray(payload.accepted) && payload.accepted.length > 0;
      await collection.updateOne({ _id: id }, { $set: { status: accepted ? 'accepted' : 'failed', providerId: payload.messageId || '', detail: accepted ? 'Accepted by Gmail; inbox delivery is not confirmed.' : 'Gmail did not accept the recipient. Check the email address.', updatedAt: new Date().toISOString() } });    } catch {
      await collection.updateOne({ _id: id }, { $set: { status: 'unknown', detail: 'Delivery submission could not be confirmed. Check provider logs before sending again.', updatedAt: new Date().toISOString() } });
    }
    // Stay below the provider's default request rate.
    await new Promise(resolve => setTimeout(resolve, 600));
  }
}
async function overview(db, rentalId) {
  const options = config();
  const drafts = messages(await loadData(db), today(options.timezone)).filter(row => row.rentalId === rentalId);
  const history = await db.collection('emailNotifications').find({ rentalId }).sort({ createdAt: -1 }).limit(50).toArray();
  const known = new Set(history.map(row => row.key));
  return { enabled: Boolean(options.enabled && options.key && options.from), from: options.from, drafts: drafts.filter(row => !known.has(row.key)).map(row => ({ ...row, status: validEmail(row.to) ? 'preview' : 'missing email' })), history: history.map(({ _id, ...row }) => row) };
}
module.exports = { config, validEmail, messages, run, overview, today };

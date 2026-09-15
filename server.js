const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 4331);
const fallbackPort = Number(process.env.FALLBACK_PORT || 4332);
const configPath = path.join(root, "server.local.json");
const databaseName = process.env.MONGODB_DB || readLocalConfig().databaseName || "rental_management";
const collectionNames = ["vehicles", "customers", "rentals", "payments", "expenses", "maintenance", "inspections", "documents", "activity"];
const sessions = new Map();
const RentalMath = require("./rental-math");
const EmailNotifications = require("./email-notifications");
let emailJobBusy = false;
async function runEmailJob() {
  if (emailJobBusy || !EmailNotifications.config().enabled) return;
  emailJobBusy = true;
  try { const db = await getDatabase(); if (db) await EmailNotifications.run(db); }
  catch { console.warn("Email job could not finish. Check database and email configuration."); }
  finally { emailJobBusy = false; }
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const mongoState = {
  client: null,
  db: null,
  promise: null,
  status: {
    configured: Boolean(mongoUri()),
    connected: false,
    databaseName,
    error: ""
  }
};

function readLocalConfig() {
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    return {};
  }
}

function mongoUri() {
  return process.env.MONGODB_URI || readLocalConfig().mongoUri || "";
}

function send(response, status, body, type) {
  response.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()"
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function safeError(error) {
  const message = error && error.message ? error.message : "Database request failed.";
  const uri = mongoUri();
  return uri ? message.replace(uri, "[MongoDB URI]") : message;
}

function loadMongoClient() {
  try {
    return require("mongodb").MongoClient;
  } catch (error) {
    mongoState.status = Object.assign({}, mongoState.status, {
      configured: Boolean(mongoUri()),
      connected: false,
      error: "MongoDB driver is not installed. Run npm install in the app folder."
    });
    return null;
  }
}

async function getDatabase() {
  const uri = mongoUri();
  mongoState.status.configured = Boolean(uri);
  mongoState.status.databaseName = databaseName;
  if (!uri) {
    mongoState.status.connected = false;
    mongoState.status.error = "MongoDB URI is not configured.";
    return null;
  }
  if (mongoState.db) return mongoState.db;
  const MongoClient = loadMongoClient();
  if (!MongoClient) return null;
  if (!mongoState.promise) {
    mongoState.promise = (async () => {
      const client = new MongoClient(uri, {
        appName: "RentalManagement",
        serverSelectionTimeoutMS: 8000
      });
      await client.connect();
      const db = client.db(databaseName);
      mongoState.client = client;
      mongoState.db = db;
      mongoState.status = {
        configured: true,
        connected: true,
        databaseName,
        error: ""
      };
      await ensureIndexes(db);
      await ensureDefaultUsers(db);
      return db;
    })().catch((error) => {
      mongoState.promise = null;
      mongoState.status = Object.assign({}, mongoState.status, {
        connected: false,
        error: safeError(error)
      });
      throw error;
    });
  }
  return mongoState.promise;
}

async function ensureIndexes(db) {
  await Promise.all(collectionNames.map((name) => db.collection(name).createIndex({ sortOrder: 1 })));
  await db.collection("customers").createIndex({ phone: 1 });
  await db.collection("customers").createIndex({ license: 1 });
  await db.collection("rentals").createIndex({ vehicleId: 1, customerId: 1, status: 1, startDate: 1, endDate: 1 });
  await db.collection("documents").createIndex({ ownerType: 1, ownerId: 1, type: 1 });
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("users").createIndex({ role: 1, customerId: 1 });
}

function cleanText(value) {
  return String(value || "").trim();
}

function phoneKey(value) {
  return cleanText(value).replace(/\D/g, "");
}

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + crypto.randomBytes(2).toString("hex");
}

function todayKey() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function temporaryCustomerPassword() {
  return `Fleet-${crypto.randomBytes(6).toString("hex")}`;
}

function hashPassword(password, salt) {
  const passwordSalt = salt || crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(String(password || ""), passwordSalt, 64).toString("hex");
  return { passwordSalt, passwordHash };
}

function passwordMatches(user, password) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  try {
    const attempt = hashPassword(password, user.passwordSalt).passwordHash;
    const attemptBuffer = Buffer.from(attempt, "hex");
    const savedBuffer = Buffer.from(user.passwordHash, "hex");
    return attemptBuffer.length === savedBuffer.length && crypto.timingSafeEqual(attemptBuffer, savedBuffer);
  } catch (error) {
    return false;
  }
}

function configuredStaffUsers() {
  const config = readLocalConfig();
  const users = Array.isArray(config.staffUsers) ? config.staffUsers : [];
  if (users.length) return users;
  const mobile = config.staffMobile || process.env.STAFF_MOBILE || "";
  const password = config.staffPassword || process.env.STAFF_PASSWORD || "";
  return mobile && password ? [{
    name: config.staffName || process.env.STAFF_NAME || "Desk Staff",
    mobile,
    password
  }] : [];
}

async function ensureStaffUsers(db) {
  const users = db.collection("users");
  for (const staff of configuredStaffUsers()) {
    const username = phoneKey(staff.mobile || staff.username);
    if (!username) continue;
    const existing = await users.findOne({ username });
    const base = {
      username,
      role: "staff",
      name: cleanText(staff.name) || "Desk Staff",
      active: true,
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: base });
    } else {
      const staffPassword = String(staff.password || "");
      if (staffPassword.length < 8) {
        throw new Error("A staff password of at least 8 characters is required in server.local.json, STAFF_PASSWORD, or staffUsers.");
      }
      await users.insertOne(Object.assign({
        _id: uid("usr"),
        id: uid("usr"),
        createdAt: new Date().toISOString()
      }, base, { defaultPassword: false }, hashPassword(staffPassword)));
    }
  }
}

async function ensureCustomerUsers(db, customers) {
  const users = db.collection("users");
  const list = Array.isArray(customers) ? customers : await db.collection("customers").find({}).toArray();
  for (const customer of list) {
    const username = phoneKey(customer.phone);
    if (!username || !customer.id) continue;
    const byUsername = await users.findOne({ username });
    // A phone number is a login name, never authority to take over another account.
    if (byUsername && (byUsername.role !== "customer" || String(byUsername.customerId) !== String(customer.id))) continue;
    const existing = byUsername || await users.findOne({ role: "customer", customerId: customer.id });
    const base = {
      username,
      role: "customer",
      name: cleanText(customer.name) || "Customer",
      customerId: customer.id,
      active: true,
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: base });
      await users.updateMany({ role: "customer", customerId: customer.id, _id: { $ne: existing._id } }, { $set: { active: false } });
      if (existing.username !== username) for (const [token, session] of sessions) { if (session.role === "customer" && session.customerId === customer.id) sessions.delete(token); }
    } else {
      await users.insertOne(Object.assign({
        _id: uid("usr"),
        id: uid("usr"),
        createdAt: new Date().toISOString()
      }, base, { defaultPassword: true }, hashPassword(temporaryCustomerPassword())));
    }
  }
  await users.updateMany({ role: "customer", customerId: { $nin: list.map(customer => customer.id) } }, { $set: { active: false } });
}

async function ensureDefaultUsers(db) {
  await ensureStaffUsers(db);
  await ensureCustomerUsers(db);
}

function cleanMongoDocument(doc) {
  if (!doc) return doc;
  const clean = Object.assign({}, doc);
  // Imported records may only have MongoDB's primary key. DOM data attributes
  // and the app's lookups use string IDs, so establish that contract here.
  const id = doc.id !== undefined && doc.id !== null && doc.id !== "" ? doc.id : doc._id;
  if (id !== undefined && id !== null) clean.id = String(id);
  for (const field of ["vehicleId", "customerId", "rentalId", "maintenanceId", "driverId", "ownerId", "entityId"]) {
    if (clean[field] !== undefined && clean[field] !== null) clean[field] = String(clean[field]);
  }
  if (clean.related && typeof clean.related === "object") {
    clean.related = Object.fromEntries(Object.entries(clean.related).map(([key, value]) =>
      [key, key.endsWith("Id") && value != null ? String(value) : value]
    ));
  }
  if (!clean.unit && clean.vehicleNumber != null) clean.unit = String(clean.vehicleNumber);
  delete clean._id;
  delete clean.sortOrder;
  return clean;
}

async function fullDatabaseData(db) {
  const settingsDoc = await db.collection("settings").findOne({ _id: "main" });
  const data = {
    settings: cleanMongoDocument(settingsDoc) || {}
  };
  let recordCount = settingsDoc ? 1 : 0;
  for (const name of collectionNames) {
    const records = await db.collection(name).find({}).sort({ sortOrder: 1, _id: 1 }).toArray();
    data[name] = records.map(cleanMongoDocument);
    recordCount += records.length;
  }
  return { data, recordCount };
}

function sanitizeCustomerVehicle(vehicle) {
  const clean = cleanMongoDocument(vehicle);
  delete clean.acquisitionCost;
  delete clean.loanBalance;
  delete clean.monthlyPayment;
  delete clean.renewalHistory;
  return clean;
}

function sanitizeCustomerRental(rental, payments = []) {
  const clean = cleanMongoDocument(rental);
  clean.settlement = RentalMath.summary(clean, payments);
  delete clean.dailyRate;
  delete clean.monthlyRate;
  delete clean.deposit;
  return clean;
}

async function customerDatabaseData(db, session) {
  const customer = await db.collection("customers").findOne({ _id: String(session.customerId) });
  if (!customer) {
    return {
      data: null,
      recordCount: 0
    };
  }
  const rentals = await db.collection("rentals").find({ customerId: customer.id }).sort({ startDate: -1, sortOrder: 1 }).toArray();
  const rentalIds = rentals.map((rental) => rental.id);
  const payments = rentalIds.length ? await db.collection("payments").find({ rentalId: { $in: rentalIds } }).toArray() : [];
  const vehicleIds = Array.from(new Set(rentals.map((rental) => rental.vehicleId).filter(Boolean)));
  const vehicles = vehicleIds.length
    ? await db.collection("vehicles").find({ _id: { $in: vehicleIds } }).sort({ sortOrder: 1, _id: 1 }).toArray()
    : [];
  const documents = await db.collection("documents").find({
    $or: [
      { ownerType: "customer", ownerId: customer.id },
      { ownerType: "rental", ownerId: { $in: rentalIds } },
      { ownerType: "vehicle", ownerId: { $in: vehicleIds }, type: { $in: ["Vehicle insurance", "Registration"] } }
    ]
  }).sort({ sortOrder: 1, _id: 1 }).toArray();
  const inspections = await db.collection("inspections").find({
    $or: [
      { rentalId: { $in: rentalIds } },
      { customerId: customer.id }
    ]
  }).sort({ date: -1, sortOrder: 1 }).toArray();
  const activity = await db.collection("activity").find({
    $or: [
      { "related.customerId": customer.id },
      { "related.rentalId": { $in: rentalIds } }
    ]
  }).sort({ time: -1 }).limit(20).toArray();
  const settingsDoc = await db.collection("settings").findOne({ _id: "main" });
  const data = {
    settings: cleanMongoDocument(settingsDoc) || {},
    vehicles: vehicles.map(sanitizeCustomerVehicle),
    customers: [cleanMongoDocument(customer)],
    rentals: rentals.map(rental => sanitizeCustomerRental(rental, payments)),
    payments: [],
    expenses: [],
    maintenance: [],
    inspections: inspections.map(cleanMongoDocument),
    documents: documents.map(cleanMongoDocument),
    activity: activity.map(cleanMongoDocument)
  };
  return {
    data,
    recordCount: 1 + rentals.length + vehicles.length + documents.length + inspections.length
  };
}

async function readDatabase(session) {
  const db = await getDatabase();
  if (!db) {
    return { ok: false, data: null, status: mongoState.status };
  }
  if (!session) {
    const error = new Error("Login required.");
    error.statusCode = 401;
    throw error;
  }
  const result = session.role === "customer"
    ? await customerDatabaseData(db, session)
    : await fullDatabaseData(db);
  return {
    ok: true,
    data: result.recordCount ? result.data : null,
    status: mongoState.status,
    user: publicUser(session)
  };
}

async function replaceCollection(db, name, rows) {
  const collection = db.collection(name);
  const records = Array.isArray(rows) ? rows.filter((row) => row && row.id) : [];
  if (!records.length) {
    await collection.deleteMany({});
    return;
  }
  await collection.bulkWrite(records.map((row, index) => ({
    replaceOne: {
      filter: { _id: String(row.id) },
      replacement: Object.assign({}, row, { _id: String(row.id), sortOrder: index }),
      upsert: true
    }
  })), { ordered: false });
  await collection.deleteMany({ _id: { $nin: records.map((row) => String(row.id)) } });
}

async function writeDatabase(data) {
  const db = await getDatabase();
  if (!db) {
    const error = new Error(mongoState.status.error || "MongoDB is not available.");
    error.statusCode = 503;
    throw error;
  }
  for (const customer of data?.customers || []) {
    const username = phoneKey(customer.phone);
    if (!username) continue;
    const account = await db.collection("users").findOne({ username });
    if (account && (account.role !== "customer" || String(account.customerId) !== String(customer.id))) {
      const error = new Error("A customer phone number is already linked to a different login account. Correct that customer phone before saving.");
      error.statusCode = 409; throw error;
    }
  }

  const settings = Object.assign({}, data && data.settings ? data.settings : {});
  await db.collection("settings").replaceOne(
    { _id: "main" },
    Object.assign({}, settings, { _id: "main", updatedAt: new Date().toISOString() }),
    { upsert: true }
  );
  for (const name of collectionNames) {
    await replaceCollection(db, name, data ? data[name] : []);
  }
  await ensureDefaultUsers(db);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024 * 1024) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sessionFromRequest(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : request.headers["x-session-token"];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  return session;
}

function publicUser(user) {
  if (!user) return null;
  return {
    role: user.role,
    name: user.name,
    username: user.username,
    customerId: user.customerId || "",
    defaultPassword: Boolean(user.defaultPassword)
  };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    token,
    role: user.role,
    name: user.name,
    username: user.username,
    customerId: user.customerId || "",
    defaultPassword: Boolean(user.defaultPassword),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000
  };
  sessions.set(token, session);
  return session;
}

function requireRole(request, role) {
  const session = sessionFromRequest(request);
  if (!session || (role && session.role !== role)) {
    const error = new Error("Login required.");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

async function login(request, response) {
  const payload = await readJsonBody(request);
  const db = await getDatabase();
  if (!db) {
    sendJson(response, 503, { ok: false, error: mongoState.status.error || "MongoDB is not available.", status: mongoState.status });
    return;
  }
  await ensureDefaultUsers(db);
  const username = phoneKey(payload.username);
  const user = await db.collection("users").findOne({ username, active: { $ne: false } });
  if (!user || !passwordMatches(user, payload.password)) {
    sendJson(response, 401, { ok: false, error: "Mobile number or password is not correct." });
    return;
  }
  const session = createSession(user);
  sendJson(response, 200, {
    ok: true,
    token: session.token,
    user: publicUser(session),
    status: mongoState.status
  });
}

async function changePassword(request, response) {
  const session = requireRole(request);
  const payload = await readJsonBody(request);
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");
  const confirmPassword = Object.prototype.hasOwnProperty.call(payload, "confirmPassword")
    ? String(payload.confirmPassword || "")
    : newPassword;
  if (!currentPassword || !newPassword) {
    sendJson(response, 400, { ok: false, error: "Current password and new password are required." });
    return;
  }
  if (newPassword.length < 8) {
    sendJson(response, 400, { ok: false, error: "New password must be at least 8 characters." });
    return;
  }
  if (newPassword !== confirmPassword) {
    sendJson(response, 400, { ok: false, error: "New password and confirmation do not match." });
    return;
  }
  const db = await getDatabase();
  if (!db) {
    sendJson(response, 503, { ok: false, error: mongoState.status.error || "MongoDB is not available.", status: mongoState.status });
    return;
  }
  const users = db.collection("users");
  const user = await users.findOne({ username: session.username, active: { $ne: false } });
  if (!user) {
    sendJson(response, 404, { ok: false, error: "This account was not found." });
    return;
  }
  if (!passwordMatches(user, currentPassword)) {
    sendJson(response, 401, { ok: false, error: "Current password is not correct." });
    return;
  }
  if (passwordMatches(user, newPassword)) {
    sendJson(response, 400, { ok: false, error: "Choose a password different from the current password." });
    return;
  }
  await users.updateOne({ _id: user._id }, {
    $set: Object.assign({
      defaultPassword: false,
      updatedAt: new Date().toISOString()
    }, hashPassword(newPassword))
  });
  session.defaultPassword = false;
  sendJson(response, 200, {
    ok: true,
    user: publicUser(session),
    status: mongoState.status
  });
}

async function resetCustomerPassword(request, response) {
  requireRole(request, "staff");
  const payload = await readJsonBody(request);
  const customerId = cleanText(payload.customerId);
  const db = await getDatabase();
  if (!db) {
    sendJson(response, 503, { ok: false, error: mongoState.status.error || "MongoDB is not available.", status: mongoState.status });
    return;
  }
  const customer = await db.collection("customers").findOne({ _id: customerId }) || await db.collection("customers").findOne({ id: customerId });
  if (!customer) {
    sendJson(response, 404, { ok: false, error: "Customer was not found." });
    return;
  }
  const username = phoneKey(customer.phone);
  if (!username) {
    sendJson(response, 400, { ok: false, error: "Save the customer mobile number before creating login access." });
    return;
  }
  const password = temporaryCustomerPassword();
  const users = db.collection("users");
  const existing = await users.findOne({ username });
  const base = Object.assign({
    username,
    role: "customer",
    name: cleanText(customer.name) || "Customer",
    customerId: customer.id,
    active: true,
    defaultPassword: true,
    updatedAt: new Date().toISOString()
  }, hashPassword(password));
  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: base });
  } else {
    await users.insertOne(Object.assign({
      _id: uid("usr"),
      id: uid("usr"),
      createdAt: new Date().toISOString()
    }, base));
  }
  sendJson(response, 200, {
    ok: true,
    username,
    temporaryPassword: password,
    status: mongoState.status
  });
}

function normalizeUpload(upload) {
  if (!upload || !upload.fileName || !upload.fileData) return null;
  return {
    fileName: cleanText(upload.fileName),
    fileData: String(upload.fileData || ""),
    fileType: cleanText(upload.fileType) || "application/octet-stream",
    fileSize: Number(upload.fileSize || 0)
  };
}

async function customerCheckIn(request, response) {
  const session = requireRole(request, "customer");
  const payload = await readJsonBody(request);
  const db = await getDatabase();
  if (!db) { sendJson(response, 503, { ok: false, error: "Database is unavailable." }); return; }
  const rental = await db.collection("rentals").findOne({
    ...(payload.rentalId ? { _id: String(payload.rentalId) } : {}),
    customerId: session.customerId,
    status: "active",
    cancelledAt: { $exists: false }
  }, { sort: { startDate: -1 } });
  if (!rental) {
    sendJson(response, 404, { ok: false, error: "No assigned rental was found for this customer." });
    return;
  }
  const vehicle = await db.collection("vehicles").findOne({ _id: String(rental.vehicleId) });
  if (!vehicle) {
    sendJson(response, 404, { ok: false, error: "Assigned vehicle was not found." });
    return;
  }
  const odometer = Number(payload.odometer || 0);
  if (!odometer) {
    sendJson(response, 400, { ok: false, error: "Enter the current miles before submitting." });
    return;
  }
  const fuel = cleanText(payload.fuel);
  if (!fuel) {
    sendJson(response, 400, { ok: false, error: "Select the fuel or charge level before submitting." });
    return;
  }
  const inspection = {
    id: uid("ins"),
    vehicleId: vehicle.id,
    rentalId: rental.id,
    customerId: session.customerId,
    date: payload.date || todayKey(),
    odometer,
    condition: "Customer update",
    fuel,
    notes: cleanText(payload.notes),
    submittedBy: "customer",
    createdAt: new Date().toISOString()
  };
  await db.collection("inspections").insertOne(Object.assign({}, inspection, {
    _id: inspection.id,
    sortOrder: -Date.now()
  }));
  if (odometer > Number(vehicle.mileage || 0)) {
    await db.collection("vehicles").updateOne({ _id: vehicle.id }, { $set: { mileage: odometer } });
  }
  const photo = normalizeUpload(payload.photo);
  if (photo) {
    const doc = Object.assign({
      id: uid("doc"),
      ownerType: "rental",
      ownerId: rental.id,
      type: "Inspection photo",
      expiryDate: "",
      notes: `Customer upload / ${fuel} / ${odometer} miles`
    }, photo);
    await db.collection("documents").insertOne(Object.assign({}, doc, {
      _id: doc.id,
      sortOrder: -Date.now()
    }));
  }
  const activity = {
    id: uid("act"),
    time: new Date().toISOString(),
    type: "inspection",
    message: `${session.name} submitted mileage, fuel, and photo update for ${vehicle.unit}.`,
    entityType: "rental",
    entityId: rental.id,
    related: { vehicleId: vehicle.id, customerId: session.customerId, rentalId: rental.id }
  };
  await db.collection("activity").insertOne(Object.assign({}, activity, {
    _id: activity.id,
    sortOrder: -Date.now()
  }));
  const result = await readDatabase(session);
  sendJson(response, 200, Object.assign({ ok: true }, result));
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/email-notifications") {
      requireRole(request, "staff");
      const db = await getDatabase();
      if (!db) { sendJson(response, 503, { error: "Connect the database to view email history." }); return true; }
      sendJson(response, 200, await EmailNotifications.overview(db, url.searchParams.get("rentalId") || ""));
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      await getDatabase().catch(() => null);
      sendJson(response, 200, { ok: mongoState.status.connected, status: mongoState.status });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/login") {
      await login(request, response);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/logout") {
      const session = sessionFromRequest(request);
      if (session) sessions.delete(session.token);
      sendJson(response, 200, { ok: true });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/change-password") {
      await changePassword(request, response);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/customer-password") {
      await resetCustomerPassword(request, response);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      const session = sessionFromRequest(request);
      sendJson(response, session ? 200 : 401, { ok: Boolean(session), user: publicUser(session), status: mongoState.status });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/data") {
      const result = await readDatabase(requireRole(request));
      sendJson(response, 200, result);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/data") {
      requireRole(request, "staff");
      const payload = await readJsonBody(request);
      await writeDatabase(payload.data || payload);
      void runEmailJob();
      sendJson(response, 200, { ok: true, status: mongoState.status });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/customer-checkin") {
      await customerCheckIn(request, response);
      return true;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { ok: false, error: "API route not found." });
      return true;
    }
    return false;
  } catch (error) {
    sendJson(response, error.statusCode || 500, { ok: false, error: safeError(error), status: mongoState.status });
    return true;
  }
}

async function serve(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (await handleApi(request, response, url)) return;

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, pathname));
  const relativePath = path.relative(root, filePath);

  if (!/^(index\.html|app\.js|rental-math\.js|styles\.css|service-worker\.js|manifest\.webmanifest|assets[\\/].+)$/i.test(relativePath)) {
    send(response, 404, "Not found"); return;
  }
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }
    send(response, 200, data, types[path.extname(filePath)] || "application/octet-stream");
  });
}

function listen(port, allowFallback) {
  const server = http.createServer((request, response) => {
    serve(request, response).catch((error) => sendJson(response, 500, { ok: false, error: safeError(error) }));
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && allowFallback) {
      listen(fallbackPort, false);
      return;
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`Rental Management running at http://localhost:${port}/`);
    console.log(`MongoDB database: ${databaseName}`);
  });
}

listen(preferredPort, preferredPort !== fallbackPort);
if (EmailNotifications.config().enabled) {
  setInterval(() => { void runEmailJob(); }, 5 * 60 * 1000).unref();
  void runEmailJob();
}

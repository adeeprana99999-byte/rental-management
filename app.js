(function () {
  "use strict";

  const STORE_KEY = "rental_management_real_app_v1";
  const SESSION_KEY = "rental_management_session_v1";
  const API_DATA_URL = "/api/data";
  const API_LOGIN_URL = "/api/login";
  const API_LOGOUT_URL = "/api/logout";
  const API_CHANGE_PASSWORD_URL = "/api/change-password";
  const API_CUSTOMER_PASSWORD_URL = "/api/customer-password";
  const API_CUSTOMER_CHECKIN_URL = "/api/customer-checkin";
  const app = document.getElementById("app");
  let remoteSaveTimer = null;
  let remoteAvailable = false;
  let auth = loadAuthSession();
  let loginState = {
    busy: false,
    error: ""
  };
  let dbState = {
    state: "loading",
    label: "Loading DB",
    detail: "Checking MongoDB connection."
  };

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "fleet", label: "Fleet", icon: "fleet" },
    { id: "rentals", label: "Rentals", icon: "rentals" },
    { id: "customers", label: "Customers", icon: "customers" },
    { id: "documents", label: "Documents", icon: "documents" },
    { id: "finance", label: "Finance", icon: "finance" },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "alerts", label: "Alerts", icon: "alerts" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];

  const ADD_ITEMS = [
    { type: "rental", label: "Rental" },
    { type: "payment", label: "Payment" },
    { type: "document", label: "File" }
  ];

  const vehicleTabs = ["info", "rentals", "service", "files"];
  const customerTabs = ["info", "rentals", "files"];
  const DOCUMENT_GROUPS = [
    { id: "all", label: "All Documents", icon: "documents", types: [] },
    { id: "licenses", label: "Driver License", icon: "license", types: ["Driver license"] },
    { id: "insurance", label: "Insurance", icon: "insurance", types: ["Vehicle insurance", "Customer insurance", "Driver insurance"] },
    { id: "agreements", label: "Agreement", icon: "agreement", types: ["Rental agreement"] },
    { id: "photos", label: "Inspection Photo", icon: "photo", types: ["Inspection photo"] }
  ];

  const initialView = initialViewFromUrl();
  let db = loadData();
  let ui = {
    view: initialView,
    query: "",
    addMenu: false,
    modal: null,
    prefill: {},
    toast: "",
    documentId: "",
    actionMenu: "",
    vehicleId: db.vehicles[0]?.id || "",
    customerId: db.customers[0]?.id || "",
    rentalId: db.rentals.find((rental) => rental.status === "active")?.id || db.rentals[0]?.id || "",
    fleetMode: "list",
    customerMode: "list",
    rentalMode: "list",
    vehicleTab: "",
    customerTab: "info",
    documentFilter: "all",
    financeMonth: todayKey().slice(0, 7),
    financeFilter: "all"
  };

  function initialViewFromUrl() {
    try {
      if (typeof window === "undefined" || !window.location || typeof URLSearchParams !== "function") return "dashboard";
      const params = new URLSearchParams(window.location.search || "");
      const view = String(params.get("view") || "").toLowerCase();
      if (["driver", "drivers", "customers"].includes(view)) return "customers";
      if (NAV.some((item) => item.id === view)) return view;
    } catch (error) {}
    return "dashboard";
  }

  function seedData() {
    const now = new Date().toISOString();
    return {
      settings: {
        companyName: "Rental",
        location: "Chicago Operations",
        currency: "USD",
        supportPhone: "(312) 555-0148",
        supportEmail: "ops@rental.local"
      },
      vehicles: [
        { id: "veh_camry", unit: "CAR-001", make: "Toyota", model: "Camry", year: 2024, vin: "4T1C11AK7RU101420", plate: "IL RNT 001", status: "rented", mileage: 28420, location: "Chicago Yard", acquisitionCost: 28500, loanBalance: 16200, monthlyPayment: 620, color: "Silver", nextService: "2026-09-20", insuranceExpiry: "2027-02-01" },
        { id: "veh_transit", unit: "VAN-014", make: "Ford", model: "Transit", year: 2022, vin: "1FTBW2CM7NKA14014", plate: "IL VAN 014", status: "maintenance", mileage: 71280, location: "Service bay", acquisitionCost: 43800, loanBalance: 21900, monthlyPayment: 840, color: "White", nextService: "2026-09-08", insuranceExpiry: "2026-12-10" },
        { id: "veh_modely", unit: "EV-009", make: "Tesla", model: "Model Y", year: 2023, vin: "7SAYGDEE8PA220009", plate: "IL EV 009", status: "available", mileage: 19210, location: "Airport lot", acquisitionCost: 48600, loanBalance: 30100, monthlyPayment: 910, color: "Blue", nextService: "2026-10-18", insuranceExpiry: "2027-04-14" },
        { id: "veh_odyssey", unit: "VAN-022", make: "Honda", model: "Odyssey", year: 2021, vin: "5FNRL6H75MB020022", plate: "IL VAN 022", status: "rented", mileage: 54860, location: "With customer", acquisitionCost: 36400, loanBalance: 11850, monthlyPayment: 690, color: "Black", nextService: "2026-09-28", insuranceExpiry: "2026-11-30" }
      ],
      customers: [
        { id: "cus_amandeep", name: "Amandeep Singh", phone: "(312) 555-0191", email: "amandeep@example.com", license: "S294-7712-5581", status: "active", address: "225 W Randolph St, Chicago, IL", notes: "Prefers midsize sedan. Good payment history." },
        { id: "cus_maria", name: "Maria Torres", phone: "(773) 555-0188", email: "maria@example.com", license: "T884-2309-1182", status: "active", address: "801 N Wells St, Chicago, IL", notes: "Needs weekly invoice by email." },
        { id: "cus_chen", name: "Daniel Chen", phone: "(630) 555-0133", email: "daniel@example.com", license: "C110-4930-3821", status: "active", address: "3400 W Foster Ave, Chicago, IL", notes: "Airport pickup customer." },
        { id: "cus_olivia", name: "Olivia Grant", phone: "(708) 555-0165", email: "olivia@example.com", license: "G320-7711-0902", status: "watch", address: "1120 S Michigan Ave, Chicago, IL", notes: "Review balance before extending rental." }
      ],
      rentals: [
        { id: "ren_1001", vehicleId: "veh_camry", customerId: "cus_amandeep", startDate: "2026-09-01", endDate: "2026-09-10", pickupLocation: "Chicago Yard", monthlyRate: 1740, deposit: 300, status: "active", notes: "Monthly renter converting from booking." },
        { id: "ren_1002", vehicleId: "veh_odyssey", customerId: "cus_maria", startDate: "2026-09-03", endDate: "2026-09-12", pickupLocation: "O'Hare pickup", monthlyRate: 2460, deposit: 400, status: "active", notes: "Child seats requested." },
        { id: "ren_1003", vehicleId: "veh_modely", customerId: "cus_chen", startDate: "2026-09-14", endDate: "2026-09-18", pickupLocation: "Airport lot", monthlyRate: 2880, deposit: 500, status: "reserved", notes: "Flight arrival 6:15 PM." },
        { id: "ren_0991", vehicleId: "veh_camry", customerId: "cus_olivia", startDate: "2026-08-14", endDate: "2026-08-21", pickupLocation: "Chicago Yard", monthlyRate: 1650, deposit: 250, status: "closed", notes: "Returned on time." }
      ],
      payments: [
        { id: "pay_9001", rentalId: "ren_1001", customerId: "cus_amandeep", vehicleId: "veh_camry", date: "2026-09-01", amount: 464, method: "Card", reference: "CARD-1921", notes: "Deposit plus first payment" },
        { id: "pay_9002", rentalId: "ren_1002", customerId: "cus_maria", vehicleId: "veh_odyssey", date: "2026-09-03", amount: 600, method: "ACH", reference: "ACH-7780", notes: "Advance payment" },
        { id: "pay_8992", rentalId: "ren_0991", customerId: "cus_olivia", vehicleId: "veh_camry", date: "2026-08-21", amount: 635, method: "Cash", reference: "CASH-1992", notes: "Final closeout" }
      ],
      expenses: [
        { id: "exp_3001", vehicleId: "veh_camry", rentalId: "ren_1001", maintenanceId: "", date: "2026-09-02", category: "Cleaning", amount: 38, paymentMethod: "Fleet card", status: "paid", notes: "Interior reset before rental" },
        { id: "exp_3002", vehicleId: "veh_transit", rentalId: "", maintenanceId: "", date: "2026-09-04", category: "Repair", amount: 410, paymentMethod: "Card", status: "pending", notes: "Transit brake diagnostic payment" },
        { id: "exp_3003", vehicleId: "veh_odyssey", rentalId: "ren_1002", maintenanceId: "", date: "2026-09-03", category: "Fuel", amount: 76, paymentMethod: "Fleet card", status: "paid", notes: "Full tank before pickup" }
      ],
      maintenance: [
        { id: "mnt_7001", vehicleId: "veh_transit", type: "Brake inspection", date: "2026-09-05", status: "in_progress", actualCost: 0, paidAmount: 0, shop: "Northside Service", odometer: 71280, notes: "Customer reported vibration under braking." },
        { id: "mnt_7002", vehicleId: "veh_camry", type: "Oil change", date: "2026-09-20", status: "scheduled", actualCost: 0, paidAmount: 0, shop: "Quick Lube West", odometer: 28600, notes: "Due after current rental." }
      ],
      inspections: [
        { id: "ins_5001", vehicleId: "veh_camry", rentalId: "ren_1001", date: "2026-09-01", odometer: 28420, condition: "Passed", fuel: "Full", notes: "Exterior clean. Photos saved." },
        { id: "ins_5002", vehicleId: "veh_transit", rentalId: "", date: "2026-09-04", odometer: 71280, condition: "Needs repair", fuel: "Half", notes: "Brake vibration confirmed." },
        { id: "ins_5003", vehicleId: "veh_odyssey", rentalId: "ren_1002", date: "2026-09-03", odometer: 54860, condition: "Passed", fuel: "Full", notes: "Ready for pickup." }
      ],
      documents: [
        { id: "doc_8001", ownerType: "vehicle", ownerId: "veh_camry", type: "Vehicle insurance", fileName: "CAR-001-insurance.pdf", fileData: "", fileType: "application/pdf", fileSize: 0, expiryDate: "2027-02-01", notes: "Commercial coverage" },
        { id: "doc_8002", ownerType: "rental", ownerId: "ren_1001", type: "Rental agreement", fileName: "ren-1001-agreement.pdf", fileData: "", fileType: "application/pdf", fileSize: 0, expiryDate: "", notes: "Signed at pickup" },
        { id: "doc_8003", ownerType: "customer", ownerId: "cus_amandeep", type: "Driver license", fileName: "amandeep-license.jpg", fileData: "", fileType: "image/jpeg", fileSize: 0, expiryDate: "2027-08-18", notes: "Verified" },
        { id: "doc_8004", ownerType: "vehicle", ownerId: "veh_transit", type: "Registration", fileName: "VAN-014-registration.pdf", fileData: "", fileType: "application/pdf", fileSize: 0, expiryDate: "2026-09-22", notes: "Renewal required this month" }
      ],
      activity: [
        { id: "act_1", time: now, type: "rental", message: "Rental REN-1001 started for Toyota Camry CAR-001.", entityType: "vehicle", entityId: "veh_camry", related: { vehicleId: "veh_camry", customerId: "cus_amandeep", rentalId: "ren_1001" } },
        { id: "act_2", time: now, type: "payment", message: "Payment received from Amandeep Singh.", entityType: "rental", entityId: "ren_1001", related: { vehicleId: "veh_camry", customerId: "cus_amandeep", rentalId: "ren_1001" } },
        { id: "act_3", time: now, type: "maintenance", message: "Brake inspection opened for Ford Transit VAN-014.", entityType: "vehicle", entityId: "veh_transit", related: { vehicleId: "veh_transit" } }
      ]
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (error) {}
    return normalize(seedData());
  }

  function syncUiSelection() {
    if (!vehicleById(ui.vehicleId)) ui.vehicleId = db.vehicles[0]?.id || "";
    if (!customerById(ui.customerId)) ui.customerId = db.customers[0]?.id || "";
    if (!rentalById(ui.rentalId)) ui.rentalId = db.rentals.find((rental) => rental.status === "active")?.id || db.rentals[0]?.id || "";
  }

  function normalize(value) {
    const seed = seedData();
    return Object.assign({}, seed, value || {}, {
      settings: Object.assign({}, seed.settings, value?.settings || {}),
      vehicles: Array.isArray(value?.vehicles) ? value.vehicles : seed.vehicles,
      customers: Array.isArray(value?.customers) ? value.customers : seed.customers,
      rentals: (Array.isArray(value?.rentals) ? value.rentals : seed.rentals).map((rental) => {
        const monthlyRate = Number(rental?.monthlyRate || 0) || (Number(rental?.dailyRate || 0) * 30);
        return Object.assign({
          driverName: "",
          driverPhone: "",
          licenseNumber: "",
          licenseExpiry: "",
          insuranceCompany: "",
          insurancePolicy: "",
          insuranceExpiry: "",
          monthlyRate
        }, rental, { monthlyRate });
      }),
      payments: Array.isArray(value?.payments) ? value.payments : seed.payments,
      expenses: Array.isArray(value?.expenses) ? value.expenses : seed.expenses,
      maintenance: (Array.isArray(value?.maintenance) ? value.maintenance : seed.maintenance).map((item) => Object.assign({
        actualCost: 0,
        paidAmount: 0,
        estimate: 0
      }, item)),
      inspections: Array.isArray(value?.inspections) ? value.inspections : seed.inspections,
      documents: (Array.isArray(value?.documents) ? value.documents : seed.documents).map((doc) => Object.assign({ fileData: "", fileType: "", fileSize: 0 }, doc)),
      activity: Array.isArray(value?.activity) ? value.activity : seed.activity
    });
  }

  function saveLocalData(showError) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      return true;
    } catch (error) {
      if (showError) alert("This browser could not store that much document data. The server database will still be used when it is available.");
      return false;
    }
  }

  function queueRemoteSave() {
    if (typeof fetch !== "function" || auth?.role !== "staff") return;
    clearTimeout(remoteSaveTimer);
    const snapshot = JSON.stringify(db);
    remoteSaveTimer = setTimeout(() => {
      pushRemoteData(snapshot);
    }, 150);
  }

  async function pushRemoteData(snapshot) {
    try {
      const response = await fetch(API_DATA_URL, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: snapshot
      });
      if (response.status === 401) {
        logout();
        return;
      }
      remoteAvailable = response.ok;
      if (response.ok) {
        dbState = {
          state: "connected",
          label: "MongoDB",
          detail: "Saved to MongoDB."
        };
        render();
      }
    } catch (error) {
      remoteAvailable = false;
      dbState = {
        state: "offline",
        label: "Browser backup",
        detail: "MongoDB save failed. The app is keeping a local browser copy."
      };
      render();
      console.warn("Database sync failed.", error);
    }
  }

  function saveData() {
    const localSaved = saveLocalData(false);
    queueRemoteSave();
    if (!localSaved && !remoteAvailable) {
      alert("This browser could not store that much document data. The server database will still be used when it is available.");
    }
    return true;
  }

  async function hydrateFromServer() {
    if (typeof fetch !== "function" || !auth) return;
    dbState = {
      state: "loading",
      label: "Loading DB",
      detail: "Checking MongoDB connection."
    };
    render();
    try {
      const response = await fetch(API_DATA_URL, { headers: apiHeaders() });
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        dbState = {
          state: "offline",
          label: "Browser backup",
          detail: "MongoDB did not return data."
        };
        render();
        return;
      }
      const payload = await response.json();
      remoteAvailable = Boolean(payload.status && payload.status.connected);
      if (payload.user) saveAuthSession(Object.assign({}, auth, { user: payload.user, role: payload.user.role }));
      promptPasswordChangeIfNeeded();
      if (payload.data) {
        db = normalize(payload.data);
        saveLocalData(false);
        syncUiSelection();
        dbState = {
          state: remoteAvailable ? "connected" : "offline",
          label: remoteAvailable ? "MongoDB" : "Browser backup",
          detail: remoteAvailable ? "Loaded from MongoDB." : "Loaded from browser backup."
        };
        render();
        return;
      }
      if (payload.status && payload.status.configured) {
        dbState = {
          state: payload.status.connected ? "connected" : "offline",
          label: payload.status.connected ? "MongoDB" : "Browser backup",
          detail: payload.status.connected ? "MongoDB is empty, so the current app records are being saved there." : (payload.status.error || "MongoDB is not connected.")
        };
        queueRemoteSave();
        render();
      }
    } catch (error) {
      dbState = {
        state: "offline",
        label: "Browser backup",
        detail: "MongoDB load failed. The app is showing the browser backup."
      };
      render();
      console.warn("Database load failed.", error);
    }
  }

  function commit(message) {
    if (!saveData()) return false;
    ui.modal = null;
    ui.prefill = {};
    ui.addMenu = false;
    ui.documentId = "";
    ui.actionMenu = "";
    ui.toast = message || "";
    render();
    return true;
  }

  function promptPasswordChangeIfNeeded() {
    if (!auth?.user?.defaultPassword || ui.modal === "password") return;
    ui.modal = "password";
    ui.toast = "Change the temporary password before using this account.";
  }

  function readUpload(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.name) {
        resolve({ fileName: "", fileType: "", fileData: "", fileSize: 0 });
        return;
      }
      if (!file.size) { reject(new Error('This file is empty. Download the original and select it again.')); return; }
      const photo = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (file.size > (photo ? 30 : 8) * 1024 * 1024) {
        reject(new Error(photo ? "Choose a photo under 30 MB." : "Choose a file under 8 MB."));
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = { fileName: file.name, fileType: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/octet-stream'), fileData: String(reader.result || ''), fileSize: file.size || 0 };
          if (photo && (file.size > 8 * 1024 * 1024 || /heic|heif/i.test(file.type + file.name))) {
            const image = await new Promise((done, fail) => { const img = new Image(); img.onload = () => done(img); img.onerror = () => fail(new Error('Choose JPEG/PNG or take a new photo; this photo format cannot be resized here.')); img.src = result.fileData; });
            const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
            result.fileData = canvas.toDataURL('image/jpeg', .85); result.fileSize = Math.ceil((result.fileData.length - result.fileData.indexOf(',') - 1) * .75);
            if (result.fileSize > 8 * 1024 * 1024) throw new Error('Choose a smaller photo under 8 MB.');
            result.fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg'; result.fileType = 'image/jpeg';
          }
          resolve(result);
        } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(new Error("The file could not be read."));
      reader.onabort = () => reject(new Error("File loading was cancelled. Select the file again."));
      reader.readAsDataURL(file);
    });
  }

  function fileSizeLabel(bytes) {
    const size = Number(bytes || 0);
    if (!size) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: db.settings.currency || "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function number(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function todayKey() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function dateValue(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(days) {
    const date = dateValue(todayKey()) || new Date();
    date.setDate(date.getDate() + days);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function daysBetween(start, end) {
    const a = dateValue(start);
    const b = dateValue(end);
    if (!a || !b || b < a) return 1;
    return Math.floor((b - a) / 86400000) + 1;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    const aStart = dateValue(startA);
    const aEnd = dateValue(endA);
    const bStart = dateValue(startB);
    const bEnd = dateValue(endB);
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart <= bEnd && bStart <= aEnd;
  }

  function shortDate(value) {
    if (!value) return "Not set";
    const date = dateValue(value);
    if (!date) return value;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function vehicleById(id) {
    return db.vehicles.find((vehicle) => vehicle.id === id) || null;
  }

  function customerById(id) {
    return db.customers.find((customer) => customer.id === id) || null;
  }

  function rentalById(id) {
    return db.rentals.find((rental) => rental.id === id) || null;
  }

  function maintenanceById(id) {
    return db.maintenance.find((item) => item.id === id) || null;
  }

  function rentalCode(rental) {
    return "REN-" + String(rental.id || "").replace(/^ren_/, "").toUpperCase();
  }

  function activeRentalForVehicle(vehicleId) {
    return db.rentals.find((rental) => rental.vehicleId === vehicleId && rental.status === "active") || null;
  }

  function rentalsForVehicle(vehicleId) {
    return db.rentals.filter((rental) => rental.vehicleId === vehicleId);
  }

  function rentalsForCustomer(customerId) {
    return db.rentals.filter((rental) => rental.customerId === customerId);
  }

  function rentalTotal(rental) {
    return RentalMath.summary(rental, []).total;
  }

  function rentalMonthlyRate(rental) {
    return Number(rental?.monthlyRate || 0) || (Number(rental?.dailyRate || 0) * 30);
  }

  function rentalPaid(rentalId) {
    return db.payments
      .filter((payment) => payment.rentalId === rentalId)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function rentalBalance(rental) {
    return RentalMath.summary(rental, db.payments).due;
  }

  function contractBillingDetails(rental) {
    const billing = RentalMath.summary(rental, db.payments);
    return detail("Monthly due date", `Start date, then day ${Number(rental.startDate?.slice(8))} each month (last day for shorter months)`)
      + detail("Next payment", billing.nextDueDate ? `${shortDate(billing.nextDueDate)} · ${money(billing.nextAmount)}` : "No further scheduled rent payments")
      + detail("Future rent — not due yet", money(billing.futureRent))
      + detail("Remaining contract balance (including future rent)", money(billing.remainingBalance));
  }

  function vehicleRevenue(vehicleId) {
    return db.payments
      .filter((payment) => payment.vehicleId === vehicleId)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function vehicleExpenses(vehicleId) {
    return db.expenses
      .filter((expense) => expense.vehicleId === vehicleId)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }

  function maintenanceCost(maintenanceId) {
    const linkedExpenses = db.expenses
      .filter((expense) => expense.maintenanceId === maintenanceId && expense.category === "Maintenance payment" && expense.status === "paid")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const item = maintenanceById(maintenanceId);
    if (linkedExpenses) return linkedExpenses;
    if (item?.status !== "completed") return 0;
    return Number(item?.actualCost || item?.paidAmount || 0);
  }

  function customerRevenue(customerId) {
    return db.payments
      .filter((payment) => payment.customerId === customerId)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function activityMatches(record, entityType, entityId) {
    if (record.entityType === entityType && record.entityId === entityId) return true;
    return record.related && (record.related.vehicleId === entityId || record.related.customerId === entityId || record.related.rentalId === entityId);
  }

  function addActivity(type, message, entityType, entityId, related) {
    db.activity.unshift({
      id: uid("act"),
      time: new Date().toISOString(),
      type,
      message,
      entityType,
      entityId,
      related: related || {}
    });
  }

  function syncVehicle(vehicleId) {
    const vehicle = vehicleById(vehicleId);
    if (!vehicle || vehicle.status === "inactive") return;
    if (activeRentalForVehicle(vehicleId)) {
      vehicle.status = "rented";
      return;
    }
    const openService = db.maintenance.some((item) => item.vehicleId === vehicleId && ["scheduled", "in_progress", "pending_payment"].includes(item.status));
    vehicle.status = openService ? "maintenance" : "available";
  }

  function alertItems() {
    const soon = addDays(7);
    const alerts = [];
    db.rentals.forEach((rental) => {
      const vehicle = vehicleById(rental.vehicleId);
      const customer = customerById(rental.customerId);
      const balance = rentalBalance(rental);
      if (balance > 0 && rental.status !== "closed") {
        alerts.push({
          id: "balance_" + rental.id,
          tone: rental.endDate < todayKey() ? "danger" : "warning",
          title: "Open rental balance",
          meta: `${customer?.name || "Customer"} / ${vehicle?.unit || "Vehicle"} / ${shortDate(rental.endDate)}`,
          value: money(balance),
          view: "rentals",
          rentalId: rental.id,
          vehicleId: rental.vehicleId,
          customerId: rental.customerId
        });
      }
      if (rental.status === "active" && rental.endDate >= todayKey() && rental.endDate <= soon) {
        alerts.push({
          id: "return_" + rental.id,
          tone: "notice",
          title: "Return coming up",
          meta: `${vehicle?.unit || "Vehicle"} due ${shortDate(rental.endDate)}`,
          value: customer?.name || "Customer",
          view: "fleet",
          vehicleId: rental.vehicleId,
          customerId: rental.customerId,
          rentalId: rental.id
        });
      }
    });
    db.maintenance.forEach((item) => {
      if (["scheduled", "in_progress", "pending_payment"].includes(item.status)) {
        const vehicle = vehicleById(item.vehicleId);
        alerts.push({
          id: "maint_" + item.id,
          tone: item.status === "in_progress" ? "warning" : "notice",
          title: item.type,
          meta: `${vehicle?.unit || "Vehicle"} / ${item.shop || "shop pending"} / ${shortDate(item.date)}`,
          value: item.status === "scheduled" ? shortDate(item.date) : tabLabel(item.status),
          view: "fleet",
          vehicleId: item.vehicleId
        });
      }
    });
    db.inspections.forEach((inspection) => {
      if (inspection.condition !== "Passed") {
        const vehicle = vehicleById(inspection.vehicleId);
        alerts.push({
          id: "inspection_" + inspection.id,
          tone: "danger",
          title: "Inspection issue",
          meta: `${vehicle?.unit || "Vehicle"} / ${inspection.condition}`,
          value: shortDate(inspection.date),
          view: "fleet",
          vehicleId: inspection.vehicleId
        });
      }
    });
    db.documents.forEach((doc) => {
      if (doc.expiryDate && doc.expiryDate >= todayKey() && doc.expiryDate <= addDays(30)) {
        alerts.push({
          id: "doc_" + doc.id,
          tone: "warning",
          title: "Document expiring",
          meta: `${documentTypeLabel(doc.type)} / ${entityName(doc.ownerType, doc.ownerId)}`,
          value: shortDate(doc.expiryDate),
          view: doc.ownerType === "vehicle" ? "fleet" : doc.ownerType === "customer" ? "customers" : "rentals",
          vehicleId: doc.ownerType === "vehicle" ? doc.ownerId : rentalById(doc.ownerId)?.vehicleId,
          customerId: doc.ownerType === "customer" ? doc.ownerId : rentalById(doc.ownerId)?.customerId,
          rentalId: doc.ownerType === "rental" ? doc.ownerId : ""
        });
      }
    });
    return alerts;
  }

  function financeEntries() {
    const income = db.payments.map((payment) => {
      const rental = rentalById(payment.rentalId);
      return {
        id: payment.id,
        date: payment.date,
        type: "income",
        label: "Rental payment",
        party: customerById(payment.customerId)?.name || "Customer",
        vehicle: vehicleById(payment.vehicleId)?.unit || "Vehicle",
        amount: Number(payment.amount || 0),
        method: payment.method || "",
        reference: payment.reference || "",
        rentalId: payment.rentalId,
        vehicleId: payment.vehicleId,
        customerId: payment.customerId,
        status: rental?.status || "paid"
      };
    });
    const expenses = db.expenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      type: expense.category === "Maintenance payment" ? "maintenance" : "expense",
      label: expense.category,
      party: expense.paymentMethod || "Payment",
      vehicle: vehicleById(expense.vehicleId)?.unit || "Vehicle",
      amount: -Math.abs(Number(expense.amount || 0)),
      method: expense.paymentMethod || "",
      reference: expense.status || "",
      rentalId: expense.rentalId || "",
      vehicleId: expense.vehicleId,
      customerId: rentalById(expense.rentalId)?.customerId || "",
      status: expense.status || "paid"
    }));
    return income.concat(expenses).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function entityName(type, id) {
    if (type === "vehicle") {
      const vehicle = vehicleById(id);
      return vehicle ? `${vehicle.unit} ${vehicle.make}` : "Vehicle";
    }
    if (type === "customer") return customerById(id)?.name || "Customer";
    if (type === "rental") {
      const rental = rentalById(id);
      return rental ? rentalCode(rental) : "Rental";
    }
    return "Record";
  }

  function statusBadge(status) {
    const value = String(status || "unknown");
    return `<span class="status status-${esc(value)}"><i></i>${esc(value.replace(/_/g, " "))}</span>`;
  }

  function iconSvg(name) {
    const aliases = {
      db: "dashboard",
      fl: "fleet",
      car: "fleet",
      vehicle: "fleet",
      vehicles: "fleet",
      rn: "rentals",
      rental: "rentals",
      cal: "rentals",
      cu: "customers",
      cus: "customers",
      customer: "customers",
      driver: "customers",
      drivers: "customers",
      dr: "customers",
      dc: "documents",
      doc: "documents",
      file: "documents",
      files: "documents",
      finance: "finance",
      money: "finance",
      payment: "payment",
      payments: "payment",
      "$": "finance",
      rp: "reports",
      rep: "reports",
      al: "alerts",
      st: "settings",
      "+": "add",
      "+r": "rentals",
      "+v": "fleet",
      "+c": "customers",
      "+driver": "customers",
      dl: "license",
      license: "license",
      licenses: "license",
      ins: "insurance",
      insurance: "insurance",
      agr: "agreement",
      agreement: "agreement",
      pic: "photo",
      photo: "photo",
      mt: "maintenance",
      maintenance: "maintenance",
      service: "maintenance",
      ex: "expense",
      expense: "expense",
      in: "inspection",
      inspection: "inspection"
    };
    const key = String(name || "add").toLowerCase();
    const icon = aliases[key] || key;
    const paths = {
      dashboard: `<rect x="4" y="4" width="6" height="7" rx="1.5"></rect><rect x="14" y="4" width="6" height="5" rx="1.5"></rect><rect x="4" y="15" width="6" height="5" rx="1.5"></rect><rect x="14" y="13" width="6" height="7" rx="1.5"></rect>`,
      fleet: `<path d="M5 17h14"></path><path d="M6.7 17l1.4-5.1A3 3 0 0 1 11 9.7h2a3 3 0 0 1 2.9 2.2l1.4 5.1"></path><path d="M7.8 13.2h8.4"></path><circle cx="8" cy="17" r="1.7"></circle><circle cx="16" cy="17" r="1.7"></circle>`,
      rentals: `<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 10h16"></path><path d="M8 15l2 2 5-5"></path>`,
      customers: `<circle cx="9" cy="8" r="3"></circle><path d="M3.8 20a5.2 5.2 0 0 1 10.4 0"></path><path d="M16 11a2.5 2.5 0 1 0-1.1-4.7"></path><path d="M15.5 15.2A4.4 4.4 0 0 1 20.5 20"></path>`,
      documents: `<path d="M7 3.8h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.3a1.5 1.5 0 0 1 1-1.5z"></path><path d="M14 4v4h4"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>`,
      finance: `<rect x="3.5" y="6" width="17" height="12" rx="2"></rect><path d="M3.5 10h17"></path><path d="M8 15h3"></path><path d="M15.5 15.5c1.2 0 2-.6 2-1.5s-.8-1.5-2-1.5-2-.6-2-1.5.8-1.5 2-1.5"></path>`,
      payment: `<rect x="3.5" y="6" width="17" height="12" rx="2"></rect><path d="M3.5 10h17"></path><path d="M7 15h4"></path><path d="M16 13v4"></path><path d="M14 15h4"></path>`,
      reports: `<path d="M4 20h16"></path><rect x="6" y="11" width="3" height="6" rx="1"></rect><rect x="11" y="7" width="3" height="10" rx="1"></rect><rect x="16" y="4" width="3" height="13" rx="1"></rect>`,
      alerts: `<path d="M18 10a6 6 0 1 0-12 0c0 7-2 7-2 8h16c0-1-2-1-2-8"></path><path d="M10 21h4"></path>`,
      settings: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9.1 8 8 0 0 1-1.5.6 1.6 1.6 0 0 0-1.2 1.4V22H9v-.3a1.6 1.6 0 0 0-1.2-1.4 8 8 0 0 1-1.5-.6 1.7 1.7 0 0 0-1.9-.1l-.2.1-2-3.4.1-.1a1.6 1.6 0 0 0 .3-1.8 7 7 0 0 1 0-1.8 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9-.1 8 8 0 0 1 1.5-.6A1.6 1.6 0 0 0 9 5.3V5h6v.3a1.6 1.6 0 0 0 1.2 1.4 8 8 0 0 1 1.5.6 1.7 1.7 0 0 0 1.9.1l.2-.1 2 3.4-.1.1a1.6 1.6 0 0 0-.3 1.8 7 7 0 0 1 0 1.8z"></path>`,
      add: `<circle cx="12" cy="12" r="8"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path>`,
      license: `<rect x="3.8" y="5.5" width="16.4" height="13" rx="2"></rect><circle cx="9" cy="11" r="2"></circle><path d="M6.8 16a3.2 3.2 0 0 1 4.4 0"></path><path d="M14 10h3"></path><path d="M14 14h3.8"></path>`,
      insurance: `<path d="M12 3.5l7 3v5.3c0 4.3-2.8 7.4-7 8.7-4.2-1.3-7-4.4-7-8.7V6.5l7-3z"></path><path d="M8.7 12l2.1 2.1 4.6-4.8"></path>`,
      agreement: `<path d="M7 3.8h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.3a1.5 1.5 0 0 1 1-1.5z"></path><path d="M14 4v4h4"></path><path d="M9 15.5l2.2 2.2 4.8-5"></path>`,
      photo: `<path d="M5 7.5h3l1.4-2h5.2l1.4 2h3a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 5 7.5z"></path><circle cx="12" cy="13" r="3.2"></circle>`,
      maintenance: `<path d="M14.7 6.3a4.1 4.1 0 0 0-5.1 5.1L4.2 16.8a1.8 1.8 0 0 0 2.5 2.5l5.4-5.4a4.1 4.1 0 0 0 5.1-5.1l-2.6 2.6-2-2 2.1-3.1z"></path>`,
      expense: `<path d="M7 3.8h10v16.4l-2-1.1-2 1.1-2-1.1-2 1.1-2-1.1-2 1.1V5.8a2 2 0 0 1 2-2z"></path><path d="M9 9h6"></path><path d="M9 13h5"></path>`,
      inspection: `<path d="M8 5.5h8"></path><path d="M9 3.5h6v4H9z"></path><rect x="5" y="6" width="14" height="15" rx="2"></rect><path d="M8.5 14l2 2 5-5"></path>`
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[icon] || paths.add}</g></svg>`;
  }

  function navButton(item) {
    return `<button class="nav-${esc(tokenClass(item.id))} ${ui.view === item.id ? "active" : ""}" data-view="${item.id}"><span>${iconSvg(item.icon)}</span><b>${esc(item.label)}</b>${item.id === "alerts" && alertItems().length ? `<em>${alertItems().length}</em>` : ""}</button>`;
  }

  function currentPageLabel(fallback) {
    if (ui.view === "fleet" && ui.fleetMode === "profile") {
      const vehicle = vehicleById(ui.vehicleId);
      if (vehicle) return vehicle.unit;
    }
    if (ui.view === "customers" && ui.customerMode === "profile") {
      const customer = customerById(ui.customerId);
      if (customer) return customer.name;
    }
    if (ui.view === "rentals" && ui.rentalMode === "profile") {
      const rental = rentalById(ui.rentalId);
      if (rental) return rentalCode(rental);
    }
    return fallback;
  }

  function documentGroupById(id) {
    return DOCUMENT_GROUPS.find((group) => group.id === id) || DOCUMENT_GROUPS[0];
  }

  function documentMatchesGroup(doc, groupId) {
    const group = documentGroupById(groupId);
    if (!group.types.length) return true;
    return group.types.includes(doc.type);
  }

  function documentsByFilter(filter) {
    return db.documents.filter((doc) => documentMatchesGroup(doc, filter));
  }

  function documentGroupCount(filter) {
    return documentsByFilter(filter).length;
  }

  function documentTypeIcon(type) {
    const value = String(type || "").toLowerCase();
    if (value.includes("license")) return "license";
    if (value.includes("insurance")) return "insurance";
    if (value.includes("agreement")) return "agreement";
    if (value.includes("photo") || value.includes("inspection")) return "photo";
    return "documents";
  }

  function documentTypeLabel(type) {
    return type === "Driver insurance" ? "Customer insurance" : type;
  }

  function render() {
    if (!auth) {
      app.innerHTML = renderLogin();
      return;
    }
    if (auth.role === "customer") {
      app.innerHTML = renderCustomerPortal();
      return;
    }
    const activeNav = NAV.find((item) => item.id === ui.view) || NAV[0];
    const isHome = ui.view === "dashboard";
    const pageLabel = currentPageLabel(activeNav.label);
    app.innerHTML = `
      <div class="app-frame ${isHome ? "home-frame" : ""}">
        ${isHome ? "" : `<aside class="side-rail">
          <div class="brand-block">
            <span class="brand-mark">${iconSvg("fleet")}</span>
            <div><strong>${esc(db.settings.companyName)}</strong><small>Rental management</small></div>
          </div>
          <nav>${NAV.map(navButton).join("")}</nav>
          <div class="side-add">
            <button class="primary-add" data-action="toggle-add">+ Add</button>
            ${renderAddMenu("side")}
          </div>
        </aside>`}
        <main class="main">
          <header class="topbar ${isHome ? "home-topbar" : ""}">
            <div><small>${esc(db.settings.location)}</small><h1>${esc(isHome ? db.settings.companyName : pageLabel)}</h1></div>
            <div class="topbar-actions">
              ${renderDatabaseStatus()}
              <button class="ghost-btn account-btn" data-action="open-password">${iconSvg("settings")}Password</button>
              <button class="ghost-btn user-chip" data-action="logout">${esc(auth.user?.name || auth.name || "Staff")}</button>
              ${isHome ? "" : `<button class="ghost-btn" data-view="dashboard">Home</button>`}
              <button class="ghost-btn" data-view="alerts">Alerts ${alertItems().length ? `<span>${alertItems().length}</span>` : ""}</button>
              <button class="primary-add" data-action="toggle-add">+ Add</button>
              ${renderAddMenu("top")}
            </div>
          </header>
          <section class="content">
            ${ui.toast ? `<div class="toast"><b>Saved</b><span>${esc(ui.toast)}</span><button data-action="dismiss-toast">X</button></div>` : ""}
            ${renderView()}
          </section>
        </main>
        ${renderModal()}
      </div>
    `;
  }

  function renderDatabaseStatus() {
    return `<button class="db-chip ${esc(dbState.state)}" data-action="refresh-db" title="${esc(dbState.detail || "Refresh database")}"><i></i>${esc(dbState.label)}</button>`;
  }

  function renderLogin() {
    return `<main class="login-screen">
      <section class="login-panel">
        <div class="login-brand">
          <span>${iconSvg("fleet")}</span>
          <div><small>Fleet access</small><h1>${esc(db.settings.companyName || "Rental Management")}</h1></div>
        </div>
        <form data-form="login" class="login-form">
          ${field("Mobile number", "username", "", "tel", true)}
          ${field("Password", "password", "", "password", true)}
          ${loginState.error ? `<div class="login-error">${esc(loginState.error)}</div>` : ""}
          <button class="primary-add">${loginState.busy ? "Checking..." : "Login"}</button>
        </form>
        <div class="login-help">
          <span><b>Staff</b> Use the desk mobile number and password.</span>
          <span><b>Customer</b> Use the mobile number saved on the rental.</span>
        </div>
      </section>
    </main>`;
  }

  function renderCustomerPortal() {
    const customer = db.customers[0] || null;
    const rentals = customer ? rentalsForCustomer(customer.id) : [];
    const rental = rentals.find((item) => item.status === "active") || rentals.find((item) => item.status === "reserved") || rentals[0] || null;
    const vehicle = rental ? vehicleById(rental.vehicleId) : null;
    const rentalDocs = rental ? documentsFor("rental", rental.id) : [];
    const customerDocs = customer ? documentsFor("customer", customer.id) : [];
    const vehicleDocs = vehicle ? documentsFor("vehicle", vehicle.id).filter((doc) => ["Vehicle insurance", "Registration"].includes(doc.type)) : [];
    const readingItems = rental
      ? db.inspections.filter((item) => item.rentalId === rental.id || item.customerId === customer?.id).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      : [];
    return `<div class="customer-shell">
      <header class="customer-topbar">
        <div class="login-brand small">
          <span>${iconSvg("fleet")}</span>
          <div><small>Customer portal</small><h1>${esc(customer?.name || auth.user?.name || "Customer")}</h1></div>
        </div>
        <div class="topbar-actions">
          ${renderDatabaseStatus()}
          <button class="ghost-btn account-btn" data-action="open-password">${iconSvg("settings")}Password</button>
          <button class="ghost-btn" data-action="logout">Logout</button>
        </div>
      </header>
      <main class="customer-content">
        ${rental && vehicle ? `
          <section class="customer-hero-card">
            <div>
              <small>Assigned vehicle</small>
              <h2>${esc(vehicle.unit)} / ${esc(vehicle.make)} ${esc(vehicle.model)}</h2>
              <p>${esc(vehicle.year)} / ${esc(vehicle.plate)} / ${number(vehicle.mileage)} miles</p>
            </div>
            ${statusBadge(rental.status)}
          </section>
          ${rental.settlement ? `<section class="customer-info-card"><h3>My rental balance</h3><p>Rent: ${money(rental.settlement.rentCharged)} · Contract deposit: ${money(rental.settlement.deposit)} · Received: ${money(rental.settlement.received)}</p><b>Due today: ${money(rental.settlement.due)}</b><p>Future rent (not yet due): ${money(rental.settlement.futureRent || 0)}. ${rental.settlement.nextDueDate ? `Next payment: ${shortDate(rental.settlement.nextDueDate)} · ${money(rental.settlement.nextAmount)}` : "No further scheduled rent payments."}</p><p>Credit above contract: ${money(rental.settlement.credit)}. Maintenance and business expenses are excluded. Deposit refunds are settled separately.</p>${rental.returnDate ? `<p>Returned ${shortDate(rental.returnDate)}</p>` : ""}</section>` : ""}
          <section class="customer-grid">
            <article class="customer-info-card">
              <small>Rental</small>
              <b>${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}</b>
              <span>${esc(rental.pickupLocation || "Pickup location not saved")}</span>
            </article>
            <article class="customer-info-card">
              <small>My details</small>
              <b>${esc(customer?.phone || "Phone not saved")}</b>
              <span>${esc(customer?.address || "Address not saved")}</span>
            </article>
            <article class="customer-info-card">
              <small>License</small>
              <b>${esc(rental.licenseNumber || customer?.license || "Not saved")}</b>
              <span>${rental.licenseExpiry ? "Expires " + shortDate(rental.licenseExpiry) : "Expiry not saved"}</span>
            </article>
            <article class="customer-info-card">
              <small>Insurance</small>
              <b>${esc(rental.insuranceCompany || "Not saved")}</b>
              <span>${rental.insuranceExpiry ? "Expires " + shortDate(rental.insuranceExpiry) : "Expiry not saved"}</span>
            </article>
          </section>
          <section class="two-column customer-two-column">
            <div class="panel">
              <div class="panel-head"><div><small>Update</small><h3>Miles, fuel, photo</h3></div></div>
              ${customerCheckInForm(rental, vehicle)}
            </div>
            <div class="panel">
              <div class="panel-head"><div><small>Documents</small><h3>My files</h3></div></div>
              ${renderCustomerDocumentList(customerDocs.concat(rentalDocs, vehicleDocs))}
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><div><small>Readings</small><h3>Submitted updates</h3></div></div>
            ${readingItems.length ? `<div class="customer-reading-list">${readingItems.map(customerReadingCard).join("")}</div>` : emptyBox("No readings", "Mileage, fuel, and photo updates will appear here.")}
          </section>
        ` : emptyBox("No assigned vehicle", "A current rental assignment is not available for this customer.")}
      </main>
      ${renderModal()}
    </div>`;
  }

  function customerCheckInForm(rental, vehicle) {
    return `<form data-form="customer-checkin" class="customer-checkin-form">
      ${hiddenField("rentalId", rental.id)}
      ${hiddenField("vehicleId", vehicle.id)}
      ${field("Date", "date", todayKey(), "date", true)}
      ${field("Current miles", "odometer", vehicle.mileage || "", "number", true)}
      ${selectField("Fuel / charge", "fuel", ["Full", "Three quarters", "Half", "Quarter", "Empty", "EV charged"], "Full")}
      ${fileField("Vehicle photo", "photo", "image/*", false)}
      ${textarea("Notes", "notes", "")}
      <footer><button class="primary-add">Submit update</button></footer>
    </form>`;
  }

  function renderCustomerDocumentList(docs) {
    if (!docs.length) return emptyBox("No files", "Saved rental documents will appear here.");
    return `<section class="document-grid">${docs.map(customerDocumentCard).join("")}</section>`;
  }

  function customerDocumentCard(doc) {
    const hasFile = Boolean(doc.fileData);
    const isImage = String(doc.fileType || "").startsWith("image/");
    const fileMeta = hasFile
      ? [doc.fileName || "Saved file", fileSizeLabel(doc.fileSize)].filter(Boolean).join(" / ")
      : "File record saved";
    const visual = hasFile && isImage
      ? `<img src="${esc(doc.fileData)}" alt="${esc(doc.type)}">`
      : `<span>${iconSvg(documentTypeIcon(doc.type))}</span>`;
    return `<article class="document-card customer-document-card">
      ${visual}
      <div>
        <b>${esc(documentTypeLabel(doc.type))}</b>
        <small>${esc(fileMeta)}</small>
        <small>${doc.expiryDate ? "Expires " + shortDate(doc.expiryDate) : entityName(doc.ownerType, doc.ownerId)}</small>
      </div>
      <footer>
        ${hasFile ? `<button class="mini-btn primary" data-action="open-document" data-id="${esc(doc.id)}">Open</button>` : ""}
      </footer>
    </article>`;
  }

  function customerReadingCard(item) {
    const docs = db.documents.filter((doc) => doc.ownerType === "rental" && doc.ownerId === item.rentalId && doc.type === "Inspection photo");
    return `<article class="customer-reading-card">
      <div><b>${number(item.odometer)} miles</b><small>${shortDate(item.date)} / ${esc(item.fuel || "Fuel not saved")}</small></div>
      <span>${docs.length ? `${number(docs.length)} photo` : "No photo"}</span>
    </article>`;
  }

  function renderAddMenu(location) {
    if (!ui.addMenu) return "";
    return `<div class="add-menu ${location === "top" ? "top-menu" : ""}">
      ${ADD_ITEMS.map((item) => `<button data-action="open-add" data-type="${esc(item.type)}"><span>${iconSvg(addIcon(item.type))}</span>${esc(item.label)}</button>`).join("")}
    </div>`;
  }

  function addIcon(type) {
    return { rental: "rentals", maintenance: "maintenance", payment: "payment", expense: "expense", inspection: "inspection", document: "documents", vehicle: "fleet", customer: "customers" }[type] || "add";
  }

  function renderView() {
    if (ui.view === "dashboard") return renderDashboard();
    if (ui.view === "fleet") return renderFleet();
    if (ui.view === "rentals") return renderRentals();
    if (ui.view === "customers") return renderCustomers();
    if (ui.view === "documents") return renderDocuments();
    if (ui.view === "finance") return renderFinance();
    if (ui.view === "reports") return renderReports();
    if (ui.view === "alerts") return renderAlertsPage();
    if (ui.view === "settings") return renderSettings();
    return renderDashboard();
  }

  function renderDashboard() {
    const activeRentals = db.rentals.filter((rental) => rental.status === "active");
    const available = db.vehicles.filter((vehicle) => vehicle.status === "available").length;
    const balances = db.rentals.reduce((sum, rental) => sum + rentalBalance(rental), 0);
    const revenue = db.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const expenses = db.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const openAlerts = alertItems().length;
    const documentCount = documentGroupCount("all");
    return `
      <section class="home-menu">
        ${homeSection("Rental Management", [
          homeTile("Fleet", "fleet", { view: "fleet", meta: `${available}/${db.vehicles.length} available` }),
          homeTile("Rentals", "rentals", { view: "rentals", meta: `${activeRentals.length} active` }),
          homeTile("Customers", "customers", { view: "customers", meta: `${db.customers.length} records` }),
          homeTile("Finance", "finance", { view: "finance", meta: `${money(revenue - expenses)} net` })
        ])}
        ${homeSection("Quick Add", [
          homeTile("New Rental", "rentals", { action: "open-add", type: "rental" }),
          homeTile("Add Vehicle", "fleet", { action: "open-add", type: "vehicle" }),
          homeTile("Add Customer", "customers", { action: "open-add", type: "customer" }),
          homeTile("Payment", "payment", { action: "open-add", type: "payment" })
        ])}
        ${homeSection("Documents", [
          homeTile("Driver License", "license", { view: "documents", documentFilter: "licenses", meta: `${documentGroupCount("licenses")} saved` }),
          homeTile("Insurance", "insurance", { view: "documents", documentFilter: "insurance", meta: `${documentGroupCount("insurance")} saved` }),
          homeTile("Agreement", "agreement", { view: "documents", documentFilter: "agreements", meta: `${documentGroupCount("agreements")} saved` }),
          homeTile("Inspection Photo", "photo", { view: "documents", documentFilter: "photos", meta: `${documentGroupCount("photos")} saved` })
        ])}
        ${homeSection("Tools", [
          homeTile("Reports", "reports", { view: "reports" }),
          homeTile("Alerts", "alerts", { view: "alerts", badge: openAlerts || "", meta: openAlerts ? `${openAlerts} open` : "clear" }),
          homeTile("Settings", "settings", { view: "settings" }),
          homeTile("All Documents", "documents", { view: "documents", documentFilter: "all", meta: `${documentCount} saved` })
        ])}
      </section>
    `;
  }

  function homeSection(title, tiles) {
    return `<section class="home-section">
      <h2>${esc(title)}</h2>
      <div class="home-grid">${tiles.join("")}</div>
    </section>`;
  }

  function homeTile(label, icon, options) {
    const attrs = [];
    if (options.view) attrs.push(`data-view="${esc(options.view)}"`);
    if (options.action) attrs.push(`data-action="${esc(options.action)}"`);
    if (options.type) attrs.push(`data-type="${esc(options.type)}"`);
    if (options.ownerType) attrs.push(`data-owner-type="${esc(options.ownerType)}"`);
    if (options.documentType) attrs.push(`data-document-type="${esc(options.documentType)}"`);
    if (options.documentFilter) attrs.push(`data-document-filter="${esc(options.documentFilter)}"`);
    if (options.tab) attrs.push(`data-tab="${esc(options.tab)}"`);
    return `<button class="home-tile home-tile-${esc(tokenClass(icon))}" ${attrs.join(" ")}>
      <span class="home-icon">${iconSvg(icon)}${options.badge ? `<em>${esc(options.badge)}</em>` : ""}</span>
      <b>${esc(label)}</b>
      ${options.meta ? `<small>${esc(options.meta)}</small>` : ""}
    </button>`;
  }

  function entityCrumb(parent, title, subtitle, list) {
    return `<div class="entity-crumb">
      <button class="back-btn" data-action="back-to-list" data-list="${esc(list)}">Back</button>
      <div>
        <small>${esc(parent)} &gt;</small>
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle || "")}</p>
      </div>
    </div>`;
  }

  function contextActionMenu(menuId, items) {
    return `<div class="context-actions">
      <button class="soft-btn" data-action="toggle-context" data-menu="${esc(menuId)}">Actions</button>
      ${ui.actionMenu === menuId ? `<div class="context-menu">${items.filter(Boolean).map(contextActionButton).join("")}</div>` : ""}
    </div>`;
  }

  function contextActionButton(item) {
    const attrs = [`data-action="${esc(item.action || "open-add")}"`];
    if (item.type) attrs.push(`data-type="${esc(item.type)}"`);
    if (item.id) attrs.push(`data-id="${esc(item.id)}"`);
    if (item.vehicleId) attrs.push(`data-vehicle-id="${esc(item.vehicleId)}"`);
    if (item.customerId) attrs.push(`data-customer-id="${esc(item.customerId)}"`);
    if (item.rentalId) attrs.push(`data-rental-id="${esc(item.rentalId)}"`);
    if (item.paymentKind) attrs.push(`data-payment-kind="${esc(item.paymentKind)}"`);
    if (item.ownerType) attrs.push(`data-owner-type="${esc(item.ownerType)}"`);
    if (item.ownerId) attrs.push(`data-owner-id="${esc(item.ownerId)}"`);
    if (item.documentType) attrs.push(`data-document-type="${esc(item.documentType)}"`);
    return `<button ${attrs.join(" ")}>${esc(item.label)}</button>`;
  }

  function metric(label, value, hint, tone) {
    return `<article class="metric ${esc(tone || "")}"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(hint)}</small></article>`;
  }

  function renderFleet() {
    const vehicles = filterRecords(db.vehicles.filter(vehicle => ui.fleetArchive === "all" || (ui.fleetArchive === "archived" ? vehicle.status === "inactive" : vehicle.status !== "inactive")), ["unit", "make", "model", "plate", "status"]);
    const selected = vehicleById(ui.vehicleId);
    if (ui.fleetMode === "profile" && selected) {
      return `
        <section class="entity-page">
          ${entityCrumb("Fleet", selected.unit, `${selected.make} ${selected.model}`, "fleet")}
          <section class="profile-surface entity-profile">
            ${renderVehicleProfile(selected)}
          </section>
        </section>
      `;
    }
    return `
      <section class="directory-page">
        <div class="page-title">
          <div><small>Fleet</small><h2>Choose a car</h2></div>
          <button class="primary-add" data-action="open-add" data-type="vehicle">+ Vehicle</button>
        </div>
        ${searchBox("Search cars, plates, status")}
        <nav class="tabs" aria-label="Fleet visibility">${["current", "archived", "all"].map(value => `<button class="${(ui.fleetArchive || "current") === value ? "active" : ""}" data-action="directory-filter" data-type="vehicle" data-filter="${value}">${tabLabel(value)}</button>`).join("")}</nav>
        <div class="directory-list">
          ${vehicles.map((vehicle) => vehicleListButton(vehicle, "")).join("") || emptyBox("No cars match", "Add or search another vehicle.")}
        </div>
      </section>
    `;
  }

  function vehicleListButton(vehicle, selectedId) {
    const rental = activeRentalForVehicle(vehicle.id);
    return `<button class="record-button ${vehicle.id === selectedId ? "active" : ""}" data-action="select-vehicle" data-id="${esc(vehicle.id)}">
      <span class="record-icon">${iconSvg("fleet")}</span>
      <span><b>${esc(vehicle.unit)}</b><small>${esc(vehicle.make + " " + vehicle.model)} / ${esc(rental ? customerById(rental.customerId)?.name || "Customer" : vehicle.location)}</small></span>
      ${statusBadge(vehicle.status)}
    </button>`;
  }

  function renderVehicleProfile(vehicle) {
    if (ui.vehicleTab && !vehicleTabs.includes(ui.vehicleTab)) ui.vehicleTab = "";
    const rental = activeRentalForVehicle(vehicle.id);
    const customer = rental ? customerById(rental.customerId) : null;
    const balance = rental ? rentalBalance(rental) : 0;
    return `
      <header class="profile-header">
        <div class="vehicle-title">
          <span class="plate">${esc(vehicle.unit)}</span>
          <div><h2>${esc(vehicle.make)} ${esc(vehicle.model)}</h2><p>${esc(vehicle.year)} / ${esc(vehicle.plate)} / ${number(vehicle.mileage)} miles</p></div>
        </div>
        <div class="profile-actions">
          ${statusBadge(vehicle.status)}
          <button class="soft-btn" data-action="edit-vehicle" data-id="${esc(vehicle.id)}">Edit vehicle</button>
          ${rental ? `<button class="primary-add" data-action="edit-contract" data-id="${esc(rental.id)}">Edit contract</button>` : ""}
          ${rental ? `<button class="soft-btn" data-action="change-vehicle" data-id="${esc(rental.id)}">Change vehicle</button>` : vehicle.status === "available" ? `<button class="primary-add" data-action="open-add" data-type="rental" data-vehicle-id="${esc(vehicle.id)}">Assign to customer</button>` : ""}
          ${contextActionMenu(`vehicle-${vehicle.id}`, [
            { label: vehicle.status === "inactive" ? "Restore vehicle" : "Archive / delete vehicle", action: "manage-record", id: vehicle.id, type: "vehicle" },
            rental
              ? { label: "Record payment", type: "payment", vehicleId: vehicle.id, rentalId: rental.id, customerId: rental.customerId }
              : vehicle.status === "available" ? { label: "Start rental", type: "rental", vehicleId: vehicle.id } : null,
            vehicle.status === "available" ? { label: "Add rental", type: "rental", vehicleId: vehicle.id } : null,
            { label: "Add service", type: "maintenance", vehicleId: vehicle.id },
            { label: "Add inspection", type: "inspection", vehicleId: vehicle.id, rentalId: rental?.id || "" },
            { label: "Add file", type: "document", ownerType: "vehicle", ownerId: vehicle.id }
          ])}
        </div>
      </header>
      <nav class="tabs">${vehicleTabs.map((tab) => `<button class="${ui.vehicleTab === tab ? "active" : ""}" data-action="vehicle-tab" data-tab="${tab}">${tabLabel(tab)}</button>`).join("")}</nav>
      ${renderVehicleTab(vehicle, rental, customer, balance)}
    `;
  }

  function renderVehicleTab(vehicle, rental, customer, balance) {
    if (!ui.vehicleTab) return "";
    if (ui.vehicleTab === "rentals") return renderVehicleRentals(vehicle);
    if (ui.vehicleTab === "service") return renderVehicleMaintenance(vehicle);
    if (ui.vehicleTab === "files") {
      return `<section class="simple-section">
        <div class="simple-head"><div><h3>Files</h3><p>Insurance, registration, agreements, photos, and receipts</p></div><button class="soft-btn" data-action="open-add" data-type="document" data-owner-type="vehicle" data-owner-id="${esc(vehicle.id)}">Add file</button></div>
        ${renderDocumentList(documentsFor("vehicle", vehicle.id).concat(documentsForVehicleRentals(vehicle.id)))}
      </section>`;
    }
    return `
      <section class="profile-grid">
        <article class="profile-card">
          <small>Current rental</small>
          <h3>${rental ? esc(customer?.name || "Customer") : "Available for rental"}</h3>
          <p>${rental ? `${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}` : esc(vehicle.location)}</p>
        </article>
        <article class="profile-card">
          <small>Balance</small>
          <h3>${money(balance)}</h3>
          <p>${rental ? `${money(rentalPaid(rental.id))} received / ${money(rentalTotal(rental))} contract` : "No active rental balance"}</p>
        </article>
        <article class="profile-card">
          <small>Service</small>
          <h3>${esc(vehicle.nextService ? shortDate(vehicle.nextService) : "Not scheduled")}</h3>
          <p>${number(db.maintenance.filter((item) => item.vehicleId === vehicle.id).length)} maintenance records</p>
        </article>
        <article class="profile-card">
          <small>Ownership</small>
          <h3>${money(vehicle.loanBalance)}</h3>
          <p>${money(vehicle.monthlyPayment)} monthly / ${money(vehicle.acquisitionCost)} cost</p>
        </article>
      </section>
      <section class="detail-grid">
        ${detail("VIN", vehicle.vin)}
        ${detail("Plate", vehicle.plate)}
        ${detail("Color", vehicle.color)}
        ${detail("Location", vehicle.location)}
        ${detail("Insurance expiry", shortDate(vehicle.insuranceExpiry))}
        ${detail("Mileage", number(vehicle.mileage))}
      </section>
    `;
  }

  function renderVehicleRentals(vehicle) {
    const rentals = rentalsForVehicle(vehicle.id).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    const active = rentals.find((item) => item.status === "active");
    return `<section class="simple-section">
      <div class="simple-head">
        <div><h3>Rentals</h3><p>${number(rentals.length)} rental records for this car</p></div>
        <div class="title-actions">
          ${active ? `<button class="soft-btn primary-soft" data-action="open-add" data-type="payment" data-vehicle-id="${esc(vehicle.id)}" data-rental-id="${esc(active.id)}" data-customer-id="${esc(active.customerId)}">Record payment</button>` : ""}
          ${vehicle.status === "available" ? `<button class="soft-btn" data-action="open-add" data-type="rental" data-vehicle-id="${esc(vehicle.id)}">Add rental</button>` : ""}
        </div>
      </div>
      ${renderCompactRentals(rentals)}
    </section>`;
  }

  function renderVehicleMaintenance(vehicle) {
    const service = db.maintenance.filter((item) => item.vehicleId === vehicle.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const inspections = db.inspections.filter((item) => item.vehicleId === vehicle.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <section class="simple-section">
        <div class="simple-head"><div><h3>Service</h3><p>${number(service.length)} service records, ${number(inspections.length)} inspections</p></div><div class="title-actions"><button class="soft-btn" data-action="open-add" data-type="maintenance" data-vehicle-id="${esc(vehicle.id)}">Add service</button><button class="soft-btn" data-action="open-add" data-type="inspection" data-vehicle-id="${esc(vehicle.id)}">Add inspection</button></div></div>
        <div class="two-column plain">
          <div>
          ${service.length ? service.map(maintenanceCard).join("") : emptyBox("No maintenance", "Service records for this car will appear here.")}
          </div>
          <div>
          ${inspections.length ? inspections.map(inspectionCard).join("") : emptyBox("No inspections", "Pickup, return, and service inspections will appear here.")}
          </div>
        </div>
      </section>
    `;
  }

  function renderVehicleFinancials(vehicle) {
    const entries = financeEntries().filter((entry) => entry.vehicleId === vehicle.id);
    const revenue = vehicleRevenue(vehicle.id);
    const costs = vehicleExpenses(vehicle.id);
    return `
      <section class="metric-grid tight">
        ${metric("Income", money(revenue), "payments received", "green")}
        ${metric("Expenses", money(costs), "service and operations", costs ? "amber" : "green")}
        ${metric("Net", money(revenue - costs), "income minus costs", revenue - costs >= 0 ? "green" : "danger")}
        ${metric("Loan", money(vehicle.loanBalance), `${money(vehicle.monthlyPayment)} monthly`, "blue")}
      </section>
      ${financeTable(entries)}
    `;
  }

  function renderCustomers() {
    const customers = filterRecords(db.customers.filter(customer => ui.customerArchive === "all" || (ui.customerArchive === "closed" ? customerClosed(customer) : !customerClosed(customer))), ["name", "phone", "email", "license", "status"]);
    const selected = customerById(ui.customerId);
    if (ui.customerMode === "profile" && selected) {
      return `
        <section class="entity-page">
          ${entityCrumb("Customers", selected.name, selected.phone, "customers")}
          <section class="profile-surface entity-profile">
            ${renderCustomerProfile(selected)}
          </section>
        </section>
      `;
    }
    return `
      <section class="directory-page">
        <div class="page-title">
          <div><small>Customers</small><h2>Choose a customer</h2></div>
          <button class="primary-add" data-action="open-add" data-type="customer">+ Customer</button>
        </div>
        ${searchBox("Search customers, phone, license")}
        <nav class="tabs" aria-label="Customer visibility">${["current", "closed", "all"].map(value => `<button class="${(ui.customerArchive || "current") === value ? "active" : ""}" data-action="directory-filter" data-type="customer" data-filter="${value}">${value === "closed" ? "Closed / archived" : tabLabel(value)}</button>`).join("")}</nav>
        <div class="directory-list">
          ${customers.map((customer) => customerListButton(customer, "")).join("") || emptyBox("No customers match", "Add or search another customer.")}
        </div>
      </section>
    `;
  }

  function customerListButton(customer, selectedId) {
    const rentals = rentalsForCustomer(customer.id);
    const active = rentals.find((rental) => rental.status === "active");
    return `<button class="record-button ${customer.id === selectedId ? "active" : ""}" data-action="select-customer" data-id="${esc(customer.id)}">
      <span class="record-icon">${iconSvg("customers")}</span>
      <span><b>${esc(customer.name)}</b><small>${esc(active ? vehicleById(active.vehicleId)?.unit || "Active rental" : customer.phone)}</small></span>
      ${statusBadge(active ? "active_rental" : customer.status)}
    </button>`;
  }

  function renderCustomerProfile(customer) {
    if (!customerTabs.includes(ui.customerTab)) ui.customerTab = "info";
    const rentals = rentalsForCustomer(customer.id);
    const openRentals = rentals.filter(rental => ["active", "reserved"].includes(rental.status));
    const active = openRentals.length === 1 && openRentals[0].status === "active" ? openRentals[0] : null;
    return `
      <header class="profile-header">
        <div class="vehicle-title">
          <span class="plate icon-plate">${iconSvg("customers")}</span>
          <div><h2>${esc(customer.name)}</h2><p>${esc(customer.phone)} / ${esc(customer.email || "email not saved")}</p></div>
        </div>
        <div class="profile-actions">
          ${statusBadge(customer.status)}
          <button class="soft-btn" data-action="edit-customer" data-id="${esc(customer.id)}">Edit customer</button>
          ${active ? `<button class="primary-add" data-action="edit-contract" data-id="${esc(active.id)}">Edit contract</button>` : ""}
          <button class="primary-add" data-action="open-add" data-type="rental" data-customer-id="${esc(customer.id)}">Assign vehicle</button>
          ${active ? `<button class="soft-btn" data-action="change-vehicle" data-id="${esc(active.id)}">Change vehicle</button>` : ""}
          ${contextActionMenu(`customer-${customer.id}`, [
            { label: customerClosed(customer) ? "Restore / delete customer" : "Archive / delete customer", action: "manage-record", id: customer.id, type: "customer" },
            { label: "Add rental", type: "rental", customerId: customer.id },
            active ? { label: "Record payment", type: "payment", rentalId: active.id, vehicleId: active.vehicleId, customerId: customer.id } : { label: "Add driver license", type: "document", ownerType: "customer", ownerId: customer.id, documentType: "Driver license" },
            { label: "Set temporary password", action: "reset-customer-password", customerId: customer.id },
            { label: "Add file", type: "document", ownerType: "customer", ownerId: customer.id }
          ])}
        </div>
      </header>
      <section class="simple-section"><h3>Assigned vehicles (${openRentals.length})</h3><p>${openRentals.length > 1 ? "This customer has multiple open contracts. Choose the exact vehicle below to edit, return, or remove an accidental assignment." : "Manage each assignment from its own contract."}</p>
        ${openRentals.map(rental => `<section class="return-settlement"><h3>${esc(vehicleById(rental.vehicleId)?.unit || "Missing vehicle")} · ${esc(rentalCode(rental))}</h3><p>${esc(rental.status)} · ${shortDate(rental.startDate)} to ${shortDate(rental.endDate)} · Due today: ${money(rentalBalance(rental))}</p><div class="row-actions"><button class="soft-btn" data-action="select-rental" data-id="${esc(rental.id)}">Open contract</button><button class="soft-btn" data-action="close-rental" data-id="${esc(rental.id)}">Return vehicle</button><button class="soft-btn" data-action="cancel-assignment" data-id="${esc(rental.id)}">Remove mistaken assignment</button></div></section>`).join("") || '<p>No open vehicle assignments.</p>'}
      </section>
      <nav class="tabs">${customerTabs.map((tab) => `<button class="${ui.customerTab === tab ? "active" : ""}" data-action="customer-tab" data-tab="${tab}">${tabLabel(tab)}</button>`).join("")}</nav>
      ${renderCustomerTab(customer, rentals)}
    `;
  }

  function renderCustomerTab(customer, rentals) {
    if (ui.customerTab === "rentals") {
      return `<section class="simple-section">
        <div class="simple-head"><div><h3>Rentals</h3><p>${number(rentals.length)} rental records for this customer</p></div><button class="soft-btn" data-action="open-add" data-type="rental" data-customer-id="${esc(customer.id)}">Add rental</button></div>
        ${rentalTable(rentals)}
      </section>`;
    }
    if (ui.customerTab === "files") {
      return `<section class="simple-section">
        <div class="simple-head"><div><h3>Files</h3><p>Driver license, agreements, insurance, and receipts</p></div><button class="soft-btn" data-action="open-add" data-type="document" data-owner-type="customer" data-owner-id="${esc(customer.id)}">Add file</button></div>
        ${renderDocumentList(documentsFor("customer", customer.id).concat(documentsForCustomerRentals(customer.id)))}
      </section>`;
    }
    const openBalance = rentals.reduce((sum, rental) => sum + rentalBalance(rental), 0);
    return `
      <section class="profile-grid">
        <article class="profile-card"><small>Rentals</small><h3>${number(rentals.length)}</h3><p>${number(rentals.filter((rental) => rental.status === "active").length)} active</p></article>
        <article class="profile-card"><small>Revenue</small><h3>${money(customerRevenue(customer.id))}</h3><p>payments received</p></article>
        <article class="profile-card"><small>Open balance</small><h3>${money(openBalance)}</h3><p>unpaid rental balance</p></article>
        <article class="profile-card"><small>Files</small><h3>${number(documentsFor("customer", customer.id).length)}</h3><p>customer files</p></article>
      </section>
      <section class="detail-grid">
        ${detail("Phone", customer.phone)}
        ${detail("Email", customer.email || "Not saved")}
        ${detail("License", customer.license)}
        ${detail("Status", customer.status)}
        ${detail("Customer login", phoneKey(customer.phone) || "Phone not saved")}
        ${detail("Address", customer.address)}
        ${detail("Notes", customer.notes)}
      </section>
    `;
  }

  function renderRentals() {
    const rentals = db.rentals.map((rental) => {
      const vehicle = vehicleById(rental.vehicleId);
      const customer = customerById(rental.customerId);
      return Object.assign({}, rental, { vehicleText: vehicle ? `${vehicle.unit} ${vehicle.make} ${vehicle.model}` : "", customerText: customer?.name || "" });
    }).sort((a, b) => {
      const priority = { active: 0, reserved: 1, closed: 2 };
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || String(b.startDate).localeCompare(String(a.startDate));
    });
    const selected = rentalById(ui.rentalId);
    if (ui.rentalMode === "profile" && selected) {
      return `
        <section class="entity-page">
          ${entityCrumb("Rentals", rentalCode(selected), entityName("vehicle", selected.vehicleId), "rentals")}
          ${renderRentalProfile(selected)}
        </section>
      `;
    }
    return `
      <section class="rental-simple-page">
        ${rentals.length ? `<div class="rental-simple-list">${rentals.map(simpleRentalCard).join("")}</div>` : emptyBox("No rentals", "New rental records will appear here.")}
      </section>
    `;
  }

  function renderDocuments() {
    const filter = documentGroupById(ui.documentFilter);
    const docs = documentsByFilter(filter.id);
    return `
      <section class="page-title document-page-title">
        <div><small>Documents</small><h2>${esc(filter.label)}</h2><p>Saved files from rent-out, customers, rentals, and cars</p></div>
        <div class="title-actions">
          <button class="soft-btn back-doc-btn" data-view="dashboard">${iconSvg("dashboard")} Back</button>
          ${filter.id === "all" ? "" : `<button class="soft-btn" data-action="document-filter" data-document-filter="all">${iconSvg("documents")} All files</button>`}
        </div>
      </section>
      <nav class="tabs filter-tabs">
        ${DOCUMENT_GROUPS.map((group) => `<button class="${filter.id === group.id ? "active" : ""}" data-action="document-filter" data-document-filter="${esc(group.id)}"><i>${iconSvg(group.icon)}</i>${esc(group.label)} ${documentGroupCount(group.id) ? `<span>${number(documentGroupCount(group.id))}</span>` : ""}</button>`).join("")}
      </nav>
      ${renderDocumentList(docs)}
    `;
  }

  function simpleRentalCard(rental) {
    const vehicle = vehicleById(rental.vehicleId);
    const customer = customerById(rental.customerId);
    const balance = rentalBalance(rental);
    return `<article class="simple-rental-card">
      <div class="simple-rental-main">
        <div><span>${esc(rentalCode(rental))}</span>${statusBadge(rental.status)}</div>
        <h3><button class="rental-name-link" data-action="select-rental" data-id="${esc(rental.id)}">${esc(customer?.name || "Customer")}</button></h3>
        <p>${esc(vehicle ? vehicle.unit + " / " + vehicle.make + " " + vehicle.model : "Vehicle")}</p>
        <small>${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}</small>
      </div>
      <div class="simple-rental-side">
        <b class="${balance ? "text-danger" : "text-success"}">${money(balance)}</b>
        <small>${money(rentalPaid(rental.id))} paid</small>
      </div>
      ${rental.status !== "closed" ? `<footer><button class="mini-btn primary" data-action="open-add" data-type="payment" data-rental-id="${esc(rental.id)}" data-vehicle-id="${esc(rental.vehicleId)}" data-customer-id="${esc(rental.customerId)}">Pay</button></footer>` : ""}
    </article>`;
  }

  function rentalColumn(title, rentals) {
    return `<article class="board-column"><header><h3>${esc(title)}</h3><span>${number(rentals.length)}</span></header>${rentals.map(rentalBoardCard).join("") || emptyInline("No records")}</article>`;
  }

  function rentalBoardCard(rental) {
    const vehicle = vehicleById(rental.vehicleId);
    const customer = customerById(rental.customerId);
    const balance = rentalBalance(rental);
    return `<article class="rental-card ${ui.rentalId === rental.id ? "active" : ""}">
      <div><small>${esc(rentalCode(rental))}</small><h4>${esc(customer?.name || "Customer")}</h4><p>${esc(vehicle ? vehicle.unit + " / " + vehicle.make + " " + vehicle.model : "Vehicle")}</p></div>
      <div class="rental-card-lines">
        <span>${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}</span>
        <b class="${balance ? "text-danger" : "text-success"}">${money(balance)} balance</b>
      </div>
      <footer>
        <button class="mini-btn" data-action="select-rental" data-id="${esc(rental.id)}">Open</button>
        <button class="mini-btn" data-action="select-vehicle" data-id="${esc(rental.vehicleId)}">Car</button>
        <button class="mini-btn" data-action="select-customer" data-id="${esc(rental.customerId)}">Customer</button>
        ${rental.status !== "closed" ? `<button class="mini-btn primary" data-action="open-add" data-type="payment" data-rental-id="${esc(rental.id)}" data-vehicle-id="${esc(rental.vehicleId)}" data-customer-id="${esc(rental.customerId)}">Pay</button>` : ""}
        ${rental.status !== "closed" ? `<button class="mini-btn" data-action="close-rental" data-id="${esc(rental.id)}">Return vehicle</button>` : ""}
      </footer>
    </article>`;
  }

  function renderCompactRentals(rentals) {
    if (!rentals.length) return emptyBox("No rentals", "Rental records for this car will appear here.");
    return `<div class="compact-list">${rentals.map(compactRentalCard).join("")}</div>`;
  }

  function compactRentalCard(rental) {
    const customer = customerById(rental.customerId);
    const balance = rentalBalance(rental);
    return `<article class="compact-rental">
      <div class="compact-main">
        <span>${esc(rentalCode(rental))}</span>
        <button class="rental-name-link compact" data-action="select-rental" data-id="${esc(rental.id)}">${esc(customer?.name || "Customer")}</button>
        <small>${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}</small>
      </div>
      <div class="compact-balance">
        ${statusBadge(rental.status)}
        <b class="${balance ? "text-danger" : "text-success"}">${money(balance)}</b>
        <small>${money(rentalPaid(rental.id))} paid</small>
      </div>
      ${rental.status !== "closed" ? `<footer><button class="mini-btn primary" data-action="open-add" data-type="payment" data-rental-id="${esc(rental.id)}" data-vehicle-id="${esc(rental.vehicleId)}" data-customer-id="${esc(rental.customerId)}">Pay</button></footer>` : ""}
    </article>`;
  }

  function renderRentalProfile(rental) {
    const vehicle = vehicleById(rental.vehicleId);
    const customer = customerById(rental.customerId);
    const payments = db.payments.filter((payment) => payment.rentalId === rental.id);
    const expenses = db.expenses.filter((expense) => expense.rentalId === rental.id);
    const inspections = db.inspections.filter((inspection) => inspection.rentalId === rental.id);
    const balance = rentalBalance(rental);
    return `
      <section class="rental-profile panel">
        <header class="profile-header compact">
          <div class="vehicle-title">
            <span class="plate">${esc(rentalCode(rental))}</span>
            <div><h2>${esc(customer?.name || "Customer")}</h2><p>${esc(vehicle ? vehicle.unit + " / " + vehicle.make + " " + vehicle.model : "Vehicle")} / ${shortDate(rental.startDate)} to ${shortDate(rental.endDate)}</p></div>
          </div>
          <div class="profile-actions">
            ${statusBadge(rental.status)}
            ${rental.cancelledAt ? '<b>Cancelled — assigned by mistake</b>' : rental.status !== "closed" ? `<button class="soft-btn" data-action="cancel-assignment" data-id="${esc(rental.id)}">Remove mistaken assignment</button>` : ""}
            <button class="primary-add" data-action="edit-contract" data-id="${esc(rental.id)}">Edit contract</button>
            <button class="soft-btn" data-action="customer-emails" data-id="${esc(rental.id)}">Customer emails</button>
            ${rental.status === "active" ? `<button class="soft-btn" data-action="change-vehicle" data-id="${esc(rental.id)}">Change vehicle</button>` : ""}
            ${rental.status !== "closed" ? `<button class="primary-add" data-action="close-rental" data-id="${esc(rental.id)}">Return vehicle</button>` : ""}
            ${contextActionMenu(`rental-${rental.id}`, [
              balance > 0 ? { label: "Record payment", type: "payment", rentalId: rental.id, vehicleId: rental.vehicleId, customerId: rental.customerId } : null,
              { label: "Add inspection", type: "inspection", rentalId: rental.id, vehicleId: rental.vehicleId },
              { label: "Add file", type: "document", ownerType: "rental", ownerId: rental.id },
              { label: "Car profile", action: "select-vehicle", id: rental.vehicleId },
              { label: "Customer", action: "select-customer", id: rental.customerId },
              rental.status !== "closed" ? { label: "Return vehicle", action: "close-rental", id: rental.id } : { label: "Open car", action: "select-vehicle", id: rental.vehicleId }
            ])}
          </div>
        </header>
        <section class="profile-grid rental-summary-grid">
          <article class="profile-card"><small>Contract</small><h3>${money(rentalTotal(rental))}</h3><p>${number(daysBetween(rental.startDate, rental.returnDate || rental.endDate))} days / ${money(rentalMonthlyRate(rental))} monthly plus ${money(rental.deposit)} deposit</p></article>
          <article class="profile-card"><small>Received</small><h3>${money(rentalPaid(rental.id))}</h3><p>${number(payments.length)} payments recorded</p></article>
          <article class="profile-card"><small>Due today</small><h3 class="${balance ? "text-danger" : "text-success"}">${money(balance)}</h3><p>${rental.returnDate ? "Final prorated balance after return." : "Only installments due by today, plus the deposit, less payments."} Maintenance is excluded.</p></article>
          <article class="profile-card"><small>Checks</small><h3>${number(inspections.length)}</h3><p>${number(expenses.length)} linked expenses</p></article>
        </section>
        <section class="detail-grid">
          ${detail("Pickup", rental.pickupLocation)}
          ${detail("Status", rental.returnDate ? "Returned" : rental.status)}
          ${rental.cancelledAt ? detail("Cancellation reason", rental.cancellationReason) : ""}
          ${detail("Actual return date", rental.returnDate || "Not returned")}${contractBillingDetails(rental)}
          ${detail("Credit above contract", money(RentalMath.summary(rental, db.payments).credit))}
          ${detail("Vehicle", vehicle ? vehicle.unit + " - " + vehicle.make + " " + vehicle.model : "Not assigned")}
          ${detail("Customer", customer?.name || "Not assigned")}
          ${detail("Phone", customer?.phone || "Not saved")}
          ${detail("License", rental.licenseNumber || customer?.license || "Not saved")}
          ${detail("License expiry", rental.licenseExpiry ? shortDate(rental.licenseExpiry) : "Not saved")}
          ${detail("Insurance", rental.insuranceCompany || "Not saved")}
          ${detail("Policy", rental.insurancePolicy || "Not saved")}
          ${detail("Insurance expiry", rental.insuranceExpiry ? shortDate(rental.insuranceExpiry) : "Not saved")}
          ${detail("Notes", rental.notes || "No notes")}
        </section>
        ${(rental.vehicleChanges || []).length ? `<section class="simple-section embedded"><h3>Vehicle change history</h3>${rental.vehicleChanges.map(change => `<p>${esc(shortDate(change.date))}: ${esc(change.fromLabel)} → ${esc(change.toLabel)}. Return mileage: ${number(change.returnMileage)}. ${esc(change.notes || "")}</p>`).join("")}</section>` : ""}
        <section class="simple-section embedded">
          <div class="simple-head"><div><h3>Rental files</h3><p>${number(documentsFor("rental", rental.id).length)} files linked to this rental</p></div><button class="soft-btn" data-action="open-add" data-type="document" data-owner-type="rental" data-owner-id="${esc(rental.id)}">Add file</button></div>
          ${renderDocumentList(documentsFor("rental", rental.id))}
        </section>
      </section>
    `;
  }

  function renderFinance() {
    const all = financeEntries().filter(entry => !ui.financeMonth || String(entry.date || "").slice(0, 7) === ui.financeMonth);
    const entries = all.filter((entry) => ui.financeFilter === "all" || entry.type === ui.financeFilter);
    const revenue = all.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
    const expense = all.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    return `
      <section class="page-title">
        <div><small>Owner / staff only</small><h2>Monthly income and costs</h2><label>Month<input type="month" data-finance-month value="${esc(ui.financeMonth)}"></label><p>Maintenance and expenses reduce business net only. They do not reduce rent received or alter the customer balance.</p></div>
        <div class="title-actions"><button class="primary-add" data-action="open-add" data-type="payment">+ Payment</button><button class="soft-btn" data-action="open-add" data-type="expense">Expense</button></div>
      </section>
      <section class="metric-grid tight">
        ${metric("Income", money(revenue), "customer payments", "green")}
        ${metric("Maintenance", money(all.filter(e => e.type === "maintenance").reduce((sum, e) => sum + Math.abs(e.amount), 0)), "internal cost", "amber")}
        ${metric("Expenses", money(expense), "all maintenance and operations", "amber")}
        ${metric("Net", money(revenue - expense), "cash result", revenue - expense >= 0 ? "green" : "danger")}
        ${metric("Open balances", money(db.rentals.reduce((sum, rental) => sum + rentalBalance(rental), 0)), "still collectible", "blue")}
      </section>
      <nav class="tabs filter-tabs">
        ${["all", "income", "expense", "maintenance"].map((filter) => `<button class="${ui.financeFilter === filter ? "active" : ""}" data-action="finance-filter" data-filter="${filter}">${tabLabel(filter)}</button>`).join("")}
      </nav>
      ${financeTable(entries)}
    `;
  }

  function renderReports() {
    const vehicleRows = db.vehicles.map((vehicle) => {
      const rentals = rentalsForVehicle(vehicle.id);
      const activeDays = rentals.reduce((sum, rental) => sum + daysBetween(rental.startDate, rental.endDate), 0);
      const revenue = vehicleRevenue(vehicle.id);
      const expenses = vehicleExpenses(vehicle.id);
      return { vehicle, rentals, activeDays, revenue, expenses, net: revenue - expenses };
    });
    const customerRows = db.customers.map((customer) => {
      const rentals = rentalsForCustomer(customer.id);
      const revenue = customerRevenue(customer.id);
      const balance = rentals.reduce((sum, rental) => sum + rentalBalance(rental), 0);
      return { customer, rentals, revenue, balance };
    }).sort((a, b) => b.revenue - a.revenue);
    return `
      <section class="page-title">
        <div><small>Reports</small><h2>Fleet performance and customer value</h2></div>
      </section>
      <section class="two-column">
        <div class="panel">
          <div class="panel-head"><div><small>Fleet report</small><h3>Revenue by car</h3></div></div>
          ${table(["Vehicle", "Rentals", "Income", "Cost", "Net"], vehicleRows.map((row) => [
            `<button class="table-link" data-action="select-vehicle" data-id="${esc(row.vehicle.id)}"><b>${esc(row.vehicle.unit)}</b><small>${esc(row.vehicle.make + " " + row.vehicle.model)}</small></button>`,
            `<b>${number(row.rentals.length)}</b><small>${number(row.activeDays)} rental days</small>`,
            `<b>${money(row.revenue)}</b>`,
            `<b>${money(row.expenses)}</b>`,
            `<b class="${row.net >= 0 ? "text-success" : "text-danger"}">${money(row.net)}</b>`
          ]), "No vehicle performance yet.")}
        </div>
        <div class="panel">
          <div class="panel-head"><div><small>Customer report</small><h3>Revenue and balance</h3></div></div>
          ${table(["Customer", "Rentals", "Received", "Balance"], customerRows.map((row) => [
            `<button class="table-link" data-action="select-customer" data-id="${esc(row.customer.id)}"><b>${esc(row.customer.name)}</b><small>${esc(row.customer.phone)}</small></button>`,
            `<b>${number(row.rentals.length)}</b>`,
            `<b>${money(row.revenue)}</b>`,
            `<b class="${row.balance ? "text-danger" : "text-success"}">${money(row.balance)}</b>`
          ]), "No customer performance yet.")}
        </div>
      </section>
    `;
  }

  function renderAlertsPage() {
    const alerts = alertItems();
    return `
      <section class="page-title">
        <div><small>Alerts</small><h2>Open balances, returns, documents, service</h2></div>
      </section>
      <div class="alert-page-list">${alerts.length ? alerts.map(alertCard).join("") : emptyBox("No alerts", "All tracked work is clear.")}</div>
    `;
  }

  function renderSettings() {
    return `
      <section class="page-title">
        <div><small>Settings</small><h2>Business profile</h2></div>
      </section>
      <form class="settings-form panel" data-form="settings">
        <div class="form-grid">
          ${field("Company name", "companyName", db.settings.companyName, "text", true)}
          ${field("Location", "location", db.settings.location, "text", true)}
          ${selectField("Currency", "currency", ["USD", "INR", "CAD"], db.settings.currency)}
          ${field("Support phone", "supportPhone", db.settings.supportPhone, "tel")}
          ${field("Support email", "supportEmail", db.settings.supportEmail, "email")}
        </div>
        <div class="form-actions"><button class="primary-add">Save settings</button><button type="button" class="danger-btn" data-action="reset-demo">Reset demo data</button></div>
      </form>
    `;
  }

  function rentalTable(rentals) {
    return table(["Rental", "Car", "Customer", "Dates", "Balance", ""], rentals.map((rental) => {
      const vehicle = vehicleById(rental.vehicleId);
      const customer = customerById(rental.customerId);
      const balance = rentalBalance(rental);
      return [
        `<b>${esc(rentalCode(rental))}</b><small>${statusBadge(rental.status)}</small>`,
        `<button class="table-link" data-action="select-vehicle" data-id="${esc(rental.vehicleId)}"><b>${esc(vehicle?.unit || "Vehicle")}</b><small>${esc(vehicle ? vehicle.make + " " + vehicle.model : "")}</small></button>`,
        `<button class="table-link" data-action="select-customer" data-id="${esc(rental.customerId)}"><b>${esc(customer?.name || "Customer")}</b><small>${esc(customer?.phone || "")}</small></button>`,
        `<b>${shortDate(rental.startDate)}</b><small>Return ${shortDate(rental.endDate)}</small>`,
        `<b class="${balance ? "text-danger" : "text-success"}">${money(balance)}</b><small>${money(rentalPaid(rental.id))} paid</small>`,
        `<div class="row-actions"><button class="mini-btn primary" data-action="select-rental" data-id="${esc(rental.id)}">Open</button>${rental.status !== "closed" ? `<button class="mini-btn" data-action="open-add" data-type="payment" data-rental-id="${esc(rental.id)}">Pay</button>` : ""}</div>`
      ];
    }), "No rental records.");
  }

  function financeTable(entries) {
    return table(["Date", "Type", "Vehicle", "Party", "Amount", "Method"], entries.map((entry) => [
      `<b>${shortDate(entry.date)}</b><small>${esc(entry.status)}</small>`,
      `<b>${esc(entry.label)}</b><small>${esc(entry.type)}</small>`,
      entry.vehicleId ? `<button class="table-link" data-action="select-vehicle" data-id="${esc(entry.vehicleId)}"><b>${esc(entry.vehicle)}</b><small>${esc(entry.reference || "")}</small></button>` : `<b>${esc(entry.vehicle)}</b>`,
      entry.customerId ? `<button class="table-link" data-action="select-customer" data-id="${esc(entry.customerId)}"><b>${esc(entry.party)}</b><small>${esc(entry.reference || "")}</small></button>` : `<b>${esc(entry.party)}</b><small>${esc(entry.reference || "")}</small>`,
      `<b class="${entry.amount >= 0 ? "text-success" : "text-danger"}">${money(Math.abs(entry.amount))}</b>`,
      `<b>${esc(entry.method || "Not recorded")}</b>`
    ]), "No transactions yet.");
  }

  function vehicleMiniCard(vehicle) {
    const rental = activeRentalForVehicle(vehicle.id);
    return `<button class="vehicle-mini" data-action="select-vehicle" data-id="${esc(vehicle.id)}">
      <span>${esc(vehicle.unit)}</span>
      <b>${esc(vehicle.make)} ${esc(vehicle.model)}</b>
      <small>${rental ? esc(customerById(rental.customerId)?.name || "Active rental") : esc(vehicle.location)}</small>
      ${statusBadge(vehicle.status)}
    </button>`;
  }

  function alertCard(alert) {
    return `<article class="alert-card ${esc(alert.tone)}">
      <i>${iconSvg(alert.tone === "warning" ? "finance" : "alerts")}</i>
      <div><b>${esc(alert.title)}</b><small>${esc(alert.meta)}</small></div>
      <strong>${esc(alert.value)}</strong>
      <button class="mini-btn" data-action="open-alert" data-view-target="${esc(alert.view)}" data-vehicle-id="${esc(alert.vehicleId || "")}" data-customer-id="${esc(alert.customerId || "")}" data-rental-id="${esc(alert.rentalId || "")}">Open</button>
    </article>`;
  }

  function maintenanceCard(item) {
    const open = item.status !== "completed";
    const cost = maintenanceCost(item.id);
    return `<article class="service-row">
      <div><b>${esc(item.type)}</b><small>${esc(item.shop || "Shop pending")} / ${shortDate(item.date)}${cost ? ` / actual cost ${money(cost)}` : ""}</small></div>
      <span>${cost ? money(cost) : shortDate(item.date)}</span>
      ${statusBadge(item.status)}
      ${open ? `<button class="mini-btn primary" data-action="open-add" data-type="payment" data-payment-kind="maintenance" data-maintenance-id="${esc(item.id)}">Add cost</button>` : ""}
    </article>`;
  }

  function inspectionCard(item) {
    return `<article class="service-row">
      <div><b>${esc(item.condition)}</b><small>${shortDate(item.date)} / ${number(item.odometer)} miles / ${esc(item.fuel)}</small></div>
      ${statusBadge(item.condition === "Passed" ? "passed" : "needs_repair")}
    </article>`;
  }

  function documentsFor(type, id) {
    return db.documents.filter((doc) => doc.ownerType === type && doc.ownerId === id);
  }

  function documentsForVehicleRentals(vehicleId) {
    const rentalIds = rentalsForVehicle(vehicleId).map((rental) => rental.id);
    return db.documents.filter((doc) => doc.ownerType === "rental" && rentalIds.includes(doc.ownerId));
  }

  function documentsForCustomerRentals(customerId) {
    const rentalIds = rentalsForCustomer(customerId).map((rental) => rental.id);
    return db.documents.filter((doc) => doc.ownerType === "rental" && rentalIds.includes(doc.ownerId));
  }

  function renderDocumentList(docs) {
    if (!docs.length) return emptyBox("No files", "Insurance, agreements, licenses, photos, and receipts will appear here.");
    return `<section class="document-grid">${docs.map(documentCard).join("")}</section>`;
  }

  function documentCard(doc) {
    const hasFile = Boolean(doc.fileData);
    const isImage = String(doc.fileType || "").startsWith("image/");
    const fileMeta = hasFile
      ? [doc.fileName || "Saved file", fileSizeLabel(doc.fileSize)].filter(Boolean).join(" / ")
      : "No uploaded file";
    const visual = hasFile && isImage
      ? `<img src="${esc(doc.fileData)}" alt="${esc(doc.type)}">`
      : `<span>${iconSvg(documentTypeIcon(doc.type))}</span>`;
    return `<article class="document-card ${hasFile ? "" : "missing"}">
      ${visual}
      <div>
        <b>${esc(documentTypeLabel(doc.type))}</b>
        <small>${esc(fileMeta)}</small>
        <small>${doc.expiryDate ? "Expires " + shortDate(doc.expiryDate) : "No expiry"}</small>
        <small>${esc(entityName(doc.ownerType, doc.ownerId))}</small>
      </div>
      <footer>
        ${hasFile ? `<button class="mini-btn primary" data-action="open-document" data-id="${esc(doc.id)}">Open</button>` : ""}
        <button class="mini-btn" data-action="attach-document" data-id="${esc(doc.id)}">${hasFile ? "Replace" : "Upload"}</button>
        <button class="mini-btn" data-action="remove-document" data-id="${esc(doc.id)}">Remove</button>
      </footer>
    </article>`;
  }

  function renderDocumentPreview(doc) {
    if (!doc) return emptyBox("Document missing", "This document record is not available.");
    const isImage = String(doc.fileType || "").startsWith("image/");
    const isPdf = String(doc.fileType || "").includes("pdf");
    const body = doc.fileData
      ? isImage
        ? `<img class="document-preview-image" src="${esc(doc.fileData)}" alt="${esc(doc.type)}">`
        : isPdf
          ? `<iframe class="document-preview-frame" src="${esc(doc.fileData)}" title="${esc(doc.type)}"></iframe>`
          : `<div class="empty-box"><b>File saved</b><p>${esc(doc.fileName)}</p><a class="soft-btn" href="${esc(doc.fileData)}" download="${esc(doc.fileName || "document")}">Download</a></div>`
      : emptyBox("No file attached", "Add this document again with a photo, PDF, or file.");
    return `<section class="document-preview">
      <div class="detail-grid">
        ${detail("Type", documentTypeLabel(doc.type))}
        ${detail("Record", entityName(doc.ownerType, doc.ownerId))}
        ${detail("Expiry", doc.expiryDate ? shortDate(doc.expiryDate) : "No expiry")}
      </div>
      ${body}
    </section>`;
  }

  function renderTimeline(items) {
    if (!items.length) return emptyBox("No activity", "Actions linked to this record will appear here.");
    return `<section class="timeline">${items.map((item) => `<article><span>${iconSvg(addIcon(item.type))}</span><div><b>${esc(item.message)}</b><small>${new Date(item.time).toLocaleString()}</small></div></article>`).join("")}</section>`;
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return emptyBox(emptyText, "Add a record to see it here.");
    return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function detail(label, value) {
    return `<article class="detail-cell"><span>${esc(label)}</span><b>${esc(value || "Not saved")}</b></article>`;
  }

  function searchBox(placeholder) {
    return `<label class="search"><span>Search</span><input data-search value="${esc(ui.query)}" placeholder="${esc(placeholder)}"></label>`;
  }

  function filterRecords(records, fields) {
    const query = ui.query.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => fields.some((field) => String(record[field] || "").toLowerCase().includes(query)));
  }

  function emptyBox(title, text) {
    return `<div class="empty-box"><b>${esc(title)}</b><p>${esc(text || "")}</p></div>`;
  }

  function emptyInline(text) {
    return `<div class="empty-inline">${esc(text)}</div>`;
  }

  function tabLabel(value) {
    return String(value).replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function recordTypeLabel(value) {
    if (value === 'manage-record') return 'Manage record';
    if (value === 'cancel-assignment') return 'Remove mistaken assignment';
    if (value === 'emails') return 'Customer emails';
    if (value === 'contract') return 'Edit contract';
    if (value === 'change-vehicle') return 'Change vehicle';
    if (value === 'return') return 'Return vehicle';
    return value === "customer" ? "Customer" : tabLabel(value);
  }

  function tokenClass(value) {
    return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
  }

  function renderModal() {
    if (!ui.modal) return "";
    if (ui.modal === "documentPreview") {
      const doc = db.documents.find((item) => item.id === ui.documentId);
      return `<div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="modal document-modal">
          <header><div><small>Document</small><h2>${esc(doc?.fileName || "Preview")}</h2></div><button data-action="close-modal" aria-label="Close">X</button></header>
          ${renderDocumentPreview(doc)}
        </section>
      </div>`;
    }
    const isPassword = ui.modal === "password";
    const isVehicleEdit = ui.modal === "vehicle" && Boolean(ui.prefill.editVehicleId);
    const isCustomerEdit = ui.modal === "customer" && Boolean(ui.prefill.editCustomerId);
    return `<div class="modal-backdrop" role="dialog" aria-modal="true">
      <section class="modal ${isPassword ? "password-modal" : ""}">
        <header><div><small>${isPassword ? "Account" : isVehicleEdit || isCustomerEdit || ui.modal === "contract" ? "Edit record" : "Add record"}</small><h2>${esc(isPassword ? "Change password" : isVehicleEdit ? "Edit vehicle" : isCustomerEdit ? "Edit customer" : recordTypeLabel(ui.modal))}</h2></div><button data-action="close-modal" aria-label="Close">X</button></header>
        ${renderForm(ui.modal)}
      </section>
    </div>`;
  }

  function renderForm(type) {
    if (type === "manage-record") return manageRecordForm();
    if (type === "cancel-assignment") return cancelAssignmentForm();
    if (type === "emails") return customerEmailsView();
    if (type === "contract") return contractForm();
    if (type === "change-vehicle") return changeVehicleForm();
    if (type === "return") return returnRentalForm();
    if (type === "vehicle") return vehicleForm();
    if (type === "customer") return customerForm();
    if (type === "rental") return rentalForm();
    if (type === "maintenance") return maintenanceForm();
    if (type === "payment") return paymentForm();
    if (type === "expense") return expenseForm();
    if (type === "inspection") return inspectionForm();
    if (type === "document") return documentForm();
    if (type === "password") return passwordForm();
    return "";
  }

  function field(label, name, value, type, required, step) {
    return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type || "text")}" value="${esc(value || "")}" ${required ? "required" : ""} ${step ? `step="${esc(step)}"` : ""}></label>`;
  }

  function hiddenField(name, value) {
    return `<input name="${esc(name)}" type="hidden" value="${esc(value || "")}">`;
  }

  function fileField(label, name, accept, required = true) {
    const types = accept || 'image/*,.pdf,.doc,.docx';
    return '<div class="file-capture wide"><b>' + esc(label) + '</b><div class="file-choices"><label class="file-choice">Choose photo / file<input name="' + esc(name) + '" type="file" accept="' + esc(types) + '" data-file-name="' + esc(name) + '" data-file-required="' + required + '"></label>' + (types.includes('image/') ? '<label class="file-choice">Take photo<input type="file" accept="image/*" capture="environment" data-file-name="' + esc(name) + '" data-file-required="' + required + '"></label>' : '') + '</div><small class="file-status" role="status">' + (required ? 'Required. ' : 'Optional. ') + 'Select a file, then save. Files up to 8 MB.</small></div>';
  }

  function textarea(label, name, value) {
    return `<label class="wide">${esc(label)}<textarea name="${esc(name)}">${esc(value || "")}</textarea></label>`;
  }

  function selectField(label, name, options, selected) {
    return `<label>${esc(label)}<select name="${esc(name)}">${options.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const text = typeof option === "string" ? option : option.label;
      return `<option value="${esc(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${esc(text)}</option>`;
    }).join("")}</select></label>`;
  }

  function vehicleOptions(selected) {
    return selectField("Vehicle", "vehicleId", db.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.unit} - ${vehicle.make} ${vehicle.model}` })), selected);
  }

  function rentalVehicleOptions(selected) {
    const choices = db.vehicles.filter((vehicle) => vehicle.status === "available");
    const selectedId = choices.some((vehicle) => vehicle.id === selected) ? selected : choices[0]?.id || "";
    const options = choices.length
      ? choices.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.unit} - ${vehicle.make} ${vehicle.model}` }))
      : [{ value: "", label: "No available cars" }];
    return selectField("Vehicle", "vehicleId", options, selectedId);
  }

  function customerOptions(selected) {
    return selectField("Customer", "customerId", db.customers.map((customer) => ({ value: customer.id, label: customer.name })), selected);
  }

  function rentalOptions(selected, vehicleId) {
    const rentals = vehicleId ? db.rentals.filter((rental) => rental.vehicleId === vehicleId) : db.rentals;
    return selectField("Rental", "rentalId", [{ value: "", label: "No rental selected" }].concat(rentals.map((rental) => {
      const customer = customerById(rental.customerId);
      const vehicle = vehicleById(rental.vehicleId);
      return { value: rental.id, label: `${rentalCode(rental)} - ${customer?.name || "Customer"} - ${vehicle?.unit || "Vehicle"}` };
    })), selected);
  }

  function maintenanceOptions(selected) {
    const choices = db.maintenance.filter((item) => item.status !== "completed" || item.id === selected);
    return selectField("Maintenance record", "maintenanceId", [{ value: "", label: choices.length ? "No maintenance selected" : "No open maintenance" }].concat(choices.map((item) => {
      const vehicle = vehicleById(item.vehicleId);
      return { value: item.id, label: `${item.type} - ${vehicle?.unit || "Vehicle"} - ${item.status}` };
    })), selected);
  }

  function returnPreview(rental, date) {
    const proposed = Object.assign({}, rental, { returnDate: date, billingPolicy: "calendar-monthly" });
    const value = RentalMath.summary(proposed, db.payments);
    return '<h3>Final settlement</h3><p>Rent through ' + esc(date) + ', including the return day: <b>' + money(value.rentCharged) + '</b></p><p>Contract deposit: ' + money(value.deposit) + ' · Received: ' + money(value.received) + '</p><p><b>Amount due from customer: ' + money(value.due) + '</b></p><p>Credit above contract: ' + money(value.credit) + '</p><p>Maintenance and business expenses are excluded. Deposit refunds are settled separately. The car becomes available unless another active rental or service requires it.</p>';
  }

  function customerClosed(customer) {
    const rentals = rentalsForCustomer(customer.id);
    if (rentals.some(rental => ["active", "reserved"].includes(rental.status))) return false;
    return customer.status === "inactive" || customer.status === "closed" || (!customer.keepVisible && rentals.length > 0 && rentals.every(rental => rental.status === "closed"));
  }

  function recordLinks(type, id) {
    const field = type === "customer" ? "customerId" : "vehicleId";
    return ["rentals", "payments", "expenses", "maintenance", "inspections"].some(name => db[name].some(row => row[field] === id))
      || (type === "vehicle" && db.rentals.some(rental => (rental.vehicleChanges || []).some(change => change.fromVehicleId === id || change.toVehicleId === id)))
      || db.documents.some(doc => (doc.ownerType === type && doc.ownerId === id) || doc[field] === id);
  }

  function manageRecordForm() {
    const { recordType: type, recordId: id } = ui.prefill;
    const record = type === "customer" ? customerById(id) : vehicleById(id);
    if (!record) return "";
    const archived = type === "customer" ? customerClosed(record) : record.status === "inactive";
    const linked = recordLinks(type, id);
    return `<form class="record-form" data-form="manage-record">${hiddenField("recordType", type)}${hiddenField("recordId", id)}<h3>${esc(record.name || record.unit)}</h3><p>${linked ? "This record has linked history. Archive it to hide it from the current list while keeping contracts, payments and files accessible." : "This record has no linked contracts, payments or files. You can archive it or permanently delete it."}</p><footer><button type="button" class="soft-btn" data-action="close-modal">Cancel</button><button class="primary-add" name="operation" value="${archived ? "restore" : "archive"}" data-record-operation="${archived ? "restore" : "archive"}">${archived ? "Restore to current list" : "Archive record"}</button>${!linked ? '<button class="danger-btn" name="operation" value="delete" data-record-operation="delete">Permanently delete record</button>' : ""}</footer></form>`;
  }

  function saveRecordManagement(data) {
    if (auth?.role !== "staff" || !["customer", "vehicle"].includes(data.recordType)) return;
    const type = data.recordType, id = data.recordId, field = type === "customer" ? "customerId" : "vehicleId";
    const record = type === "customer" ? customerById(id) : vehicleById(id);
    if (!record) throw new Error("This record no longer exists.");
    if (data.operation !== "restore" && db.rentals.some(rental => rental[field] === id && ["active", "reserved"].includes(rental.status))) throw new Error("Return or cancel the open rental assignments before archiving this record.");
    if (data.operation === "delete") {
      if (recordLinks(type, id)) throw new Error("This record has linked history. Archive it instead.");
      const name = type === "customer" ? "customers" : "vehicles";
      db[name] = db[name].filter(row => row.id !== id);
    } else if (data.operation === "archive") { record.status = "inactive"; record.keepVisible = false; }
    else if (data.operation === "restore") { record.status = type === "customer" ? "active" : "available"; record.keepVisible = true; if (type === "vehicle") syncVehicle(id); }
    else throw new Error("Choose archive, restore or delete.");
    addActivity(type, `${record.name || record.unit}: ${data.operation}.`, type, id, {});
    ui.view = type === "customer" ? "customers" : "fleet";
    if (type === "customer") { ui.customerMode = "list"; ui.customerArchive = data.operation === "archive" ? "closed" : "current"; }
    else { ui.fleetMode = "list"; ui.fleetArchive = data.operation === "archive" ? "archived" : "current"; }
    commit(data.operation === "delete" ? "Unused record deleted." : data.operation === "restore" ? "Record restored." : "Record archived. History preserved.");
  }

  function cancelAssignmentForm() {
    const rental = rentalById(ui.prefill.rentalId);
    if (!rental) return "";
    const payments = db.payments.filter(payment => payment.rentalId === rental.id);
    return `<form class="record-form" data-form="cancel-assignment">${hiddenField("rentalId", rental.id)}<h3>${esc(customerById(rental.customerId)?.name)} · ${esc(vehicleById(rental.vehicleId)?.unit)} · ${esc(rentalCode(rental))}</h3><p>Use this only if the car was assigned by mistake and was never rented under this contract. This closes the mistaken assignment, removes its rental charges and releases its vehicle. The original record, files and cancellation reason remain in history.</p>${payments.length ? '<p role="alert">This contract has payment records. Cancellation is blocked to preserve payment history. Check those payments first; use Return vehicle if this was a real rental.</p>' : ''}<label>Reason<textarea name="reason" required></textarea></label><footer><button type="button" class="soft-btn" data-action="close-modal">Keep assignment</button><button class="primary-add" ${payments.length ? 'disabled' : ''}>Confirm mistaken assignment</button></footer></form>`;
  }

  function saveAssignmentCancellation(data) {
    const rental = rentalById(data.rentalId);
    if (auth?.role !== "staff" || !rental || rental.status === "closed") return;
    if (!cleanText(data.reason)) throw new Error("Enter why this assignment was a mistake.");
    if (db.payments.some(payment => payment.rentalId === rental.id)) throw new Error("This contract has payments. Resolve those records before cancelling an assignment.");
    rental.status = "closed"; rental.cancelledAt = new Date().toISOString(); rental.cancellationReason = cleanText(data.reason);
    syncVehicle(rental.vehicleId);
    ui.view = "customers"; ui.customerId = rental.customerId; ui.customerMode = "profile";
    addActivity("rental", `${rentalCode(rental)} cancelled as a mistaken assignment: ${rental.cancellationReason}`, "rental", rental.id, { rentalId: rental.id, vehicleId: rental.vehicleId, customerId: rental.customerId });
    commit("Mistaken assignment cancelled. Other contracts and their payments are unchanged.");
  }

  function customerEmailsView() {
    const state = ui.emailState;
    if (!state) return '<div class="record-form"><p role="status">Loading email previews and history…</p></div>';
    if (state.error) return `<div class="record-form"><p role="alert">${esc(state.error)}</p></div>`;
    const rows = [...(state.drafts || []), ...(state.history || [])];
    return `<div class="record-form"><p><b>${state.enabled ? "Automatic email is enabled" : "Preview only — sending is disabled"}</b></p><p>Sender: ${esc(state.from || "Not configured")}. Rent reminders run from 3 days before the due date. Receipts follow newly recorded payments. Accepted means Gmail accepted the message; inbox delivery is not confirmed.</p><p>Edit the customer's email address in Edit contract. Refresh this view to check the latest status.</p>${rows.length ? rows.map(row => `<section class="return-settlement"><h3>${esc(row.kind)} · ${esc(row.status)}</h3><p>To: ${esc(row.to || "Missing customer email")}</p><b>${esc(row.subject)}</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit">${esc(row.text)}</pre>${row.detail ? `<p>${esc(row.detail)}</p>` : ""}</section>`).join("") : '<p>No reminder is due within the next 3 days, and no new receipt is waiting. Historical payments are not automatically emailed.</p>'}</div>`;
  }

  function contractForm() {
    const rental = rentalById(ui.prefill.rentalId);
    if (!rental) return "";
    const customer = customerById(rental.customerId), vehicle = vehicleById(rental.vehicleId);
    if (!customer || !vehicle) return '<p class="form-note">This contract has a missing customer or vehicle. Restore the linked record before editing.</p>';
    const choices = [vehicle, ...(rental.status === "closed" ? [] : db.vehicles.filter(v => v.id !== vehicle.id && v.status === "available"))];
    return `<form data-form="contract" class="record-form">${hiddenField("rentalId", rental.id)}${hiddenField("previousVehicleId", vehicle.id)}
      <div class="form-grid">
        <div class="form-note wide"><b>${esc(rentalCode(rental))} · ${esc(rental.status)}</b><span>Save once to update this contract, the customer profile and the selected fleet vehicle. Payments and attached files stay linked. Return vehicle records the final return separately.</span></div>
        <h3 class="wide">Customer</h3>
        ${field("Customer name", "name", customer.name, "text", true)}${field("Phone", "phone", customer.phone, "tel", true)}
        ${field("Email", "email", customer.email, "email")}${field("Address", "address", customer.address, "text")}
        ${selectField("Customer billing emails", "emailNotifications", [{ value: "on", label: "Reminders and payment receipts" }, { value: "off", label: "Do not email this customer" }], customer.emailNotifications || "on")}
        ${field("Driver license", "license", customer.license, "text")}${field("License expiry", "licenseExpiry", rental.licenseExpiry, "date")}
        <h3 class="wide">Vehicle</h3>
        ${selectField("Assigned vehicle", "vehicleId", choices.map(v => ({ value: v.id, label: vehicleLine(v) })), vehicle.id)}
        ${field("Old vehicle return mileage (if changing cars)", "returnMileage", String(vehicle.mileage || 0), "number")}
        ${field("Unit number", "unit", vehicle.unit, "text", true)}${field("Make", "make", vehicle.make, "text", true)}
        ${field("Model", "model", vehicle.model, "text", true)}${field("Plate", "plate", vehicle.plate, "text")}
        ${field("VIN", "vin", vehicle.vin, "text")}${field("Mileage", "mileage", String(vehicle.mileage || 0), "number", true)}
        <h3 class="wide">Rental terms</h3>
        ${field("Start date", "startDate", rental.startDate, "date", true)}${field("Planned return date", "endDate", rental.endDate, "date", true)}
        ${field("Monthly rate", "monthlyRate", String(rentalMonthlyRate(rental)), "number", true, "0.01")}${field("Deposit", "deposit", String(rental.deposit || 0), "number", true, "0.01")}
        ${selectField("Contract status", "status", rental.status === "reserved" ? ["reserved", "active"] : [rental.status], rental.status)}
        ${field("Pickup location", "pickupLocation", rental.pickupLocation, "text")}
        ${field("Insurance company", "insuranceCompany", rental.insuranceCompany, "text")}${field("Policy number", "insurancePolicy", rental.insurancePolicy, "text")}
        ${field("Insurance expiry", "insuranceExpiry", rental.insuranceExpiry, "date")}${textarea("Contract notes", "notes", rental.notes)}
        <div class="form-note wide"><b>Documents</b><span>Existing files remain on the contract. Choose files below to add more.</span></div>
        ${fileField("Driver license photo", "driverLicenseFile", "image/*,.pdf", false)}${fileField("Insurance proof", "insuranceFile", "image/*,.pdf", false)}
        ${fileField("Rental agreement", "agreementFile", "image/*,.pdf,.doc,.docx", false)}
      </div><footer><button type="button" class="soft-btn" data-action="close-modal">Cancel</button><button class="primary-add">Save entire contract</button></footer></form>`;
  }

  function syncCustomerDetails(customer) {
    db.rentals.filter(r => r.customerId === customer.id && r.status !== "closed").forEach(r => {
      r.driverName = customer.name; r.driverPhone = customer.phone; r.licenseNumber = customer.license;
    });
  }

  async function saveContract(data) {
    if (auth?.role !== "staff") return;
    const uploads = await Promise.all([data.driverLicenseFile, data.insuranceFile, data.agreementFile].map(readUpload));
    const rental = rentalById(data.rentalId), customer = customerById(rental?.customerId), vehicle = vehicleById(data.vehicleId);
    if (rental?.cancelledAt) throw new Error("This mistaken assignment was cancelled. Create a new rental if needed.");
    if (!rental || !customer || !vehicle || rental.vehicleId !== data.previousVehicleId) throw new Error("The linked records changed. Reopen Edit contract and try again.");
    const changing = vehicle.id !== rental.vehicleId, previous = vehicleById(rental.vehicleId);
    if (![rental.status, ...(rental.status === "reserved" ? ["active"] : [])].includes(data.status)) throw new Error("Use Return vehicle to close a contract.");
    if (!RentalMath.date(data.startDate) || !RentalMath.date(data.endDate) || data.endDate < data.startDate || (rental.returnDate && data.startDate > rental.returnDate) || (rental.vehicleChanges?.some(change => change.kind !== "reservation" && data.startDate > change.date))) throw new Error("Enter valid contract dates in chronological order.");
    for (const key of ["monthlyRate", "deposit", "mileage"]) if (String(data[key] ?? "").trim() === "" || !Number.isFinite(Number(data[key])) || Number(data[key]) < 0) throw new Error("Rate, deposit and mileage must be valid non-negative numbers.");
    for (const key of ["name", "phone", "unit", "make", "model"]) if (!cleanText(data[key])) throw new Error("Enter customer name, phone, unit, make and model.");
    if (db.customers.some(c => c.id !== customer.id && ((phoneKey(data.phone) && phoneKey(c.phone) === phoneKey(data.phone)) || (textKey(data.license) && textKey(c.license) === textKey(data.license))))) throw new Error("Another customer already uses this phone or license.");
    if (db.vehicles.some(v => v.id !== vehicle.id && textKey(v.unit) === textKey(data.unit))) throw new Error("Another vehicle already uses this unit number.");
    if (changing && (rental.status === "closed" || vehicle.status !== "available" || (rental.status === "active" && data.startDate > todayKey()))) throw new Error("Choose an available vehicle for an open contract.");
    const activating = rental.status === "reserved" && data.status === "active";
    if ((changing || activating) && (vehicle.status === "inactive" || vehicle.status === "maintenance" || db.maintenance.some(m => m.vehicleId === vehicle.id && ["scheduled", "in_progress", "pending_payment"].includes(m.status)))) throw new Error("This vehicle is unavailable or in maintenance.");
    const from = changing && rental.status === "active" ? todayKey() : data.startDate;
    const until = data.endDate > from ? data.endDate : from;
    if (rental.status !== "closed" && db.rentals.some(r => r.id !== rental.id && r.vehicleId === vehicle.id && r.status !== "closed" && ((data.status === "active" && r.status === "active") || rangesOverlap(from, until, r.startDate, r.endDate)))) throw new Error("This vehicle has another rental during the selected dates.");
    const returnMileage = Number(data.returnMileage);
    if (changing && (String(data.returnMileage ?? "").trim() === "" || !Number.isFinite(returnMileage) || returnMileage < Number(previous?.mileage || 0))) throw new Error("Old vehicle return mileage cannot decrease.");
    if (Number(data.mileage) < Number(vehicle.mileage || 0)) throw new Error("Vehicle mileage cannot decrease.");
    if (changing) {
      rental.vehicleChanges = [...(rental.vehicleChanges || []), { date: todayKey(), kind: rental.status === "reserved" ? "reservation" : "swap", fromVehicleId: rental.vehicleId, toVehicleId: vehicle.id, fromLabel: previous ? vehicleLine(previous) : rental.vehicleId, toLabel: vehicleLine(vehicle), returnMileage, notes: "Changed from contract editor" }];
      if (previous && rental.status === "active") previous.mileage = returnMileage;
    }
    Object.assign(customer, { name: cleanText(data.name), phone: cleanText(data.phone), email: cleanText(data.email), address: cleanText(data.address), license: cleanText(data.license) });
    syncCustomerDetails(customer);
    customer.emailNotifications = data.emailNotifications === "off" ? "off" : "on";
    Object.assign(vehicle, { unit: cleanText(data.unit), make: cleanText(data.make), model: cleanText(data.model), plate: cleanText(data.plate), vin: cleanText(data.vin), mileage: Number(data.mileage) });
    Object.assign(rental, { vehicleId: vehicle.id, driverName: customer.name, driverPhone: customer.phone, licenseNumber: customer.license, startDate: data.startDate, endDate: data.endDate, monthlyRate: Number(data.monthlyRate), deposit: Number(data.deposit), status: data.status, pickupLocation: cleanText(data.pickupLocation), licenseExpiry: data.licenseExpiry, insuranceCompany: cleanText(data.insuranceCompany), insurancePolicy: cleanText(data.insurancePolicy), insuranceExpiry: data.insuranceExpiry, notes: cleanText(data.notes) });
    if (Object.hasOwn(rental, "dailyRate")) rental.dailyRate = rental.monthlyRate / 30;
    ["Driver license", "Customer insurance", "Rental agreement"].forEach((type, index) => addRentalDocument(rental, type, uploads[index], index === 0 ? rental.licenseExpiry : index === 1 ? rental.insuranceExpiry : "", "Added from contract editor"));
    if (changing) syncVehicle(data.previousVehicleId);
    if (rental.status !== "closed") syncVehicle(vehicle.id);
    ui.view = "rentals"; ui.rentalId = rental.id; ui.rentalMode = "profile";
    addActivity("rental", `${rentalCode(rental)} contract, customer and vehicle updated.`, "rental", rental.id, { rentalId: rental.id, vehicleId: vehicle.id, customerId: customer.id });
    commit("Entire contract saved. Customer, fleet and balance updated.");
  }

  function replacementVehicles(rental) {
    const date = todayKey();
    const end = rental.endDate > date ? rental.endDate : date;
    return db.vehicles.filter(vehicle => vehicle.id !== rental.vehicleId && vehicle.status === "available"
      && !db.maintenance.some(item => item.vehicleId === vehicle.id && ["scheduled", "in_progress", "pending_payment"].includes(item.status))
      && !db.rentals.some(other => other.id !== rental.id && other.vehicleId === vehicle.id && other.status !== "closed"
        && (other.status === "active" || rangesOverlap(date, end, other.startDate, other.endDate))));
  }

  function changeVehicleForm() {
    const rental = rentalById(ui.prefill.rentalId);
    if (!rental || rental.status !== "active") return "";
    const vehicle = vehicleById(rental.vehicleId);
    const choices = replacementVehicles(rental);
    return `<form data-form="change-vehicle" class="record-form">
      ${hiddenField("rentalId", rental.id)}${hiddenField("previousVehicleId", rental.vehicleId)}
      <div class="form-grid">
        ${lockedContext("Customer", customerById(rental.customerId)?.name || rental.driverName)}
        ${lockedContext("Current vehicle", vehicle ? vehicleLine(vehicle) : rental.vehicleId)}
        <div class="form-note wide"><b>Change effective ${esc(shortDate(todayKey()))}</b><span>The rental continues with the same dates, monthly rate, deposit and payments. The old car is released and the replacement is assigned to this customer.</span></div>
        ${choices.length ? selectField("Replacement vehicle", "vehicleId", choices.map(item => ({ value: item.id, label: vehicleLine(item) })), choices[0].id) : '<p class="wide" role="status">No available replacement vehicles. Check Fleet availability or return another rental first.</p>'}
        ${field("Old vehicle return mileage", "returnMileage", String(vehicle?.mileage || 0), "number", true)}
        ${textarea("Reason / notes", "notes", "")}
      </div><footer><button type="button" class="soft-btn" data-action="close-modal">Cancel</button><button class="primary-add" ${choices.length ? "" : "disabled"}>Confirm vehicle change</button></footer>
    </form>`;
  }

  function saveVehicleChange(data) {
    const rental = rentalById(data.rentalId);
    if (auth?.role !== "staff" || !rental || rental.status !== "active") return;
    if (rental.vehicleId !== data.previousVehicleId) { alert("This rental's vehicle has changed. Reopen Change vehicle and try again."); return; }
    if (rental.startDate > todayKey()) { alert("The rental has not started yet. Change the assignment after its start date."); return; }
    const replacement = replacementVehicles(rental).find(vehicle => vehicle.id === data.vehicleId);
    if (!replacement) { alert("That vehicle is no longer available. Choose another replacement."); return; }
    const previous = vehicleById(rental.vehicleId);
    const mileage = Number(data.returnMileage);
    if (String(data.returnMileage ?? "").trim() === "" || !Number.isFinite(mileage) || mileage < Number(previous?.mileage || 0)) { alert("Return mileage cannot be less than the current recorded mileage."); return; }
    const change = { date: todayKey(), fromVehicleId: rental.vehicleId, toVehicleId: replacement.id,
      fromLabel: previous ? vehicleLine(previous) : rental.vehicleId, toLabel: vehicleLine(replacement),
      returnMileage: mileage, notes: String(data.notes || "").trim() };
    rental.vehicleChanges = [...(rental.vehicleChanges || []), change];
    rental.vehicleId = replacement.id;
    if (previous) previous.mileage = mileage;
    syncVehicle(change.fromVehicleId);
    syncVehicle(replacement.id);
    ui.view = "rentals"; ui.rentalId = rental.id; ui.rentalMode = "profile"; ui.vehicleId = replacement.id;
    addActivity("rental", `${change.fromLabel} changed to ${change.toLabel}.`, "rental", rental.id, { rentalId: rental.id, vehicleId: replacement.id, customerId: rental.customerId });
    commit("Vehicle changed. Rental terms and payments preserved.");
  }

  function returnRentalForm() {
    const rental = rentalById(ui.prefill.rentalId);
    if (!rental) return '';
    const vehicle = vehicleById(rental.vehicleId);
    return '<form data-form="return" class="record-form">' + hiddenField('rentalId', rental.id) + '<div class="form-grid"><label>Actual return date<input type="date" name="returnDate" min="' + esc(rental.startDate) + '" max="' + todayKey() + '" value="' + todayKey() + '" required></label>' + field('Return mileage', 'returnMileage', vehicle?.mileage || '', 'number', true) + textarea('Return notes', 'returnNotes', '') + '</div><section class="return-settlement" aria-live="polite">' + returnPreview(rental, todayKey()) + '</section><footer><button class="primary-add">Confirm vehicle return</button></footer></form>';
  }

  function saveRentalReturn(data) {
    const rental = rentalById(data.rentalId);
    if (auth?.role !== 'staff' || !rental || rental.status === 'closed') return;
    const lastChange = rental.vehicleChanges?.at(-1);
    if (lastChange && data.returnDate < lastChange.date) { alert('Return date cannot be before the last vehicle change.'); return; }
    if (!RentalMath.date(data.returnDate) || data.returnDate < rental.startDate || data.returnDate > todayKey()) { alert('Choose a return date between the rental start date and today.'); return; }
    const vehicle = vehicleById(rental.vehicleId), mileage = Number(data.returnMileage);
    if (!Number.isFinite(mileage) || mileage < Number(vehicle?.mileage || 0)) { alert('Return mileage cannot be less than the current recorded mileage.'); return; }
    rental.returnDate = data.returnDate; rental.returnMileage = mileage; rental.returnNotes = String(data.returnNotes || '').trim(); rental.billingPolicy = 'calendar-monthly'; rental.status = 'closed';
    if (vehicle) vehicle.mileage = mileage;
    syncVehicle(rental.vehicleId);
    ui.view = 'rentals'; ui.rentalId = rental.id; ui.rentalMode = 'profile';
    addActivity('rental', rentalCode(rental) + ' returned on ' + rental.returnDate + '.', 'rental', rental.id, { rentalId: rental.id, vehicleId: rental.vehicleId, customerId: rental.customerId });
    commit('Vehicle returned. Final amount due: ' + money(rentalBalance(rental)) + '.');
  }

  function vehicleForm() {
    const vehicle = vehicleById(ui.prefill.editVehicleId);
    const values = vehicle || {};
    const statuses = ["available", "rented", "maintenance", "inactive"];
    if (vehicle?.status && !statuses.includes(vehicle.status)) statuses.unshift(vehicle.status);
    return `<form data-form="vehicle" class="record-form">${hiddenField("editVehicleId", vehicle?.id || "")}<div class="form-grid">
      ${field("Unit number", "unit", values.unit, "text", true)}
      ${field("Make", "make", values.make, "text", true)}
      ${field("Model", "model", values.model, "text", true)}
      ${field("Year", "year", values.year, "number", !vehicle)}
      ${field("Plate", "plate", values.plate, "text", !vehicle)}
      ${field("VIN", "vin", values.vin, "text", !vehicle)}
      ${selectField("Status", "status", statuses, values.status || "available")}
      ${field("Mileage", "mileage", values.mileage == null ? "" : String(values.mileage), "number", !vehicle)}
      ${field("Location", "location", values.location, "text")}
      ${field("Acquisition cost", "acquisitionCost", values.acquisitionCost, "number", false, "0.01")}
      ${field("Loan balance", "loanBalance", values.loanBalance, "number", false, "0.01")}
      ${field("Monthly payment", "monthlyPayment", values.monthlyPayment, "number", false, "0.01")}
      ${field("Color", "color", values.color, "text")}
      ${field("Next service", "nextService", vehicle ? values.nextService : todayKey(), "date")}
      ${field("Insurance expiry", "insuranceExpiry", values.insuranceExpiry, "date")}
    </div><footer><button type="button" class="soft-btn" data-action="close-modal">Cancel</button><button class="primary-add">${vehicle ? "Save changes" : "Save vehicle"}</button></footer></form>`;
  }

  function customerForm() {
    const customer = customerById(ui.prefill.editCustomerId);
    const values = customer || {};
    const statuses = ["active", "watch", "inactive"];
    if (customer?.status && !statuses.includes(customer.status)) statuses.unshift(customer.status);
    return `<form data-form="customer" class="record-form">${hiddenField("editCustomerId", customer?.id || "")}<div class="form-grid">
      ${field("Customer name", "name", values.name, "text", true)}
      ${field("Phone", "phone", values.phone, "tel", !customer)}
      ${field("Email", "email", values.email, "email")}
      ${field("Driver license", "license", values.license, "text", !customer)}
      ${selectField("Status", "status", statuses, values.status || "active")}
      ${field("Address", "address", values.address, "text")}
      ${textarea("Notes", "notes", values.notes)}
    </div><footer><button type="button" class="soft-btn" data-action="close-modal">Cancel</button><button class="primary-add">${customer ? "Save changes" : "Save customer"}</button></footer></form>`;
  }

  function passwordForm() {
    const user = auth?.user || auth || {};
    return `<form data-form="password" class="record-form password-form"><div class="form-grid">
      <div class="form-note wide"><b>${esc(user.name || "Account")}</b><span>${esc(user.username ? "Mobile " + user.username : "Signed in account")}</span></div>
      ${field("Current password", "currentPassword", "", "password", true)}
      ${field("New password", "newPassword", "", "password", true)}
      ${field("Confirm password", "confirmPassword", "", "password", true)}
    </div><footer><button class="primary-add">Save password</button></footer></form>`;
  }

  function lockedContext(title, detail) {
    return `<div class="form-note locked-context wide"><b>${esc(title)}</b><span>${esc(detail)}</span></div>`;
  }

  function vehicleLine(vehicle) {
    return vehicle ? `${vehicle.unit} - ${vehicle.make} ${vehicle.model}` : "Vehicle";
  }

  function rentalLine(rental) {
    const vehicle = vehicleById(rental?.vehicleId);
    const customer = customerById(rental?.customerId);
    return rental ? `${rentalCode(rental)} / ${vehicleLine(vehicle)} / ${customer?.name || "Customer"}` : "Rental";
  }

  function customerLine(customer) {
    return customer ? `${customer.name} / ${customer.phone || "phone not saved"}` : "Customer";
  }

  function rentalForm() {
    const prefill = ui.prefill || {};
    const lockedVehicle = prefill.vehicleId ? vehicleById(prefill.vehicleId) : null;
    const selectedCustomer = customerById(prefill.customerId || "");
    return `<form data-form="rental" class="record-form"><div class="form-grid">
      ${selectField("Assign to customer", "customerId", [{ value: "", label: "New customer — enter details below" }, ...db.customers.map(customer => ({ value: customer.id, label: `${customer.name} / ${customer.phone || customer.email || customer.id}` }))], selectedCustomer?.id || "")}
      <label class="wide"><span><input type="checkbox" name="additionalRental"> I intend to assign an additional vehicle if this customer already has an open rental.</span></label>
      ${lockedVehicle ? hiddenField("vehicleId", lockedVehicle.id) + lockedContext("Rental for this car", vehicleLine(lockedVehicle)) : rentalVehicleOptions(prefill.vehicleId || ui.vehicleId)}
      ${field("Start date", "startDate", todayKey(), "date", true)}
      ${field("Return date", "endDate", addDays(7), "date", true)}
      ${field("Monthly rate", "monthlyRate", "1800", "number", true, "0.01")}
      ${field("Deposit", "deposit", "300", "number", false, "0.01")}
      ${selectField("Status", "status", ["reserved", "active"], "active")}
      ${field("Pickup location", "pickupLocation", db.settings.location, "text")}
      <div class="form-note wide"><b>Customer details</b><span>Choose an existing customer above or enter a new customer below. This creates a new rental; use Change vehicle on an active rental to swap cars.</span></div>
      ${field("Customer name", "driverName", selectedCustomer?.name || "", "text", true)}
      ${field("Phone", "driverPhone", selectedCustomer?.phone || "", "tel", true)}
      ${field("Email", "customerEmail", selectedCustomer?.email || "", "email")}
      ${field("Address", "customerAddress", selectedCustomer?.address || "", "text", true)}
      ${field("Driver license", "licenseNumber", selectedCustomer?.license || "", "text", true)}
      ${field("License expiry", "licenseExpiry", "", "date", true)}
      ${field("Insurance company", "insuranceCompany", "", "text", true)}
      ${field("Policy number", "insurancePolicy", "", "text", true)}
      ${field("Insurance expiry", "insuranceExpiry", "", "date", true)}
      ${fileField("Driver license photo", "driverLicenseFile", "image/*,.pdf", false)}
      ${fileField("Insurance proof", "insuranceFile", "image/*,.pdf", false)}
      ${fileField("Rental agreement", "agreementFile", "image/*,.pdf,.doc,.docx", false)}
      ${fileField("Inspection photo", "inspectionPhotoFile", "image/*", false)}
      ${textarea("Notes", "notes", "")}
    </div><footer><button class="primary-add">Save rental</button></footer></form>`;
  }

  function maintenanceForm() {
    const prefill = ui.prefill || {};
    const lockedVehicle = prefill.vehicleId ? vehicleById(prefill.vehicleId) : null;
    return `<form data-form="maintenance" class="record-form"><div class="form-grid">
      ${lockedVehicle ? hiddenField("vehicleId", lockedVehicle.id) + lockedContext("Service for this car", vehicleLine(lockedVehicle)) : vehicleOptions(prefill.vehicleId || ui.vehicleId)}
      ${selectField("Service type", "type", ["Oil change", "Tires", "Brakes", "Inspection", "Body repair", "Mechanical repair"], "Oil change")}
      ${field("Service date", "date", todayKey(), "date", true)}
      ${selectField("Status", "status", ["scheduled", "in_progress"], "scheduled")}
      <div class="form-note wide"><b>Cost comes later</b><span>This is only a service reminder. Use Add cost from the service row after the work is finished.</span></div>
      ${field("Shop", "shop", "", "text")}
      ${field("Odometer", "odometer", vehicleById(prefill.vehicleId || ui.vehicleId)?.mileage || "", "number", true)}
      ${textarea("Notes", "notes", "")}
    </div><footer><button class="primary-add">Save maintenance</button></footer></form>`;
  }

  function paymentForm() {
    const prefill = ui.prefill || {};
    const paymentKind = prefill.paymentKind || (prefill.maintenanceId ? "maintenance" : "rental");
    const lockedRental = paymentKind === "rental" && prefill.rentalId ? rentalById(prefill.rentalId) : null;
    const lockedMaintenance = paymentKind === "maintenance" && prefill.maintenanceId ? maintenanceById(prefill.maintenanceId) : null;
    const amountLabel = lockedMaintenance ? "Actual cost" : paymentKind === "maintenance" ? "Amount / actual cost" : "Amount";
    return `<form data-form="payment" class="record-form payment-form" data-payment-kind="${esc(paymentKind)}"><div class="form-grid">
      ${lockedRental || lockedMaintenance ? hiddenField("paymentKind", paymentKind) : `<div class="payment-kind-field">${selectField("Payment kind", "paymentKind", [{ value: "rental", label: "Customer rental payment" }, { value: "maintenance", label: "Maintenance actual cost" }], paymentKind)}</div>`}
      ${lockedRental ? hiddenField("rentalId", lockedRental.id) + paymentContextNote("rental", lockedRental) : lockedMaintenance ? "" : `<div data-payment-field="rental">${rentalOptions(prefill.rentalId || ui.rentalId)}</div>`}
      ${lockedMaintenance ? hiddenField("maintenanceId", lockedMaintenance.id) + paymentContextNote("maintenance", lockedMaintenance) : lockedRental ? "" : `<div data-payment-field="maintenance">${maintenanceOptions(prefill.maintenanceId || "")}</div>`}
      ${field("Date", "date", todayKey(), "date", true)}
      ${field(amountLabel, "amount", "", "number", true, "0.01")}
      ${selectField("Method", "method", ["Card", "ACH", "Cash", "Check", "Zelle", "Other"], "Card")}
      ${field("Reference", "reference", "", "text")}
      ${textarea("Notes", "notes", "")}
    </div><footer><button class="primary-add">${paymentKind === "maintenance" ? "Save actual cost" : "Save payment"}</button></footer></form>`;
  }

  function paymentContextNote(kind, record) {
    if (kind === "maintenance") {
      const vehicle = vehicleById(record.vehicleId);
      return `<div class="form-note payment-context wide"><b>Cost for this service</b><span>${esc(record.type)} / ${esc(vehicle ? vehicle.unit + " - " + vehicle.make + " " + vehicle.model : "Vehicle")} / ${shortDate(record.date)}</span></div>`;
    }
    const vehicle = vehicleById(record.vehicleId);
    const customer = customerById(record.customerId);
    return `<div class="form-note payment-context wide"><b>Payment for this rental</b><span>${esc(rentalCode(record))} / ${esc(vehicle ? vehicle.unit + " - " + vehicle.make + " " + vehicle.model : "Vehicle")} / ${esc(customer?.name || "Customer")} / balance ${money(rentalBalance(record))}</span></div>`;
  }

  function expenseForm() {
    const prefill = ui.prefill || {};
    const lockedRental = prefill.rentalId ? rentalById(prefill.rentalId) : null;
    const lockedVehicle = lockedRental ? vehicleById(lockedRental.vehicleId) : prefill.vehicleId ? vehicleById(prefill.vehicleId) : null;
    return `<form data-form="expense" class="record-form"><div class="form-grid">
      ${lockedRental ? hiddenField("vehicleId", lockedRental.vehicleId) + hiddenField("rentalId", lockedRental.id) + lockedContext("Expense for this rental", rentalLine(lockedRental)) : lockedVehicle ? hiddenField("vehicleId", lockedVehicle.id) + lockedContext("Expense for this car", vehicleLine(lockedVehicle)) + rentalOptions(prefill.rentalId || "", lockedVehicle.id) : vehicleOptions(prefill.vehicleId || ui.vehicleId) + rentalOptions(prefill.rentalId || "")}
      ${selectField("Category", "category", ["Fuel", "Cleaning", "Toll", "Parking", "Repair", "Maintenance payment", "Insurance", "Other"], "Fuel")}
      ${field("Date", "date", todayKey(), "date", true)}
      ${field("Amount", "amount", "", "number", true, "0.01")}
      ${selectField("Payment method", "paymentMethod", ["Fleet card", "Card", "Cash", "ACH", "Other"], "Fleet card")}
      ${selectField("Status", "status", ["paid", "pending", "reimbursable"], "paid")}
      ${textarea("Notes", "notes", "")}
    </div><footer><button class="primary-add">Save expense</button></footer></form>`;
  }

  function inspectionForm() {
    const prefill = ui.prefill || {};
    const lockedRental = prefill.rentalId ? rentalById(prefill.rentalId) : null;
    const lockedVehicle = lockedRental ? vehicleById(lockedRental.vehicleId) : prefill.vehicleId ? vehicleById(prefill.vehicleId) : null;
    return `<form data-form="inspection" class="record-form"><div class="form-grid">
      ${lockedRental ? hiddenField("vehicleId", lockedRental.vehicleId) + hiddenField("rentalId", lockedRental.id) + lockedContext("Inspection for this rental", rentalLine(lockedRental)) : lockedVehicle ? hiddenField("vehicleId", lockedVehicle.id) + lockedContext("Inspection for this car", vehicleLine(lockedVehicle)) + rentalOptions(prefill.rentalId || "", lockedVehicle.id) : vehicleOptions(prefill.vehicleId || ui.vehicleId) + rentalOptions(prefill.rentalId || "")}
      ${field("Inspection date", "date", todayKey(), "date", true)}
      ${field("Odometer", "odometer", vehicleById(prefill.vehicleId || ui.vehicleId)?.mileage || "", "number", true)}
      ${selectField("Condition", "condition", ["Passed", "Needs repair", "Damage found", "Cleaning required"], "Passed")}
      ${selectField("Fuel", "fuel", ["Full", "Three quarters", "Half", "Quarter", "Empty", "EV charged"], "Full")}
      ${textarea("Notes", "notes", "")}
    </div><footer><button class="primary-add">Save inspection</button></footer></form>`;
  }

  function documentForm() {
    const prefill = ui.prefill || {};
    const ownerType = prefill.ownerType || "vehicle";
    const documentType = documentTypeLabel(prefill.documentType || prefill.type || (ownerType === "customer" ? "Driver license" : ownerType === "vehicle" ? "Vehicle insurance" : "Rental agreement"));
    const isReplace = Boolean(ui.documentId);
    const lockedOwner = Boolean(prefill.ownerType && prefill.ownerId);
    const ownerFieldName = ownerType === "vehicle" ? "vehicleId" : ownerType === "customer" ? "customerId" : "rentalId";
    const ownerTitle = ownerType === "vehicle" ? "File for this car" : ownerType === "customer" ? "File for this customer" : "File for this rental";
    const ownerDetail = ownerType === "vehicle" ? vehicleLine(vehicleById(prefill.ownerId)) : ownerType === "customer" ? customerLine(customerById(prefill.ownerId)) : rentalLine(rentalById(prefill.ownerId));
    return `<form data-form="document" class="record-form"><div class="form-grid">
      ${isReplace ? `<div class="form-note wide"><b>Replacing document file</b><span>${esc(entityName(ownerType, prefill.ownerId))}</span></div>` : ""}
      ${lockedOwner ? hiddenField("ownerType", ownerType) + hiddenField(ownerFieldName, prefill.ownerId) + lockedContext(ownerTitle, ownerDetail) : `${selectField("Record type", "ownerType", [{ value: "vehicle", label: "Car" }, { value: "customer", label: "Customer" }, { value: "rental", label: "Rental" }], ownerType)}
        <div class="owner-picker wide" data-owner-type-group="${esc(ownerType)}">
          <div data-owner-field="vehicle">${vehicleOptions(ownerType === "vehicle" ? prefill.ownerId : ui.vehicleId)}</div>
          <div data-owner-field="customer">${customerOptions(ownerType === "customer" ? prefill.ownerId : ui.customerId)}</div>
          <div data-owner-field="rental">${rentalOptions(ownerType === "rental" ? prefill.ownerId : ui.rentalId)}</div>
        </div>`}
      ${selectField("Document type", "type", ["Driver license", "Vehicle insurance", "Customer insurance", "Registration", "Rental agreement", "Inspection photo", "Maintenance receipt", "Payment receipt", "Title", "Other"], documentType)}
      ${fileField("Photo or file", "file", "image/*,.pdf,.doc,.docx")}
      ${field("Expiry date", "expiryDate", prefill.expiryDate || "", "date")}
      ${textarea("Notes", "notes", prefill.notes || "")}
    </div><footer><button class="primary-add">${isReplace ? "Save replacement" : "Save document"}</button></footer></form>`;
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function saveForm(form) {
    const data = formValues(form);
    for (const box of form.querySelectorAll(".file-capture")) { const input = box.querySelector("[data-file-name]"); const selected = box.selectedFile || input?.files?.[0]; if (selected) data[input.dataset.fileName] = selected; else if (input?.dataset.fileRequired === "true") { alert("Choose the required file before saving."); return; } }
    const type = form.dataset.form;
    if (type === "login") return login(data);
    if (type === "password") return changePassword(data);
    if (type === "customer-checkin") return saveCustomerCheckIn(data);
    if (type === "settings") {
      db.settings = Object.assign({}, db.settings, data);
      commit("Settings updated.");
      return;
    }
    if (type === "return") return saveRentalReturn(data);
    if (type === "contract") return saveContract(data);
    if (type === "cancel-assignment") return saveAssignmentCancellation(data);
    if (type === "manage-record") return saveRecordManagement({ ...data, operation: form.dataset.operation });
    if (type === "change-vehicle") return saveVehicleChange(data);
    if (type === "vehicle") return saveVehicle(data);
    if (type === "customer") return saveCustomer(data);
    if (type === "rental") return saveRental(data);
    if (type === "maintenance") return saveMaintenance(data);
    if (type === "payment") return savePayment(data);
    if (type === "expense") return saveExpense(data);
    if (type === "inspection") return saveInspection(data);
    if (type === "document") return saveDocument(data);
  }

  async function login(data) {
    loginState = { busy: true, error: "" };
    dbState = { state: "loading", label: "Loading DB", detail: "Checking MongoDB connection." };
    render();
    try {
      const response = await fetch(API_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.username,
          password: data.password
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        loginState = { busy: false, error: payload.error || "Login failed." };
        saveAuthSession(null);
        render();
        return;
      }
      saveAuthSession({ token: payload.token, role: payload.user.role, user: payload.user });
      loginState = { busy: false, error: "" };
      await hydrateFromServer();
    } catch (error) {
      loginState = { busy: false, error: "Could not reach the app database." };
      saveAuthSession(null);
      render();
    }
  }

  async function changePassword(data) {
    const currentPassword = String(data.currentPassword || "");
    const newPassword = String(data.newPassword || "");
    const confirmPassword = String(data.confirmPassword || "");
    if (!currentPassword || !newPassword) {
      alert("Enter the current password and new password.");
      return;
    }
    if (newPassword.length < 8) {
      alert("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("New password and confirmation do not match.");
      return;
    }
    try {
      const response = await fetch(API_CHANGE_PASSWORD_URL, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      if (response.status === 401) {
        const payload = await response.json().catch(() => ({}));
        if (String(payload.error || "").includes("Login required")) {
          logout();
          return;
        }
        alert(payload.error || "Current password is not correct.");
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        alert(payload.error || "Password could not be changed.");
        return;
      }
      if (payload.user) {
        saveAuthSession(Object.assign({}, auth, { role: payload.user.role, user: payload.user }));
      }
      ui.modal = null;
      ui.prefill = {};
      ui.toast = "Password updated.";
      render();
    } catch (error) {
      alert("Password could not reach the database.");
    }
  }

  async function resetCustomerPassword(customerId) {
    const customer = customerById(customerId);
    if (!customer) return;
    if (!phoneKey(customer.phone)) {
      alert("Save the customer mobile number before creating login access.");
      return;
    }
    if (!confirm(`Set a new temporary password for ${customer.name}?`)) return;
    try {
      const response = await fetch(API_CUSTOMER_PASSWORD_URL, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ customerId })
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        alert(payload.error || "Temporary password could not be created.");
        return;
      }
      alert(`Customer login\nMobile: ${payload.username}\nTemporary password: ${payload.temporaryPassword}\nAsk the customer to change it after login.`);
      ui.toast = "Temporary customer password created.";
      ui.actionMenu = "";
      render();
    } catch (error) {
      alert("Temporary password could not reach the database.");
    }
  }

  async function logout() {
    const current = auth;
    saveAuthSession(null);
    dbState = { state: "loading", label: "Loading DB", detail: "Checking MongoDB connection." };
    loginState = { busy: false, error: "" };
    render();
    if (current?.token && typeof fetch === "function") {
      try {
        await fetch(API_LOGOUT_URL, { method: "POST", headers: { Authorization: `Bearer ${current.token}` } });
      } catch (error) {}
    }
  }

  async function saveCustomerCheckIn(data) {
    if (auth?.role !== "customer") return;
    let upload;
    try {
      upload = await readUpload(data.photo);
    } catch (error) {
      alert(error.message || "The photo could not be added.");
      return;
    }
    try {
      const response = await fetch(API_CUSTOMER_CHECKIN_URL, {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          rentalId: data.rentalId,
          vehicleId: data.vehicleId,
          date: data.date,
          odometer: data.odometer,
          fuel: data.fuel,
          notes: data.notes,
          photo: upload
        })
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        alert(payload.error || "This update could not be saved.");
        return;
      }
      if (payload.data) {
        db = normalize(payload.data);
        saveLocalData(false);
        syncUiSelection();
      }
      dbState = { state: "connected", label: "MongoDB", detail: "Customer update saved to MongoDB." };
      ui.toast = "Update submitted.";
      render();
    } catch (error) {
      alert("This update could not reach the database.");
    }
  }

  function saveVehicle(data) {
    const existing = data.editVehicleId ? vehicleById(data.editVehicleId) : null;
    if (data.editVehicleId && !existing) throw new Error("This vehicle no longer exists. Refresh the fleet and try again.");
    const vehicle = {
      id: existing ? existing.id : uid("veh"),
      unit: data.unit.trim(),
      make: data.make.trim(),
      model: data.model.trim(),
      year: Number(data.year || 0),
      vin: data.vin.trim(),
      plate: data.plate.trim(),
      status: data.status,
      mileage: Number(data.mileage || 0),
      location: data.location.trim(),
      acquisitionCost: Number(data.acquisitionCost || 0),
      loanBalance: Number(data.loanBalance || 0),
      monthlyPayment: Number(data.monthlyPayment || 0),
      color: data.color.trim(),
      nextService: data.nextService,
      insuranceExpiry: data.insuranceExpiry
    };
    if (existing) Object.assign(existing, vehicle);
    else db.vehicles.unshift(vehicle);
    ui.vehicleId = vehicle.id;
    ui.view = "fleet";
    ui.fleetMode = "profile";
    addActivity("vehicle", `${vehicle.unit} ${existing ? "updated" : "added to the fleet"}.`, "vehicle", vehicle.id, { vehicleId: vehicle.id });
    commit(existing ? "Vehicle updated." : "Vehicle added.");
  }

  function saveCustomer(data) {
    const existing = data.editCustomerId ? customerById(data.editCustomerId) : null;
    if (data.editCustomerId && !existing) throw new Error("This customer no longer exists. Refresh the customers and try again.");
    const phone = phoneKey(data.phone);
    if (phone && db.customers.some((customer) => customer.id !== existing?.id && phoneKey(customer.phone) === phone)) {
      throw new Error("This phone number is already used by another customer.");
    }
    const customer = {
      id: existing ? existing.id : uid("cus"),
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      license: data.license.trim(),
      status: data.status,
      address: data.address.trim(),
      notes: data.notes.trim()
    };
    if (existing) Object.assign(existing, customer);
    else db.customers.unshift(customer);
    syncCustomerDetails(existing || customer);
    ui.customerId = customer.id;
    ui.view = "customers";
    ui.customerMode = "profile";
    addActivity("customer", `${customer.name} ${existing ? "updated" : "added as a customer"}.`, "customer", customer.id, { customerId: customer.id });
    commit(existing ? "Customer updated." : "Customer added.");
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function phoneKey(value) {
    return cleanText(value).replace(/\D/g, "");
  }

  function textKey(value) {
    return cleanText(value).toLowerCase();
  }

  function loadAuthSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveAuthSession(session) {
    auth = session;
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (error) {}
  }

  function apiHeaders(headers) {
    const next = Object.assign({}, headers || {});
    if (auth?.token) next.Authorization = `Bearer ${auth.token}`;
    return next;
  }

  function saveCustomerFromRental(data) {
    const details = {
      name: cleanText(data.driverName),
      phone: cleanText(data.driverPhone),
      email: cleanText(data.customerEmail),
      address: cleanText(data.customerAddress),
      license: cleanText(data.licenseNumber)
    };
    if (!details.name || !details.phone || !details.address || !details.license) {
      alert("Enter customer name, phone, address, and driver license before saving the rental.");
      return null;
    }
    const licenseKey = textKey(details.license);
    const phone = phoneKey(details.phone);
    const existing = customerById(data.customerId) || db.customers.find((customer) =>
      (licenseKey && textKey(customer.license) === licenseKey) ||
      (phone && phoneKey(customer.phone) === phone)
    );
    if (existing) {
      existing.name = details.name;
      existing.phone = details.phone;
      existing.email = details.email || existing.email || "";
      existing.address = details.address;
      existing.license = details.license;
      existing.status = existing.status || "active";
      syncCustomerDetails(existing);
      addActivity("customer", `${existing.name} updated from rental desk.`, "customer", existing.id, { customerId: existing.id });
      return existing;
    }
    const customer = {
      id: uid("cus"),
      name: details.name,
      phone: details.phone,
      email: details.email,
      license: details.license,
      status: "active",
      address: details.address,
      notes: "Created from rental desk."
    };
    db.customers.unshift(customer);
    addActivity("customer", `${customer.name} added from rental desk.`, "customer", customer.id, { customerId: customer.id });
    return customer;
  }

  function addRentalDocument(rental, type, upload, expiryDate, notes) {
    if (!upload.fileName) return;
    db.documents.unshift({
      id: uid("doc"),
      ownerType: "rental",
      ownerId: rental.id,
      type,
      fileName: upload.fileName,
      fileData: upload.fileData,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      expiryDate: expiryDate || "",
      notes: notes || ""
    });
  }

  async function saveRental(data) {
    const knownCustomer = customerById(data.customerId) || db.customers.find(customer => (phoneKey(data.driverPhone) && phoneKey(customer.phone) === phoneKey(data.driverPhone)) || (textKey(data.licenseNumber) && textKey(customer.license) === textKey(data.licenseNumber)));
    if (knownCustomer && db.rentals.some(rental => rental.customerId === knownCustomer.id && ["active", "reserved"].includes(rental.status)) && data.additionalRental !== "on") {
      throw new Error("This customer already has an assigned vehicle. Open their profile to change or return it. For an intentional additional rental, tick the additional vehicle box.");
    }
    const vehicle = vehicleById(data.vehicleId);
    if (!vehicle) {
      alert("No available car is selected for this rental.");
      return;
    }
    if (vehicle.status !== "available") {
      alert(`${vehicle.unit} is not available. Choose an available car before saving the rental.`);
      return;
    }
    if (data.status !== "closed") {
      const conflict = db.rentals.find((rental) => rental.vehicleId === vehicle.id && rental.status !== "closed" && rangesOverlap(data.startDate, data.endDate, rental.startDate, rental.endDate));
      if (conflict) {
        alert(`${vehicle.unit} already has ${rentalCode(conflict)} from ${shortDate(conflict.startDate)} to ${shortDate(conflict.endDate)}.`);
        return;
      }
    }
    if (data.status === "active" && vehicle.status === "maintenance") {
      alert(`${vehicle.unit} is in maintenance. Close the service item before starting an active rental.`);
      return;
    }
    if (data.status === "active" && vehicle.status === "inactive") {
      alert(`${vehicle.unit} is inactive and cannot be rented.`);
      return;
    }
    let driverLicenseUpload;
    let insuranceUpload;
    let agreementUpload;
    let inspectionPhotoUpload;
    try {
      driverLicenseUpload = await readUpload(data.driverLicenseFile);
      insuranceUpload = await readUpload(data.insuranceFile);
      agreementUpload = await readUpload(data.agreementFile);
      inspectionPhotoUpload = await readUpload(data.inspectionPhotoFile);
    } catch (error) {
      alert(error.message || "One of the rental files could not be added.");
      return;
    }
    const customer = saveCustomerFromRental(data);
    if (!customer) return;
    const rental = {
      id: uid("ren"),
      vehicleId: vehicle.id,
      customerId: customer.id,
      startDate: data.startDate,
      endDate: data.endDate,
      pickupLocation: data.pickupLocation.trim(),
      monthlyRate: Number(data.monthlyRate || 0),
      deposit: Number(data.deposit || 0),
      status: data.status,
      billingPolicy: "calendar-monthly",
      driverName: String(data.driverName || customer.name).trim(),
      driverPhone: String(data.driverPhone || customer.phone).trim(),
      licenseNumber: String(data.licenseNumber || customer.license).trim(),
      licenseExpiry: data.licenseExpiry,
      insuranceCompany: String(data.insuranceCompany || "").trim(),
      insurancePolicy: String(data.insurancePolicy || "").trim(),
      insuranceExpiry: data.insuranceExpiry,
      notes: String(data.notes || "").trim()
    };
    db.rentals.unshift(rental);
    addRentalDocument(rental, "Driver license", driverLicenseUpload, rental.licenseExpiry, `Customer: ${rental.driverName}`);
    addRentalDocument(rental, "Customer insurance", insuranceUpload, rental.insuranceExpiry, `${rental.insuranceCompany} / ${rental.insurancePolicy}`);
    addRentalDocument(rental, "Rental agreement", agreementUpload, "", `${rentalCode(rental)} agreement`);
    addRentalDocument(rental, "Inspection photo", inspectionPhotoUpload, "", `${rentalCode(rental)} pickup photo`);
    syncVehicle(vehicle.id);
    ui.rentalId = rental.id;
    ui.vehicleId = vehicle.id;
    ui.customerId = customer.id;
    ui.view = "rentals";
    ui.rentalMode = "profile";
    addActivity("rental", `${rentalCode(rental)} created for ${customer.name} and ${vehicle.unit}.`, "rental", rental.id, { rentalId: rental.id, vehicleId: vehicle.id, customerId: customer.id });
    commit(`Rental saved. Customer login uses ${phoneKey(customer.phone)}. Set a temporary password from the customer profile.`);
  }

  function saveMaintenance(data) {
    const item = {
      id: uid("mnt"),
      vehicleId: data.vehicleId,
      type: data.type,
      date: data.date,
      status: data.status,
      estimate: 0,
      actualCost: 0,
      paidAmount: 0,
      shop: data.shop.trim(),
      odometer: Number(data.odometer || 0),
      notes: data.notes.trim()
    };
    db.maintenance.unshift(item);
    const vehicle = vehicleById(data.vehicleId);
    if (vehicle && item.odometer > Number(vehicle.mileage || 0)) vehicle.mileage = item.odometer;
    syncVehicle(data.vehicleId);
    ui.vehicleId = data.vehicleId;
    ui.view = "fleet";
    ui.fleetMode = "profile";
    ui.vehicleTab = "service";
    addActivity("maintenance", `${item.type} opened for ${vehicle?.unit || "vehicle"}.`, "vehicle", data.vehicleId, { vehicleId: data.vehicleId });
    commit("Maintenance saved.");
  }

  function savePayment(data) {
    if (data.paymentKind === "maintenance") {
      const item = maintenanceById(data.maintenanceId);
      if (!item) {
        alert("Select the maintenance record this cost belongs to.");
        return;
      }
      const amount = Number(data.amount || 0);
      if (amount <= 0) {
        alert("Enter the actual maintenance cost.");
        return;
      }
      const totalCost = maintenanceCost(item.id) + amount;
      item.actualCost = totalCost;
      item.paidAmount = totalCost;
      item.status = "completed";
      const expense = {
        id: uid("exp"),
        vehicleId: item.vehicleId,
        rentalId: "",
        maintenanceId: item.id,
        date: data.date,
        category: "Maintenance payment",
        amount,
        paymentMethod: data.method,
        status: "paid",
        notes: data.notes.trim() || data.reference.trim()
      };
      db.expenses.unshift(expense);
      syncVehicle(item.vehicleId);
      ui.vehicleId = item.vehicleId;
      ui.view = "fleet";
      ui.fleetMode = "profile";
      ui.vehicleTab = "service";
      addActivity("payment", `Maintenance payment recorded for ${vehicleById(item.vehicleId)?.unit || "vehicle"}.`, "vehicle", item.vehicleId, { vehicleId: item.vehicleId, maintenanceId: item.id });
      commit("Maintenance actual cost saved.");
      return;
    }
    const rental = rentalById(data.rentalId);
    if (!rental) return;
    const payment = {
      id: uid("pay"),
      rentalId: rental.id,
      customerId: rental.customerId,
      vehicleId: rental.vehicleId,
      date: data.date,
      amount: Number(data.amount || 0),
      method: data.method,
      reference: data.reference.trim(),
      emailReceiptRequestedAt: new Date().toISOString(),
      notes: data.notes.trim()
    };
    db.payments.unshift(payment);
    ui.view = "finance";
    addActivity("payment", `Payment received for ${rentalCode(rental)}.`, "rental", rental.id, { rentalId: rental.id, vehicleId: rental.vehicleId, customerId: rental.customerId });
    commit("Payment saved.");
  }

  function saveExpense(data) {
    const expense = {
      id: uid("exp"),
      vehicleId: data.vehicleId,
      rentalId: data.rentalId,
      maintenanceId: "",
      date: data.date,
      category: data.category,
      amount: Number(data.amount || 0),
      paymentMethod: data.paymentMethod,
      status: data.status,
      notes: data.notes.trim()
    };
    db.expenses.unshift(expense);
    ui.view = "finance";
    addActivity("expense", `${expense.category} expense recorded for ${vehicleById(expense.vehicleId)?.unit || "vehicle"}.`, "vehicle", expense.vehicleId, { vehicleId: expense.vehicleId, rentalId: expense.rentalId });
    commit("Expense saved.");
  }

  function saveInspection(data) {
    const inspection = {
      id: uid("ins"),
      vehicleId: data.vehicleId,
      rentalId: data.rentalId,
      date: data.date,
      odometer: Number(data.odometer || 0),
      condition: data.condition,
      fuel: data.fuel,
      notes: data.notes.trim()
    };
    db.inspections.unshift(inspection);
    const vehicle = vehicleById(data.vehicleId);
    if (vehicle && inspection.odometer > Number(vehicle.mileage || 0)) vehicle.mileage = inspection.odometer;
    ui.vehicleId = data.vehicleId;
    ui.view = "fleet";
    ui.fleetMode = "profile";
    ui.vehicleTab = "service";
    addActivity("inspection", `${inspection.condition} inspection saved for ${vehicle?.unit || "vehicle"}.`, "vehicle", data.vehicleId, { vehicleId: data.vehicleId, rentalId: data.rentalId });
    commit("Inspection saved.");
  }

  async function saveDocument(data) {
    const ownerId = data.ownerType === "vehicle" ? data.vehicleId : data.ownerType === "customer" ? data.customerId : data.rentalId;
    if (!ownerId) {
      alert("Select the car, customer, or rental this document belongs to.");
      return;
    }
    let upload;
    try {
      upload = await readUpload(data.file);
    } catch (error) {
      alert(error.message || "The file could not be added.");
      return;
    }
    if (!upload.fileName) {
      alert("Upload a file or take a photo before saving this document.");
      return;
    }
    const existing = ui.documentId ? db.documents.find((doc) => doc.id === ui.documentId) : null;
    const doc = existing || {
      id: uid("doc"),
      ownerType: data.ownerType,
      ownerId
    };
    Object.assign(doc, {
      ownerType: data.ownerType,
      ownerId,
      type: data.type,
      fileName: upload.fileName,
      fileData: upload.fileData,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      expiryDate: data.expiryDate,
      notes: data.notes.trim()
    });
    if (!existing) db.documents.unshift(doc);
    if (data.ownerType === "vehicle") { ui.vehicleId = ownerId; ui.view = "fleet"; ui.fleetMode = "profile"; ui.vehicleTab = "files"; }
    if (data.ownerType === "customer") { ui.customerId = ownerId; ui.view = "customers"; ui.customerMode = "profile"; ui.customerTab = "files"; }
    if (data.ownerType === "rental") { ui.rentalId = ownerId; ui.view = "rentals"; ui.rentalMode = "profile"; }
    addActivity("document", `${documentTypeLabel(doc.type)} ${existing ? "updated" : "saved"} for ${entityName(doc.ownerType, doc.ownerId)}.`, doc.ownerType, ownerId, { vehicleId: doc.ownerType === "vehicle" ? ownerId : rentalById(ownerId)?.vehicleId, customerId: doc.ownerType === "customer" ? ownerId : rentalById(ownerId)?.customerId, rentalId: doc.ownerType === "rental" ? ownerId : "" });
    commit(existing ? "Document updated." : "Document saved.");
  }

  function handleAction(button) {
    const action = button.dataset.action;
    if (action === "directory-filter") {
      if (button.dataset.type === "customer") ui.customerArchive = button.dataset.filter;
      else ui.fleetArchive = button.dataset.filter;
      render(); return;
    }
    if (action === "manage-record") {
      if (auth?.role !== "staff") return;
      ui.modal = "manage-record"; ui.prefill = { recordType: button.dataset.type, recordId: button.dataset.id }; ui.actionMenu = ""; render(); return;
    }
    if (action === "cancel-assignment") {
      if (auth?.role !== "staff" || !rentalById(button.dataset.id) || rentalById(button.dataset.id).status === "closed") return;
      ui.modal = "cancel-assignment"; ui.prefill = { rentalId: button.dataset.id }; ui.actionMenu = ""; render(); return;
    }
    if (action === "customer-emails") {
      if (auth?.role !== "staff") return;
      const rentalId = button.dataset.id;
      ui.modal = "emails"; ui.prefill = { rentalId }; ui.emailState = null; render();
      fetch('/api/email-notifications?rentalId=' + encodeURIComponent(rentalId), { headers: apiHeaders() })
        .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Email history is unavailable.'); return payload; })
        .then(payload => { if (ui.modal === "emails" && ui.prefill.rentalId === rentalId) { ui.emailState = payload; render(); } })
        .catch(error => { if (ui.modal === "emails" && ui.prefill.rentalId === rentalId) { ui.emailState = { error: error.message }; render(); } });
      return;
    }
    if (action === "edit-contract") {
      if (auth?.role !== "staff" || !rentalById(button.dataset.id)) return;
      ui.modal = "contract"; ui.prefill = { rentalId: button.dataset.id }; ui.actionMenu = ""; ui.addMenu = false;
      render(); return;
    }
    if (action === "change-vehicle") {
      if (auth?.role !== "staff" || rentalById(button.dataset.id)?.status !== "active") return;
      ui.modal = "change-vehicle"; ui.prefill = { rentalId: button.dataset.id }; ui.actionMenu = ""; ui.addMenu = false;
      render();
      return;
    }
    if (action === "toggle-add") {
      ui.addMenu = !ui.addMenu;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "logout") {
      logout();
      return;
    }
    if (action === "open-password") {
      ui.modal = "password";
      ui.addMenu = false;
      ui.actionMenu = "";
      ui.documentId = "";
      ui.prefill = {};
      render();
      return;
    }
    if (action === "reset-customer-password") {
      resetCustomerPassword(button.dataset.customerId);
      return;
    }
    if (action === "refresh-db") {
      ui.addMenu = false;
      ui.actionMenu = "";
      hydrateFromServer();
      return;
    }
    if (action === "toggle-context") {
      ui.actionMenu = ui.actionMenu === button.dataset.menu ? "" : button.dataset.menu;
      ui.addMenu = false;
      render();
      return;
    }
    if (action === "open-add") {
      ui.modal = button.dataset.type;
      ui.addMenu = false;
      ui.actionMenu = "";
      ui.documentId = "";
      ui.prefill = {
        vehicleId: button.dataset.vehicleId || "",
        customerId: button.dataset.customerId || "",
        rentalId: button.dataset.rentalId || "",
        maintenanceId: button.dataset.maintenanceId || "",
        paymentKind: button.dataset.paymentKind || "",
        ownerType: button.dataset.ownerType || "",
        ownerId: button.dataset.ownerId || "",
        documentType: button.dataset.documentType || ""
      };
      render();
      return;
    }
    if (action === "close-modal") {
      ui.modal = null;
      ui.prefill = {};
      ui.documentId = "";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "dismiss-toast") {
      ui.toast = "";
      render();
      return;
    }
    if (action === "edit-customer") {
      if (auth?.role !== "staff" || !customerById(button.dataset.id)) return;
      ui.modal = "customer";
      ui.prefill = { editCustomerId: button.dataset.id };
      ui.addMenu = false;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "edit-vehicle") {
      if (auth?.role !== "staff" || !vehicleById(button.dataset.id)) return;
      ui.modal = "vehicle";
      ui.prefill = { editVehicleId: button.dataset.id };
      ui.addMenu = false;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "select-vehicle") {
      ui.vehicleId = button.dataset.id;
      ui.view = "fleet";
      ui.fleetMode = "profile";
      ui.vehicleTab = "";
      ui.query = "";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "select-customer") {
      ui.customerId = button.dataset.id;
      ui.view = "customers";
      ui.customerMode = "profile";
      ui.query = "";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "select-rental") {
      const rental = rentalById(button.dataset.id);
      if (rental) {
        ui.rentalId = rental.id;
        ui.vehicleId = rental.vehicleId;
        ui.customerId = rental.customerId;
        ui.view = "rentals";
        ui.rentalMode = "profile";
        ui.query = "";
        ui.actionMenu = "";
      }
      render();
      return;
    }
    if (action === "back-to-list") {
      if (button.dataset.list === "fleet") ui.fleetMode = "list";
      if (button.dataset.list === "customers") ui.customerMode = "list";
      if (button.dataset.list === "rentals") ui.rentalMode = "list";
      ui.query = "";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "vehicle-tab") {
      ui.vehicleTab = button.dataset.tab;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "customer-tab") {
      ui.customerTab = button.dataset.tab;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "finance-filter") {
      ui.financeFilter = button.dataset.filter;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "document-filter") {
      ui.documentFilter = button.dataset.documentFilter || "all";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "open-document") {
      const doc = db.documents.find((item) => item.id === button.dataset.id);
      if (!doc) return;
      ui.documentId = doc.id;
      ui.modal = "documentPreview";
      ui.addMenu = false;
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "attach-document") {
      const doc = db.documents.find((item) => item.id === button.dataset.id);
      if (!doc) return;
      ui.documentId = doc.id;
      ui.modal = "document";
      ui.addMenu = false;
      ui.actionMenu = "";
      ui.prefill = {
        ownerType: doc.ownerType,
        ownerId: doc.ownerId,
        documentType: doc.type,
        expiryDate: doc.expiryDate || "",
        notes: doc.notes || ""
      };
      render();
      return;
    }
    if (action === "remove-document") {
      const index = db.documents.findIndex((doc) => doc.id === button.dataset.id);
      if (index >= 0 && confirm("Remove this document record?")) {
        const [doc] = db.documents.splice(index, 1);
        addActivity("document", `${documentTypeLabel(doc.type)} removed from ${entityName(doc.ownerType, doc.ownerId)}.`, doc.ownerType, doc.ownerId, { vehicleId: doc.ownerType === "vehicle" ? doc.ownerId : rentalById(doc.ownerId)?.vehicleId, customerId: doc.ownerType === "customer" ? doc.ownerId : rentalById(doc.ownerId)?.customerId, rentalId: doc.ownerType === "rental" ? doc.ownerId : "" });
        commit("Document removed.");
      }
      return;
    }
    if (action === "open-alert") {
      ui.view = button.dataset.viewTarget || "alerts";
      if (button.dataset.vehicleId) { ui.vehicleId = button.dataset.vehicleId; ui.fleetMode = "profile"; }
      if (button.dataset.customerId) { ui.customerId = button.dataset.customerId; ui.customerMode = "profile"; }
      if (button.dataset.rentalId) { ui.rentalId = button.dataset.rentalId; ui.rentalMode = "profile"; }
      ui.query = "";
      ui.actionMenu = "";
      render();
      return;
    }
    if (action === "close-rental") {
      const rental = rentalById(button.dataset.id);
      if (auth?.role !== "staff" || !rental || rental.status === "closed") return;
      ui.modal = "return"; ui.prefill = { rentalId: rental.id }; ui.actionMenu = ""; render();
      return;
    }
    if (action === "complete-maintenance") {
      const item = maintenanceById(button.dataset.id);
      if (item) {
        ui.modal = "payment";
        ui.addMenu = false;
        ui.actionMenu = "";
        ui.prefill = {
          paymentKind: "maintenance",
          maintenanceId: item.id,
          vehicleId: item.vehicleId,
          rentalId: "",
          customerId: ""
        };
        render();
      }
      return;
    }
    if (action === "reset-demo") {
      if (confirm("Reset this new app to its demo records?")) {
        db = seedData();
        ui = Object.assign(ui, {
          view: "dashboard",
          query: "",
          addMenu: false,
          modal: null,
          prefill: {},
          documentId: "",
          actionMenu: "",
          vehicleId: db.vehicles[0]?.id || "",
          customerId: db.customers[0]?.id || "",
          rentalId: db.rentals[0]?.id || "",
          fleetMode: "list",
          customerMode: "list",
          rentalMode: "list",
          vehicleTab: "",
          customerTab: "info",
          documentFilter: "all",
          financeFilter: "all"
        });
        commit("Demo data reset.");
      }
    }
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton && !viewButton.dataset.action) {
      ui.view = viewButton.dataset.view;
      if (ui.view === "fleet") {
        ui.fleetMode = viewButton.dataset.tab ? "profile" : "list";
        if (viewButton.dataset.tab) ui.vehicleTab = viewButton.dataset.tab;
      }
      if (ui.view === "customers") {
        ui.customerMode = viewButton.dataset.tab ? "profile" : "list";
        if (viewButton.dataset.tab) ui.customerTab = viewButton.dataset.tab;
      }
      if (ui.view === "rentals") ui.rentalMode = "list";
      if (ui.view === "documents") ui.documentFilter = viewButton.dataset.documentFilter || "all";
      ui.query = "";
      ui.addMenu = false;
      ui.actionMenu = "";
      render();
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) handleAction(actionButton);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    if (form.dataset.form === "manage-record") form.dataset.operation = event.submitter?.dataset.recordOperation || "";
    if (form.dataset.saving) return;
    form.dataset.saving = "true";
    const submitButtons = [...form.querySelectorAll("button:not([type]), button[type=submit]")];
    submitButtons.forEach(button => { button.disabled = true; });
    try {
      await saveForm(form);
    } catch (error) {
      alert(error.message || "This record could not be saved.");
    } finally { delete form.dataset.saving; submitButtons.forEach(button => { button.disabled = false; }); }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches('[data-form="contract"] select[name="vehicleId"]')) {
      const vehicle = vehicleById(event.target.value), form = event.target.closest("form");
      if (vehicle) for (const name of ["unit", "make", "model", "plate", "vin", "mileage"]) form.elements[name].value = vehicle[name] ?? "";
      return;
    }
    if (event.target.matches('[data-form="rental"] select[name="customerId"]')) {
      const form = event.target.closest("form");
      const customer = customerById(event.target.value);
      const values = { driverName: customer?.name, driverPhone: customer?.phone, customerEmail: customer?.email, customerAddress: customer?.address, licenseNumber: customer?.license };
      for (const [name, value] of Object.entries(values)) form.elements[name].value = value || "";
      return;
    }
    if (event.target.matches("[data-file-name]")) { const box = event.target.closest(".file-capture"); const file = event.target.files[0]; if (file) { box.selectedFile = file; box.querySelector(".file-status").textContent = "Selected: " + file.name + ". Save to attach."; } return; }
    if (event.target.matches("[data-finance-month]")) { ui.financeMonth = event.target.value; render(); return; }
    if (event.target.matches('select[name="ownerType"]')) {
      const picker = event.target.closest("form")?.querySelector(".owner-picker");
      if (picker) picker.dataset.ownerTypeGroup = event.target.value;
      return;
    }
    if (event.target.matches('select[name="paymentKind"]')) {
      const form = event.target.closest("form");
      if (form) form.dataset.paymentKind = event.target.value;
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[name=returnDate]")) { const form = event.target.closest("[data-form=return]"); const rental = form && rentalById(form.elements.rentalId.value); if (rental) form.querySelector(".return-settlement").innerHTML = RentalMath.date(event.target.value) && event.target.value >= rental.startDate && event.target.value <= todayKey() ? returnPreview(rental, event.target.value) : "Choose a valid return date."; return; }
    if (!event.target.matches("[data-search]")) return;
    ui.query = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const next = document.querySelector("[data-search]");
    if (next) {
      next.focus();
      next.setSelectionRange(cursor, cursor);
    }
  });

  render();
  if (auth) hydrateFromServer();
})();

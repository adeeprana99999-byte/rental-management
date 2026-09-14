# Rental Management

Node.js and MongoDB rental management app for vehicles, customers, rentals, documents, payments, expenses, inspections, and service records.

Includes imported MongoDB record ID mapping, vehicle and customer editing, and regression tests covering opening records and preserving linked records during edits.

## Run locally

1. Install a current Node.js LTS release.
2. Run `npm ci`.
3. Copy `server.local.example.json` to `server.local.json` and enter your own MongoDB connection and staff account details. The local configuration file is ignored by Git.
4. Run `npm start`.

The default port is 4331, with 4332 as a fallback. To use port 4332 explicitly in PowerShell:

```powershell
$env:PORT = '4332'
npm start
```

The server also accepts `MONGODB_URI`, `MONGODB_DB`, `STAFF_NAME`, `STAFF_MOBILE`, and `STAFF_PASSWORD` environment variables. Do not commit real credentials or database exports.

## Check changes

```sh
npm run check
node --test tests/record-opening.test.js
```

Tests use isolated fixtures; they do not connect to or modify the live database.

## Mobile use

The manifest and service worker support installation from a browser when served over HTTPS. See `MOBILE_RELEASE_CHECKLIST.md` for deployment and mobile packaging notes. Publishing this repository does not deploy the running app or copy its MongoDB database.

# Mobile Release Checklist

## Current Status

The app is now prepared as an installable mobile web app. When it is hosted on HTTPS, Android and iPhone users can open it in the browser and install it to the home screen.

Included:

- Mobile app manifest with app name, theme color, shortcuts, and install icons.
- Service worker for the app shell, while keeping live database requests online.
- Apple touch icon and Android icon assets.
- Camera/photo upload support for driver license, insurance, agreement, inspection photos, and customer vehicle updates.
- Role based login for staff and customers.
- Customer portal that hides financial records and shows only assigned vehicle/customer/rental information.
- Staff-only temporary customer password reset from the customer profile.
- Password change flow, with temporary-password users prompted to change it after login.

## Before Real Customers

Complete these before sending the app to customers:

- Host the Node app on a real HTTPS domain.
- Set `NODE_ENV=production`.
- Configure `MONGODB_URI` and `MONGODB_DB` on the server, not in browser code.
- Rotate the MongoDB password before launch because the credential was shared during setup.
- Create a real staff account with a strong password in `server.local.json` or server environment config.
- Restart the server after deployment so the new password route, manifest headers, and service worker are active.
- For each customer, use the customer profile action to set a temporary password and ask the customer to change it after first login.
- Test staff login, customer login, rental creation, customer auto-creation, document upload, payment, service, inspection, and customer mileage/fuel/photo upload on real iPhone and Android phones.
- Add a privacy policy and terms page before any public App Store or Play Store submission.
- Enable database backups in MongoDB Atlas.

## Android And iPhone Options

Fastest customer launch:

- Deploy the app to HTTPS.
- Customers use the mobile browser and install it to their phone home screen.

Store launch:

- Wrap the hosted app with Capacitor or a Trusted Web Activity.
- Use `capacitor.config.example.json` as the starting config once the HTTPS domain is ready.
- Android requires a Google Play Console account, app signing, and an Android build environment or CI.
- iPhone requires an Apple Developer account, app signing, and a Mac/Xcode build environment.

Recommended order:

1. Run a private mobile web pilot with a few customers.
2. Fix any rental desk or upload issues found on real phones.
3. Package the same hosted app for Google Play and Apple App Store.

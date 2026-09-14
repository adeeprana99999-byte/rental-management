# Rental return and mobile upload update

Built on the existing rental-management app, preserving imported-record identity/editing fixes, assets, authentication and customer data scoping.

- Rental profiles now have a visible **Return vehicle** action with actual return date, mileage and final settlement preview. The return day is included. Confirming closes the rental; the existing availability rules keep the car in maintenance if service remains open.
- New rentals use calendar-month billing. Returned rentals are prorated by calendar days through the actual return date. Historical unreturned contracts retain their existing calculation until returned.
- Rent and contract deposit are displayed separately. The existing deposit obligation remains part of the contract balance. Deposit refunds are not automatically recorded. Maintenance/business expenses never change customer payments or contract dues.
- Unpaid returned rentals remain collectible. Customer API responses include only their own calculated settlement, while internal payments, expenses and maintenance collections remain hidden.
- Staff Finance has a month selector for income, internal maintenance/expenses and net cash result.
- File uploads have separate library/file and camera controls, prevent duplicate saves while reading, and resize larger photos when supported. HEIC conversion requires browser decoding support; unsupported formats show an error.
- Dynamic viewport heights, larger mobile controls, safe-area spacing and landscape overflow fixes preserve the existing responsive layout. The service-worker cache version is bumped for the new shared calculation script.

Validation: `npm run check`, `npm test` (including existing imported-record tests), plus isolated WebKit and Chromium return/monthly-finance/PDF upload flows at 320, 390, 430, 844 and 1440 pixels. Physical camera capture and deployment infrastructure were not exercised.

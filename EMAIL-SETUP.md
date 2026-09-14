# Gmail rental notifications

Sender: **NRICARRENTALS@gmail.com**. Sending is disabled by default.

## Enable on the deployed server

1. Use Node.js 20 or newer and run `npm install` (includes Nodemailer 10.0.8).
2. Turn on Google 2-Step Verification and create an app password for the rental app: https://support.google.com/accounts/answer/185833
3. Set these private server environment variables. Do not commit the password or put it in browser settings:

   ```text
   GMAIL_USER=NRICARRENTALS@gmail.com
   GMAIL_APP_PASSWORD=<Google app password>
   EMAIL_TIMEZONE=America/New_York
   EMAIL_ENABLED=true
   ```

4. Restart the server. It must stay running and have MongoDB and Gmail SMTP connectivity. Serverless hosts that suspend the process need a separately scheduled worker; the built-in interval is for an always-running Node server.
5. Check each customer's email. Open a rental → **Customer emails** to review upcoming text and submission history. Verify a controlled test recipient before relying on automatic delivery.

## Behavior

- One reminder per rental installment, checked every five minutes from three days before its due date through the due date. Earlier arrears and the deposit are included in the amount due by that date. Fully prepaid installments are skipped.
- New positive rental payments recorded in the app request a receipt. Old/imported payments without a receipt request are excluded. Receipts predating the first successful email activation are excluded to avoid mailing historical records.
- Maintenance payments never produce customer receipts. Customer billing uses the shared monthly schedule; expenses are excluded.
- Messages are plain text and contain only billing details, not uploaded documents or business costs.
- A separate MongoDB `emailNotifications` collection keeps history across app data saves. Unique message keys prevent duplicate submission across restarts and multiple instances.
- `accepted` means Gmail accepted the message, not that it reached the inbox. `failed`, `unknown`, or a stuck `submitting` status requires checking Gmail before manually resending. There is no automatic retry after an uncertain submission, avoiding duplicates.
- The local sample preview never sends email and does not simulate real delivery history.
- Set `EMAIL_ENABLED=false` and restart to stop sending. A customer's `emailNotifications: "off"` also excludes their messages.

Gmail setup: https://nodemailer.com/guides/using-gmail

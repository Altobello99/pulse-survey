# PulseSurvey

Employee pulse survey app for Clutch.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```text
admin                         admin123
eng.manager@pulsesurvey.com manager123
alice@pulsesurvey.com      employee123
```

## Google Sign-In

Google sign-in is enabled automatically when these environment variables are set:

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_HOSTED_DOMAIN="clutch.ca"
BAMBOOHR_COMPANY_DOMAIN="clutchtechnologiesinc"
BAMBOOHR_API_KEY="..."
ADMIN_EMAILS="michael-anthony.altobello@clutch.ca"
ADMIN_LOGIN_IDS="admin,hr-admin"
ADMIN_BOOTSTRAP_PASSWORD="..."
ADMIN_PORTAL_ACCOUNTS="admin:admin123,hr-admin:change-this-password"
CRON_SECRET="..."
```

`GOOGLE_HOSTED_DOMAIN` is optional, but recommended if access should be limited to one Google Workspace domain. Google sign-in is used only to verify employee access and prevent duplicate survey submissions. Survey answers are stored separately from the login record and do not include name, email, Google ID, or user ID.

## BambooHR Sync

Active employee access is synced from BambooHR every day through Vercel Cron:

```bash
npm run admin:bootstrap
```

The sync route is `/api/integrations/bamboohr/sync`. Vercel calls it daily from `vercel.json`; admins can also trigger it with a POST after signing in.

The admin portal login uses generic user IDs and passwords. Add more IDs with `ADMIN_LOGIN_IDS`, or use `ADMIN_PORTAL_ACCOUNTS` to give each admin ID its own password. `ADMIN_EMAILS` is only the internal allowlist for Google-based admin permissions and is not shown as the admin login ID.

## Clutch Question Bank

The active Clutch survey can be created or refreshed with:

```bash
npm run survey:clutch
```

The script creates a 12-question anonymous pulse survey based on the attached Employee Pulse Question Bank PDF.

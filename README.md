# XSite Auto

Shop management for independent repair shops in Canada and the US: customers and vehicles, the shop board,
day and week schedules, repair orders, payments and the cash drawer, online booking, a QuickBooks customer
import, and each shop's public website. Shops sign up for a 14-day free trial on their own.

Many shops run on one copy of the app and one database; row-level security keeps every shop to its own records.

A product of XSite Group Inc. (xsiteauto.com). The marketing site is a separate Vercel project (`xsiteauto`);
this app is `xsiteauto-app`.

## Addresses

| Address | What it serves |
|---|---|
| **app.xsiteauto.com** | The Shop Book for every shop (sign in, signup at `/signup`, setup, billing) |
| **book.xsiteauto.com/{shop}** | A shop's public booking page; `?embed=1` is the version for its own website, `embed.js` puts it there |
| **shop.{their-domain}** | Optional: a shop's own Shop Book address (any `shop.` address, or one listed in `shop_domains`) |
| **{their-domain}** | Optional: a shop's public website hosted here, found through the `shop_domains` table |

## The 14-day free trial

1. A shop owner fills in `app.xsiteauto.com/signup` and enters the 6-digit code we email them.
2. Their shop is created as a trial (14 days, ending 11:59 pm their time) with US or Canadian tax and time zone
   defaults, starter website text and a live booking page. XSite gets an email and an XSite Command webhook.
3. In the app: a setup checklist (rates and tax, booking on their website, QuickBooks import, technicians and
   team, first job), a trial banner, and Keep XSite Auto.
4. The nightly job (`/api/cron/daily`, 6 am Eastern) sends trial emails on days 1, 3, 7 and 11, makes ended
   trials read-only (the booking page then asks customers to call), sends a final notice 26 days later and
   closes the shop at 30 days. XSite gets a daily summary.
5. Keep XSite Auto opens Stripe Checkout for $99 USD a month ($139 CAD for Canadian shops, so it lands in the CAD
   balance and bank account), plus optional Done-for-you setup ($495 USD / $695 CAD one time) if the
   owner ticks it. Active shops can add Done-for-you setup later from Billing. Stripe's webhook keeps the
   shop's status in step with payments.

## First deploy (xs-ite Vercel team)

1. Push this folder to the private GitHub repo `xsitegroup/xsiteauto`.
2. In Vercel, under the **xs-ite** team, **Add New → Project**, import `xsiteauto`, and name the project
   `xsiteauto-app`. Leave the build settings as they are.
3. In the project, **Storage → Create Database → Neon (Postgres)** and connect it. This adds `DATABASE_URL`.
4. **Settings → Environment Variables**: add `AUTH_SECRET` and `CRON_SECRET` (each a long random value), plus
   whatever you're ready for from `.env.example` (Resend, Stripe, Turnstile). Everything else can come later;
   the app runs without email or billing and says so where it matters.
5. **Settings → Domains**: add `app.xsiteauto.com` and `book.xsiteauto.com`, then add the CNAME records Vercel
   shows you at GoDaddy.
6. On your computer, in this folder:
   ```
   npm install
   npx vercel link          (xs-ite team, xsiteauto-app project)
   npx vercel env pull .env.local
   npm run db:setup
   ```
7. Open https://app.xsiteauto.com/signup and make a test shop.

## Connecting the outside services later

- **Email (Resend):** verify `xsiteauto.com` in Resend, then set `RESEND_API_KEY` and `PLATFORM_FROM`.
  Customer emails go out from that address with replies going to the shop.
- **Stripe:** set `STRIPE_SECRET_KEY`, add a webhook to `https://app.xsiteauto.com/api/billing/webhook` for
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` and `customer.subscription.*`,
  and set `STRIPE_WEBHOOK_SECRET`.
- **Text reminders (Twilio):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID`
  (or `TWILIO_FROM`). On the Twilio number (or messaging service), set "A message comes in" to
  `https://app.xsiteauto.com/api/sms/inbound` (HTTP POST). Run `npm run db:setup` once for the `reminders` tables.
  The hourly job `/api/cron/reminders` texts each booked job once, from the shop's chosen hour until 8 pm their time.
  YES confirms, NO flags it on the Today screen and emails the shop, other replies are passed on, STOP opts out.
  `SMS_TEST=on` records reminders without sending anything.
- **Turnstile (spam check on signup):** `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- **XSite Command:** `COMMAND_WEBHOOK_URL` and `COMMAND_WEBHOOK_TOKEN`.

Redeploy after changing environment variables.

## What's in here

| Path | What it is |
|---|---|
| `public/shop.html` | The Shop Book itself (all screens, including setup, Website, Import, Team and Billing) |
| `public/signup.html`, `login.html`, `reset.html` | Signup, sign-in, password reset and team invites |
| `public/embed.js` | One-line booking embed for a shop's own website |
| `app/book/` | Public booking page |
| `app/site/`, `app/preview/` | A shop's public website and its preview |
| `app/api/` | Everything the pages call: auth, data, signup, import, billing, cron, embed check |
| `lib/` | Database, shops, auth, email, Stripe, QuickBooks reader, trial emails |
| `middleware.js` | Picks app, booking page or shop website by address; keeps signed-out visitors out of the app |
| `scripts/schema.sql`, `setup-db.mjs` | Database tables and row-level security |
| `scripts/create-user.mjs`, `check.mjs`, `site-history.mjs` | Admin scripts (set `SHOP=<slug>`) |

## Everyday admin

- **Logins:** in the app, Cash > Team and logins, and Forgot password on the sign-in page. From the command
  line: `npm run user:add -- email "Name" "password" shop-slug`.
- **Backups:** Neon keeps point-in-time history. Each shop also has **Save backup (.json)** under Settings.
- **Who changed what:** the `change_log` table records every save and delete with who did it.

## Running it locally

```
npm install
npx vercel env pull .env.local   (or copy .env.example to .env.local and fill it in)
npm run dev
```
Then open http://app.localhost:3000/signup. Set `SIGNUP_DEV_CODES=on` locally to see the email code on screen.

## Moving Forks Auto Repair in (later)

Forks still runs on its own app and database (`xsitegroup/forks-auto-repair`). To bring it onto XSite Auto:
restore a copy of the Forks database into a scratch Neon branch, run `npm run db:setup` against it with
`LEGACY_SHOP_SLUG=forks-auto-repair` and `LEGACY_SHOP_DOMAINS=...` (this turns the old single-shop layout into
one shop), then copy that shop's rows into this database and point Forks' domains here. `lib/site-defaults.json`
holds Forks' original website text and is used only by that upgrade. The Microsoft 365 sender in `lib/mail.js`
(`MS_*` settings, `MS_MAIL_SHOP`) is there for a shop that wants to send from its own mailbox, as Forks does.

## Notes for the developer

- Records are stored whole as JSON (`id`, `data jsonb`), keyed by `(shop_id, id)`.
- **Every query on a shop table goes through `inShop(shopId, q => ...)`** (lib/db.js). It sets `app.shop_id`
  for one transaction and forced row-level security hides every other shop's rows. `query()` is only for the
  shared tables (shops, shop_domains, users, signups, tokens). Setup, the nightly job and public photos use `asSystem()`.
- No Stripe or spreadsheet packages: Stripe is called over its REST API and `lib/sheet.js` reads .xlsx and .csv.
- `next` is pinned to 15.5.28 with `postcss` and `sharp` overridden to patched versions; `npm audit` is clean.

# AUTOSPEKT Academy

Slovak-language vehicle inspection, Academy and marketplace web app. This repository contains the browser app, Netlify Functions and a Supabase migration for accounts, purchases, listings, checklists, conversations and notifications.

## Current launch status

The application code is ready for provider setup and deployment, but this workspace is not connected to the owner's Supabase, Stripe, vehicle-data provider, mail-sending account, GitHub repository or Netlify site. Until those accounts are connected and the settings below are supplied, the UI intentionally shows **Demo · backend nepripojený** and will not claim that an identity, payment, registry result or listing has been verified or delivered.

The Slovak Ministry of Interior's vehicle-history service limits disclosure when the requester is not the vehicle owner/holder or an authorized person. Use it or another registry only with the relevant legal basis and a provider contract; there is no universal open endpoint wired into this app. See [the Ministry's vehicle history information](https://pes.minv.sk/wps/wcm/connect/en/site/main/Individuals%2B-life-situations/technical-documents/Information%2Bon%2Bhistory%2Bof%2Bthe%2Bvehicle/) and [SENTIA's API service description](https://www.sentia.sk/sk/sluzby/online-databaza-udajov-vozidiel).

## Deploy and connect services

1. Create a Supabase project. In its SQL Editor, run `supabase/migrations/202611140001_initial_marketplace.sql`. This creates user-scoped data with RLS, public active listings, private conversations, message records, checklist records, notification/analytics tables and photo buckets.
2. In Supabase Auth, enable Email/password, set the production Site URL and allow the final Netlify domain as a redirect URL. Configure the desired email confirmation policy.
3. Import this repository into Netlify. Set the variables in `.env.example` under **Site configuration → Environment variables**. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_*`, `VEHICLE_API_*`, `RESEND_API_KEY` and `MAIL_FROM` must be set as appropriate. Keep `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, vehicle API credentials and Resend API key server-side; never put them in the frontend or Git.
4. In Stripe, create one-time prices for products `buy`, `sell` and `complete`; copy their Price IDs into `STRIPE_PRICE_BUY`, `STRIPE_PRICE_SELL` and `STRIPE_PRICE_FULL`. Create a webhook endpoint at `https://YOUR-SITE/api/stripe-webhook`, subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`, and set its signing secret in `STRIPE_WEBHOOK_SECRET`. Start in Stripe test mode and switch to live mode only after a real checkout and webhook reconciliation.
5. Choose a licensed vehicle-data provider and obtain permission/credentials for the relevant VIN/EČV fields and purposes. `VEHICLE_API_URL` must be the provider's lookup URL. The server sends a JSON POST body `{ "vin": "…", "plate": "…", "country": "SK" }`, with the API key in `VEHICLE_API_AUTH_HEADER` (default `Authorization`) and optional `VEHICLE_API_AUTH_SCHEME` (default none). If the provider uses a different request/response contract, adapt `netlify/functions/vehicle-lookup.mjs` to its documented API before enabling it.
6. For email notifications, verify the sender domain with Resend and set `RESEND_API_KEY` and `MAIL_FROM`. In-app messages are stored in Supabase and streamed with Supabase Realtime; email notification state is saved with each message. Email is reported as not configured until those credentials are supplied.
7. Deploy. Netlify builds `public-config.js` from the public Supabase URL and publishable key, and deploys the API functions. Confirm the deploy URL in Supabase Auth redirect settings and Stripe webhook settings.

## Local preview

Open `index.html` for the visual demo. To exercise Netlify Functions locally, install Netlify CLI and use `netlify dev` after setting the same environment variables in a local, untracked `.env` file. Never commit that file. The static preview does not run serverless functions.

## Integration behavior

- Auth: Supabase email/password registration, sign-in, reset and session persistence.
- Vehicle lookup: authenticated server-side request to the configured provider; no browser-exposed registry secret. Missing provider configuration returns a clear disabled response.
- Payments: authenticated Stripe Checkout sessions; Academy entitlement is created only from a verified Stripe webhook after successful payment.
- Marketplace: public active listings, authenticated publication, image upload, owner removal and server-computed Academy priority.
- Messages: participant-only conversation reads, server-side message writes, Supabase Realtime updates and optional Resend email notification.
- Data: account profiles, purchases, checklists, usage events and message data in Postgres. Listing photos are public marketplace assets; checklist photos use private Supabase Storage paths and signed URLs.

This software does not itself prove vehicle identity, roadworthiness, legal ownership or a complete vehicle history. Register data must show the source, retrieval timestamp and limitations, and must not replace physical inspection or official records.

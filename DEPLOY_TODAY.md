# HANKii waitlist launch checklist

This setup stores waitlist emails in your Supabase database. The browser never
gets a database secret or permission to read signups. A Supabase Edge Function
validates Cloudflare Turnstile before writing to the private table.

## Before sharing the page

Review the product wording in `index.html`: it currently describes a coding
interview revision product. Make sure that matches what you are validating.

## 1. Get a public website URL

Use any static host. This repository now includes `netlify.toml`, so when you
connect the GitHub repository to Netlify, it publishes only these three public
files:

- `index.html`
- `config.js`
- `favicon.png`

The `supabase/` directory remains in GitHub as deployable backend source, but
it is not included in the public Netlify website output. Local `.env` files are
excluded by `.gitignore` and must never be committed.

At this stage signup displays a configuration message; do not share the URL
until the remaining steps are complete. Your deployed origin is:

```text
https://resonant-melomakarona-2a1ebb.netlify.app
```

## 2. Create bot protection

In Cloudflare Turnstile, create a widget for your production hostname:

```text
resonant-melomakarona-2a1ebb.netlify.app
```

You may also add `localhost` while testing locally.

Save these values:

- Site key: public; it goes in `config.js`.
- Secret key: private; it goes only into Supabase Edge Function secrets.

## 3. Create the database

Your Supabase project URL is:

```text
https://zoeyimeoikpzhveqncqx.supabase.co
```

Your project reference is:

```text
zoeyimeoikpzhveqncqx
```

Install the Supabase CLI on macOS:

```bash
brew install supabase/tap/supabase
```

From this folder, authenticate, link the project, and apply the migration:

```bash
cd /Users/nav/Rutgers/hankii-landing
supabase login
supabase link --project-ref zoeyimeoikpzhveqncqx
supabase db push
```

This creates `public.waitlist_signups` with Row Level Security enabled and no
browser-facing read or insert permissions.

## 4. Configure and deploy the signup function

Create a local secret file named `supabase/.env.production.local`. Do not
commit or upload it:

```dotenv
TURNSTILE_SECRET_KEY=YOUR_PRIVATE_TURNSTILE_SECRET_KEY
ALLOWED_ORIGINS=https://resonant-melomakarona-2a1ebb.netlify.app
ALLOWED_TURNSTILE_HOSTNAMES=resonant-melomakarona-2a1ebb.netlify.app
```

Push these private settings and deploy the Edge Function:

```bash
supabase secrets set --env-file supabase/.env.production.local
supabase functions deploy join-waitlist
```

The function uses Supabase's built-in server-only secret key bundle to insert
emails. Never place a Supabase secret key in `config.js` or `index.html`.

## 5. Connect the public page

Update the two public values in `config.js`:

```js
window.HANKII_CONFIG = Object.freeze({
  signupEndpoint: 'https://zoeyimeoikpzhveqncqx.supabase.co/functions/v1/join-waitlist',
  turnstileSiteKey: '0x4AAAAAADVnpJ6eCg0zz3lc'
});
```

Upload the updated `config.js` and `index.html` to your static host again.

## 6. Test before sharing

Open your live site, submit your own email address, and confirm the success
message appears. Then open Supabase Dashboard -> Table Editor ->
`waitlist_signups` and confirm the row exists.

Submit the same email again. The page should still succeed but the table
should contain only one copy.

## What is stored

The database stores:

- normalized email address
- signup location on the page (`hero`, `waitlist`, or `final`)
- consent confirmation
- signup timestamp

It intentionally does not store visitor IP addresses or Turnstile tokens.

## Maintenance

View or export interested users from the Supabase Table Editor. If signups
receive serious abuse despite Turnstile, the next step is API rate limiting.

Official references:

- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/getting-started/api-keys
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

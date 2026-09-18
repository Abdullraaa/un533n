# UN533N

E-commerce site for the UN533N clothing brand: an Express API and a React 19 SPA served from a single origin, backed by MySQL/MariaDB.

## Requirements

- Node 20+ (developed on 24)
- pnpm (pinned via corepack — run `corepack enable`)
- MySQL 8 or MariaDB 10.5+

## Setup

```bash
corepack enable
pnpm install

cp .env.example .env        # then fill it in

mysql -u <user> -p <db> < un533n_v2.sql   # schema (use v2, not un533n.sql)
mysql -u <user> -p <db> < seed.sql        # optional dev catalogue — see warning

pnpm start                  # builds CSS + bundle, serves on http://localhost:3002
```

`pnpm start` runs the CSS and webpack builds first, so it always serves current assets. For iterating on the frontend, `pnpm run dev` rebuilds the bundle on its own.

> **`seed.sql` is destructive.** It `DELETE`s all products, variants, carts, orders, order items and wishlists before inserting its own catalogue. Development only — never run it against a database with real orders.

### Upgrading an existing database

`un533n_v2.sql` is for fresh installs only. A database provisioned before a
column was introduced needs the matching migration from `migrations/`, applied
in filename order:

```bash
for m in migrations/*.sql; do mysql -u <user> -p <db> < "$m"; done
```

Each is a plain `ALTER TABLE` and will error harmlessly if already applied.
`001` adds `users.is_admin` (without it every admin route throws); `002` adds
`orders.payment_intent_id` (without it checkout fails *after* the card is
charged).

> **Use `un533n_v2.sql`.** The older `un533n.sql` is kept for reference only and lacks the `is_admin` column, which silently breaks every admin route.

### Granting admin

Product writes (`POST`/`PUT`/`DELETE /api/products`) and order-status changes require `users.is_admin`. Signup never sets it, and `seed.sql` deliberately creates no admin. Grant it by hand:

```sql
UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
```

### If `bcrypt` fails to load

pnpm does not run dependency build scripts unless allowlisted. `pnpm-workspace.yaml` already sets `allowBuilds: bcrypt: true`; if you see `Cannot find module .../bcrypt_lib.node`, re-run `pnpm install` and approve the build.

## Project structure

```
public/
  index.html        SPA shell (#root + bundle); asset paths must be absolute
  blog.html         the one static page — carries its own copy of the nav
  imgs/             29 photos; product images are referenced by DB image_url
                    (output.css and dist/ are generated, not committed)
src/
  server.js         Express entry: API routes, /api 404 guard, SPA catch-all
  database.js       mysql2 pool (env-configured, decimalNumbers: true)
  pricing.js        SHIPPING_COST, CURRENCY, cart totals — the money lives here
  routes/           users, products, cart, wishlist, orders, payment
  middleware/       JWT auth: required / optional / admin
  index.js          webpack entry — mounts App into #root
  App.js            SPA routes, Nav + Footer
  pages/            Home, Shop, ProductDetail, Cart, Checkout, Login,
                    Signup, Profile, OrderConfirmation, About, Contact, NotFound
  components/       Nav, Footer, ProductCard, PaymentForm, StoreProvider
  store/            Zustand store (cart, auth, orders, wishlist, products)
  input.css         Tailwind v4 entry — the theme lives here, not in a JS config
un533n_v2.sql       current schema
un533n.sql          v1 schema, historical
seed.sql            development catalogue (destructive — see above)
.env.example        documented environment variables
pnpm-workspace.yaml native build-script allowlist (bcrypt)
webpack.config.js   bundling + DefinePlugin for the Stripe publishable key
```

## Payments

Stripe runs in test mode. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`; the publishable key is compiled into the bundle, so rebuild after changing it. With no key set the app still runs and the Pay button stays disabled.

**The charge amount is computed server-side.** `POST /api/payment/create-payment-intent` ignores the request body entirely and prices the intent from the caller's cart in the database, so a client cannot influence what it is charged. Checkout is also login-gated: guests are redirected to `/login` before the payment step, because the backend has never supported guest orders.

**Every order is tied to a payment.** `POST /api/orders` requires a `payment_intent_id`, verifies with Stripe that it succeeded, belongs to the caller, and matches the order's currency and total, and stores it on the order. The column is `UNIQUE`, so a single payment can never produce two orders.

## License

MIT

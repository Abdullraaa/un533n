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

mysql -u <user> -p <db> < un533n_v2.sql   # schema
mysql -u <user> -p <db> < seed.sql        # optional dev catalogue

pnpm start                  # builds CSS + bundle, serves on http://localhost:3002
```

`pnpm start` runs the CSS and webpack builds first, so it always serves current assets. For iterating on the frontend, `pnpm run dev` rebuilds the bundle on its own.

## Project structure

```
public/           index.html (SPA shell), blog.html (static), imgs/
                  output.css + dist/ are generated, not committed
src/
  server.js       Express entry: API routes, then the SPA catch-all
  database.js     mysql2 pool (env-configured)
  routes/         users, products, cart, wishlist, orders, payment
  middleware/     JWT auth (required / optional)
  App.js          SPA routes, Nav + Footer
  pages/          Home, Shop, ProductDetail, Cart, Checkout, Login,
                  Signup, Profile, OrderConfirmation, About, Contact, NotFound
  components/     Nav, Footer, ProductCard, PaymentForm, StoreProvider
  store/          Zustand store (cart, auth, orders, wishlist, products)
  input.css       Tailwind v4 entry — theme lives here, not in a JS config
un533n_v2.sql     current schema
un533n.sql        v1 schema, historical
seed.sql          development catalogue
```

## Payments

Stripe runs in test mode. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`; the publishable key is compiled into the bundle, so rebuild after changing it. With no key set, the app still runs and the Pay button stays disabled.

## License

MIT

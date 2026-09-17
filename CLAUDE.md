# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start            # Express API + static server on PORT (default 3002)
npm run dev          # webpack --mode development -> public/dist/bundle.js
npm run build        # webpack --mode production
npm run build:css    # Tailwind: src/input.css -> public/output.css
```

There is no test runner, linter, or type checker configured. Formatting follows `.prettierrc` (2 spaces, no tabs).

`public/output.css` is **not** in the repo — `npm run build:css` must be run before the static pages render correctly, since every `public/*.html` links to it.

## Architecture

The repo is a MySQL-backed Express API (`src/server.js`) plus **two parallel, currently disconnected frontends**:

1. **Static HTML site** (`public/*.html`) — Tailwind-classed pages (`index`, `shop`, `cart`, `checkout`, `product-detail`, `payment`, `about`, `contact`, `blog`). This is what actually gets served: `express.static('public')` plus `GET /` → `public/index.html`. These pages are hand-written and do not load `dist/bundle.js`.
2. **React SPA** (`src/app.js`, `src/pages/`, `src/components/`) — react-router-dom v7 routes mirroring the same pages, bundled by webpack to `public/dist/bundle.js`. No HTML file mounts `#root` or loads the bundle, so the SPA is built but unreachable. Wiring a page to the SPA means adding the `<div id="root">` + `<script src="dist/bundle.js">` to an HTML entry.

### API layer (`src/routes/`, mounted under `/api` in `src/server.js`)

| Route | Auth |
|---|---|
| `/api/users` — signup, login, profile, addresses CRUD | `auth.required` except signup/login |
| `/api/products` — list (`?category=`), get, create, update, delete | **none, including writes** |
| `/api/cart` — get/add/update/remove, `POST /merge` | `auth.optional` (+ `/merge` required) |
| `/api/wishlist`, `/api/orders` | `auth.required` |
| `/api/payment` — `create-payment-intent`, `confirm-payment-intent` | `auth.required` |

`src/middleware/auth.js` exposes `required` and `optional`. Both verify a `Bearer` JWT (`JWT_SECRET`) and re-load the user row into `req.user`; `optional` silently falls through to guest on a missing or bad token.

**Dual cart model** is the key server-side pattern (`src/routes/cart.js`): the `getUserCart` middleware routes logged-in users to the `carts`/`cart_items` tables and guests to `req.session.cart` (express-session, in-memory store). `POST /api/cart/merge` folds the session cart into the DB cart at login, and the client store calls it from `login()`.

### Client state

`src/store/index.js` is a single Zustand store (persisted to `localStorage` under `un533n-store`) holding cart, user, token, addresses, orders, wishlist and products, with axios actions that attach `Authorization: Bearer ${token}` when a token exists. `src/components/StoreProvider.js` re-exposes that store through React context; pages consume `useStoreContext()`, **not** `useStore` directly.

`src/utils/api.js` is an older parallel `fetch` client keyed on `productId` rather than `variant_id`, used only by `src/pages/Home.js`. Prefer the Zustand store for new work.

### Database

`src/database.js` exports a promise-wrapped `mysql2` pool. Connection details are **hardcoded placeholders** (`your_database_host`, etc.) and not read from env — this must be pointed at a real database (ideally via `dotenv`) before anything involving the DB runs.

Two schema files exist. **`un533n_v2.sql` is the live schema** — it introduces `product_variants` (SKU/size/color/price/stock), server-side `carts`/`cart_items`, `addresses`, and order `status`. All route code joins on `variant_id`, so `un533n.sql` (v1, price on `products`, `product_id` in order items) is historical only.

## Environment

`.env` is loaded by `dotenv` in `src/server.js` but not committed. Expected: `PORT`, `NODE_ENV`, `SESSION_SECRET`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`. Several fall back to insecure literal defaults in code (`'your_super_secret_jwt_key_that_should_be_in_env'` in both `middleware/auth.js` and `routes/users.js`) — those fallbacks are development scaffolding, not values to rely on.

Note `STRIPE_PUBLISHABLE_KEY` is read via `process.env` in `src/app.js` (client bundle); webpack has no `DefinePlugin`, so it resolves to the placeholder in the browser today.

## Known broken state

Worth knowing before debugging — these are pre-existing, not regressions:

- **`src/routes/users.js` is two copies of the file concatenated** (`const express` declared twice at top level). It throws `SyntaxError` on `require`, so `npm start` fails outright. The second copy is the newer, complete one.
- **`src/index.js` imports `./App`** but the file is `src/app.js` — case-sensitive on Linux, so the webpack build fails there too.
- `src/components/PaymentForm.js` imports `useStoreContext` from `'../store'`, which only exports the raw `useStore` hook.
- `node_modules/` is committed to git (`.gitignore` was added later but the tree was never untracked), and `package-lock 2.json` is a stray duplicate lockfile.

## Conventions

- CommonJS (`require`) on the server, ES modules (`import`) in `src/` client code; webpack + babel (`preset-env`, `preset-react`) handle the latter.
- Tailwind theme extends three brand colors: `un-black` (#000000), `un-white` (#FFFFFF), `un-gold` (#FFD700). `tailwind.config.js` scans `src/**` and `public/**`. Note `public/styles.css` is a separate legacy stylesheet with its own CSS-variable palette (`--cta: #9A8174`) — not currently linked from the pages.
- Route handlers follow a uniform shape: `try`/`catch` with `res.status(5xx).json({ message, error: error.message })`; all SQL uses parameterized `pool.query(sql, params)`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install         # pnpm is pinned via corepack (packageManager field) — do not use npm
pnpm start           # prestart builds CSS + bundle, then serves on PORT (default 3002)
pnpm run dev         # webpack --mode development -> public/dist/bundle.js
pnpm run build       # webpack --mode production
pnpm run build:css   # Tailwind v4 CLI: src/input.css -> public/output.css
```

There is no test runner, linter, or type checker. Formatting follows `.prettierrc` (2 spaces, no tabs).

`prestart` builds both the stylesheet and the bundle, so `pnpm start` is self-sufficient — this exists specifically to prevent deploying a site with no CSS. `public/output.css` and `public/dist/` are gitignored build output.

Native dependency build scripts are opt-in under pnpm: `pnpm-workspace.yaml` has `allowBuilds: bcrypt: true`. Without it `bcrypt` installs but has no binary and `require('bcrypt')` fails at runtime.

## Architecture

Express API + SPA served from one origin (`src/server.js`, port 3002). Because the API and the app share an origin, the client's relative `/api/...` axios paths need no CORS or proxy.

**Request order in `src/server.js` matters**: `express.json()` → `express.static('public')` → session → `/api/*` routers → a JSON 404 guard for unmatched `/api` paths → the SPA catch-all. The guard is load-bearing: without it the catch-all answers unmatched API paths with `index.html` and a 200, so axios gets HTML instead of a clean 404. The catch-all uses Express 4's `'*'` syntax — Express 5 would need `'/*splat'`.

### Frontend

A single React 19 SPA (`src/index.js` → `src/App.js`). `public/index.html` is just the shell (`#root` + the bundle). **Asset paths in the shell and in page markup must be absolute** (`/output.css`, `/dist/bundle.js`, `/imgs/...`) — the catch-all serves that shell at deep routes like `/product/5`, where relative paths resolve against the route.

`public/blog.html` is the one remaining static page: no SPA route, no backend route. It carries its own copy of the nav markup, pointing at SPA paths.

`src/components/Nav.js` and `Footer.js` wrap `<Routes>` in `App.js`. Nav reads `user`/`cart` from the store, so it reflects auth state and cart count.

### API layer (`src/routes/`, mounted under `/api`)

| Route | Auth |
|---|---|
| `/api/users` — signup, login, profile, addresses CRUD | `auth.required` except signup/login |
| `/api/products` — list (`?category=`), get | none (public reads) |
| `/api/products` — create, update, delete | `auth.admin` |
| `/api/cart` — get/add/update/remove, `POST /merge` | `auth.optional` (+ `/merge` required) |
| `/api/wishlist`, `/api/orders` | `auth.required` |
| `/api/payment` — `create-payment-intent`, `confirm-payment-intent` | `auth.required` |

`src/middleware/auth.js` exposes `required`, `optional`, and `admin`; all verify a Bearer JWT and reload the user row into `req.user`. `admin` is an array (`[required, roleCheck]`) gating endpoints that act on data the caller doesn't own — product writes and `PUT /api/orders/:id/status`. It reads `users.is_admin`, which signup never sets; grant it with a deliberate `UPDATE`.

**Dual cart model** (`src/routes/cart.js`): `getUserCart` routes logged-in users to `carts`/`cart_items` and guests to `req.session.cart`. The session only stores `{variant_id, quantity}` — `GET /` hydrates name/price/image from the DB before returning, so both paths return the same shape. `POST /api/cart/merge` folds the session cart into the DB cart at login.

**Checkout is login-gated.** `POST /api/orders` is `auth.required` and the store's `createOrder` throws without a token, so `Checkout.js` redirects guests to `/login` (with `state.from`) before the payment step rather than letting them pay into nothing.

**Pricing is server-side, in `src/pricing.js`.** `SHIPPING_COST`, `CURRENCY`, and `cartTotalForUser()` live there, and both the Stripe charge (`routes/payment.js`) and the recorded order total (`routes/orders.js`) derive from it, so the two cannot drift.

`POST /api/payment/create-payment-intent` **ignores the request body entirely** — amount and currency come from the caller's cart in the database. Do not reintroduce a client-supplied `amount`: that let a client name its own price for any cart. `src/pages/Checkout.js` still computes a display total; that one is cosmetic.

### Client state

`src/store/index.js` is one Zustand v5 store (persisted to `localStorage` as `un533n-store`) holding cart, user, token, addresses, orders, wishlist, products. `src/components/StoreProvider.js` re-exposes it via context — **pages consume `useStoreContext()`, never `useStore` directly**. Note zustand v5 requires the named `create` import and `createJSONStorage`; the v4 default export and `getStorage` are gone.

Store actions are stable identities, so `useEffect` deps should list the *action*, not the state it writes — depending on `products` while calling `fetchProducts()` causes an infinite refetch.

### Database

`src/database.js` is a promise-wrapped `mysql2` pool, env-configured, with **`decimalNumbers: true`** — without it `DECIMAL(10,2)` comes back as a string and every `price.toFixed(2)` throws.

**`un533n_v2.sql` is the live schema**; `un533n.sql` is the v1 historical one. Everything joins on `variant_id`: price/size/color/stock/`image_url` live on `product_variants`, not `products`.

`seed.sql` loads a dev catalogue (and deliberately creates no admin). Product images are DB values (`product_variants.image_url`) pointing into `public/imgs/` — **static grep cannot see which images are in use**, so never delete from `public/imgs/` based on a code search alone.

`GET /api/products` aggregates variants with `LEFT JOIN` + `JSON_ARRAYAGG`, so a product with no variants yields **one all-null row, not an empty array**. Filter on `v.variant_id != null` before reading `.price` — a plain `length > 0` check passes and then throws. `seed.sql` includes one deliberately variant-less product to keep this path exercised.

## Environment

Copy `.env.example` to `.env` (gitignored): `PORT`, `NODE_ENV`, `SESSION_SECRET`, `JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.

`STRIPE_PUBLISHABLE_KEY` is the only client-side env read. Webpack 5 has no `process` shim, so it is injected by `DefinePlugin` in `webpack.config.js` (which loads dotenv itself) — **the bundle must be rebuilt after changing it**. When it is unset, `App.js` passes `null` to `<Elements>` so the app degrades instead of throwing, and the Pay button stays disabled.

`JWT_SECRET`/`SESSION_SECRET` have insecure literal fallbacks in `middleware/auth.js` and `routes/users.js` — development scaffolding, not values to rely on.

## Conventions

- CommonJS (`require`) on the server, ES modules in client `src/`; babel with `@babel/preset-env` and `preset-react` (`runtime: 'automatic'`, so JSX files need no `React` import).
- Tailwind v4 is CSS-configured — there is **no `tailwind.config.js`**. The theme lives in the `@theme` block in `src/input.css`, and `@source` lines are explicit so auto-detection doesn't scan the built bundle. Brand colors `un-black`/`un-white`/`un-gold`; the React pages additionally use `primary`/`secondary`/`accent` (with `-dark` variants), all defined in that same block.
- Route handlers follow a uniform shape: `try`/`catch` returning `{ message, error: error.message }`; all SQL is parameterized.

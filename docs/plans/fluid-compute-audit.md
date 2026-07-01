# Fluid Compute Audit — 2026-06-23

You're on a **Vercel Hobby** account and hitting the included compute cap (~4 hours). This is an
audit of every surface that runs as a Vercel Function, ranked by how much compute it burns, plus
concrete fixes.

> **⚠️ Correction (2026-07-01) — read this first.** The original finding #1 below was **wrong**. It
> claimed `draftMode()` forced every public page dynamic. The `pnpm build` route table disproves it:
> `/[slug]` pages already prerender (`●`), and **only `/` (the homepage) was dynamic (`ƒ`)**. Reading
> `draft.isEnabled` does **not** force dynamic rendering (confirmed in Next.js source: only
> `.enable()`/`.disable()` do). The *sole* cause of `/` being dynamic was finding **#2** — the
> `getAllCollections` `cache: 'no-cache'` fetch, rendered by the homepage cart block. So the real fix
> is one line of caching, not the two-part draftMode+ISR effort. Sections #1 and #2 are rewritten
> below to match the evidence; the rest of the audit stands.

---

## What "Fluid Compute" actually is

On modern Vercel, **everything server-side runs as a Vercel Function under Fluid Compute** — there
is no separate "edge vs serverless" anymore. That includes:

- **Dynamic page renders** (SSR / on-demand rendering of `page.tsx`)
- **ISR regeneration** (rebuilding a cached page when it goes stale)
- **API routes** (`route.ts` — webhooks, cron, exports)
- **Server Actions** (`'use server'` functions)
- **Image optimization** (`/_next/image`)
- The **Payload admin panel** (the whole `(payload)` route group is a live app)

### How it's billed (the mental model that matters)

Fluid Compute bills on **Active CPU time** — the wall-clock time a function instance is *actively
using the CPU* — plus provisioned memory and invocation count. The Hobby "4 hours" is your included
**Active CPU / function-duration** allotment for the month.

Two things drive the number up:

1. **How many times functions are invoked** (every uncached page view = 1 invocation)
2. **How long each invocation works** (DB query + external API round-trip = hundreds of ms each)

Fluid Compute *reuses* instances across concurrent requests (fewer cold starts), but every
invocation still accrues Active CPU. **A function that never runs costs nothing.** That's the whole
game: the cheapest request is one the CDN serves from cache with zero function execution.

> Analogy: dynamic rendering is like cooking every meal to order. ISR/static is like a buffet you
> refill on a timer — 1000 guests, one cook. Right now your kitchen cooks every plate à la carte.

---

## The findings (ranked by compute impact)

### ✅ #1 — ~~Every public page is dynamically rendered~~ **CORRECTED: draftMode is not the cause**

**Original claim (wrong):** that `draftMode()` in `[slug]/page.tsx` opts every public route out of
static generation, making `/` and `/[slug]` all dynamic.

**Evidence it's wrong** — the `pnpm build` route table:

```
┌ ƒ /                     ← only the homepage was dynamic
├ ● /[slug]               ← CMS pages already prerender
│ ├ /test  /regulamin  /privacy-policy  /faq
```

If `draftMode()` forced the route dynamic, `/[slug]` would be `ƒ`. It's `●` (prerendered). **Reading
`draft.isEnabled` does not force dynamic rendering** — confirmed in Next.js source
(`packages/next/src/server/request/draft-mode.ts`): only `draftMode().enable()` / `.disable()` call
`trackDynamicDraftMode()`. The getter is safe in a statically generated page; at request time the
draft *cookie* bypasses the cache, which is how live preview keeps working.

**Why only `/` was dynamic:** the homepage renders `ShopifyCartServer`, the content pages don't. That
block calls `getAllCollections()` with `cache: 'no-cache'` — and in Next 16 an uncached fetch is a
dynamic data source that flips the route to `ƒ`. So `/` being dynamic is **entirely** finding #2, not
draftMode. No `export const revalidate` on `[slug]/page.tsx` is required.

---

### 🔴 #2 — `getAllCollections()` used `cache: 'no-cache'` — the actual root cause **(fixed)**

`src/lib/shopify/api.ts` — the *only* page-rendering Shopify read missing a cache directive, and the
sole reason `/` was dynamic.

```ts
// BEFORE
cache: 'no-cache',        // ← live Shopify round-trip on every render; also forces `/` dynamic
tags: ['collections'],    // ← useless while no-cache: nothing is ever stored
```

This runs inside `getCachedProductsByCollection`, rendered by the homepage cart block on every visit.
`createCart` legitimately needs `no-store` (it's a mutation), and `getProductByHandle` already used
`force-cache` — only collections were uncached.

**Fix applied** (the documented Next 16 pattern — `force-cache` + `revalidate` + `tags` coexist):

```ts
// AFTER — src/lib/shopify/api.ts
cache: 'force-cache',
revalidate: 3600,         // time-based safety net (see webhook gap below)
tags: ['collections'],    // on-demand invalidation via revalidateTag('collections', 'max')
```

`revalidate` was also plumbed through `shopifyFetch` (`src/lib/shopify/client.ts`) into
`next: { revalidate, tags }`; its default is `undefined` (not `0`) so callers without a revalidate —
e.g. `getProductByHandle` — keep `force-cache`'s indefinite caching instead of being forced dynamic
by `revalidate: 0`.

> **Note on `revalidateTag`:** in this project's Next (16.0.10) the signature is
> `revalidateTag(tag, profile)` and `profile` is **required** — so the webhook's
> `revalidateTag('collections', 'max')` is correct, not a mistake.

**Result — CONFIRMED (2026-07-01 build):** `/` went `ƒ` → **`○` Static + ISR** (`Revalidate 1h`,
`Expire 1y` in the route table; Next dev overlay reports "Route: Static"). The homepage is now
prerendered and served from the CDN, regenerating at most once/hour (or on-demand via the webhook's
`revalidateTag`). Per-visit function execution for `/` is gone. This was the whole win.

> **Note — fetch-level `revalidate` drives ISR by itself.** No `export const revalidate` on the page
> was needed. A route's effective revalidate = the *minimum* of `export const revalidate` (if set)
> and every revalidating `fetch` it renders. The `getAllCollections` fetch's `revalidate: 3600` alone
> made `/` ISR at 1h. `getProductByHandle` (`force-cache`, no revalidate = `Infinity`) doesn't drag
> it — min(3600, ∞) = 3600. You'd only need `export const revalidate` for a route with **no**
> revalidating fetch to carry it (e.g. the `[slug]` text pages, which stay `●` pure-static, not ISR).

> **Aside (not the fix):** `'use server'` was removed from `api.ts`/`client.ts` in favor of
> `import 'server-only'` — correct hygiene (these use secret tokens and must never reach the client
> bundle; `'use server'` never provided that), but it did **not** affect the dynamic/static outcome.

---

### 🟠 #2b — Webhook doesn't invalidate on collection changes **(open gap — VERIFIED)**

`src/app/api/webhooks/products-updated/route.ts:16-21` only revalidates for `products/create`,
`products/update`, `products/delete`, `inventory_levels/update`. Per Shopify docs,
**`collections/update`** fires on *manual add/remove of a product to a collection*, rename, or rule
change, and **`collections/create` / `collections/delete`** on collection CRUD — **none of which this
handler processes** (they fall through to "Topic not handled"). Since `getAllCollections` returns
collections *and* their products, manual collection curation would serve stale data.

**Live subscriptions confirmed via `/api/webhooks/list`** — the store is subscribed to
`orders/create`, `orders/fulfilled`, `products/create`, `products/update`, `products/delete`,
`inventory_levels/update`. **No `collections/*` topic is subscribed** — so the gap is real on both
ends (not handled *and* not subscribed).

Two mitigations: (a) add the three `collections/*` topics to the handler **and** subscribe to them
Shopify-side; (b) the `revalidate: 3600` window above self-heals any missed invalidation within an
hour. (b) is now in place; (a) is the proper event-driven fix.

---

### 🔴 #2c — Every webhook is subscribed **twice** (canonical + redirecting domain) **(VERIFIED)**

`/api/webhooks/list` shows each topic registered to **two** addresses:

- `https://moodbox.pl/api/webhooks/...` — created `2026-01-26 ~19:0x`
- `https://www.moodbox.pl/api/webhooks/...` — created `2026-01-26 ~22:4x` (~3.5h later)

`curl -X POST` proves the split: `moodbox.pl` returns **307** → redirects to `www.moodbox.pl`;
`www.moodbox.pl` returns **401** (live endpoint, rejecting the unsigned test call). **Shopify does not
follow redirects**, so every delivery to the `moodbox.pl` set fails silently. The apex→www redirect
is a Vercel domain-level setting, not in `redirects.js`.

**Interpretation:** the non-www set was registered first, discovered to be non-firing (redirect), and
re-registered against the canonical `www.moodbox.pl` ~3h later — but the dead non-www set was never
deleted. The addresses were only ever entered at runtime (WebhookManager / `/api/webhooks/create`);
they're not in git, which is why history can't explain them.

**Fix:** delete the 6 dead `moodbox.pl` subscriptions; keep the `www.moodbox.pl` set. (Bonus: halves
webhook-triggered function invocations, since events currently POST to both.)

---

### 🟡 #3 — Survey page `force-dynamic` (acceptable, low volume)

`src/app/(frontend)/ankieta/[token]/page.tsx:11` — `force-dynamic`. Correct: it's per-token,
per-user, and calls the Shopify **Admin** API (`getOrderById`) + Payload on every load. Traffic is
low (only people who got a survey email). Leave it. If it ever gets hammered, cache `getOrderById`
per order id.

---

### 🟡 #4 — Cron leftover sends an email on every unauthorized hit

`src/app/api/cron/send-feedback-emails/route.ts:24-30` — there's a `// TODO REMOVE AFTER TESTING`
block that **sends an email** (and runs the function to completion) every time the endpoint is hit
with a bad/missing auth header. Any internet scanner probing `/api/cron/...` triggers an email + a
function invocation. Low compute, but it's pure waste and a small abuse vector.

**Fix — DONE (2026-07-01):** deleted the test-email block; now returns `401` immediately on bad auth,
and the auth check was moved *before* `getPayload` so unauthorized probes don't even boot Payload.
Compute impact was ~nil (endpoint isn't a real sink) — this was hygiene + closing an email-spam vector.

The cron itself (`0 16 */2 * *`, every other day, `maxDuration = 300`) loops sequentially sending
emails with a DB update per email. Fine at your volume. If the `scheduled-emails` backlog ever grows
large, the sequential `for` loop + per-row `payload.update` could approach the 5-min ceiling — batch
the status updates then if it becomes an issue. Not urgent.

> **Changed 2026-07-01:** cron schedule dropped from daily (`0 16 * * *`) to every other day
> (`0 16 */2 * *`). Compute savings are negligible (cron was never the sink), but it's a slight
> reduction. Trade-off accepted: survey emails may now arrive up to ~1 day later than the intended
> 7-day mark, which is fine for a survey nudge.

The stray `console.log(scheduled)` at `sendScheduledEmail.ts` was also removed (logged the full result
set every run — noise + serialization cost). **DONE (2026-07-01).**

---

### 🟢 #5 — Image optimization (already handled, separate quota)

Covered in `docs/plans/image-optimization-audit.md`. Image optimization *does* run on functions, but
it's a separate Hobby line (transformations/day), not the Active-CPU hours you're hitting. Shopify
images already bypass the optimizer via the custom loader. No action needed for the compute cap.

---

### 🟢 #6 — Globals (Header/Footer) are correctly cached

`getCachedGlobal` (`src/utilities/getGlobals.ts`) wraps `payload.findGlobal` in `unstable_cache` with
tag-based invalidation. Header/Footer don't re-query the DB on every render once warm. Good — no
change. (Once #1 makes pages static, these become irrelevant to per-request compute anyway.)

---

### 🟢 #7 — Webhooks & exports (low frequency, fine)

`order-created`, `order-fulfilled`, `products-updated`, `webhooks/{create,delete,list}`,
`export/{newsletter,orders,survey}`, `test-email` — all event-driven or manual-admin. They run rarely
and do bounded work. Not a compute concern. (`test-email` route should probably be deleted before any
real launch, but it's not eating your hours.)

---

## Priority order (updated 2026-07-01)

| # | Change | Status | Compute impact |
|---|--------|--------|----------------|
| 1 | `getAllCollections`: `no-cache` → `force-cache` + `revalidate: 3600` + `tags`; plumb `revalidate` through `shopifyFetch` (#2) | ✅ **DONE** | **Highest** — `/` went `ƒ` → `○` ISR; per-visit render compute gone |
| 2 | Delete cron test-email-on-401 block + stray `console.log` (#4) | ✅ **DONE** | Low, pure waste |
| 3 | Delete the 6 dead `moodbox.pl` webhook subscriptions; keep `www.moodbox.pl` (#2c) | ☐ TODO | Halves webhook invocations; fixes silently-failing deliveries |
| 4 | Add `collections/*` handling **and** subscribe to those topics (#2b) | ☐ TODO | Correctness — collection edits currently don't invalidate cache (1h backstop covers it) |
| 5 | After deploy, watch Vercel **Usage → Active CPU** for a few days | ☐ TODO | Confirms the win |

The caching fix (#1) was the whole ballgame: a visitor reading `/` now triggers **zero** functions
until the next revalidation window (1h, or on-demand via webhook) — the CDN serves pre-rendered HTML.
Note the original plan's "add `export const revalidate` to the page" step turned out **unnecessary**:
the fetch-level `revalidate: 3600` made the route ISR on its own (see the note under #2).

---

## How to confirm where the hours actually go

You can't see per-route compute from the code alone — confirm against real data:

1. Vercel dashboard → your project → **Usage** → filter by **Active CPU** / **Function Duration**.
2. **Observability → Functions**: sort by invocations and by total duration. The top row is almost
   certainly `/[slug]` (or `/`). That validates this audit's #1.
3. Check **invocation count** vs visitor count. If invocations ≫ humans, bots/crawlers are hitting
   uncached dynamic pages — ISR (#1) fixes that for free, and Vercel's BotID/firewall can shed the
   rest.

---

## TL;DR

Your compute is being eaten by **dynamically rendering every public page on every request**, and each
render makes a **live Shopify collections call that's explicitly set to never cache**. Fix two lines
of caching behavior (`force-cache` + `revalidate`) and your marketing pages start being served from
the CDN with no function execution at all. Everything else (cron, webhooks, images) is already fine
or negligible.

---

## "But we fetch dynamic data — products, prices, quantities. Won't caching make it stale?"

No. Freshness here is **event-driven, not time-driven**. "Dynamically rendered" and "fresh data" are
not the same thing — and conflating them is what's costing the compute.

**What you actually fetch** (`src/lib/shopify/queries.ts`): `price.amount` and `availableForSale`
(a boolean) — **not** live `quantityAvailable` counts.

### Catalog data (prices, `availableForSale`, which products exist)

Changes only when *you* change it in Shopify — not on every page view. The correct propagation is
already wired up:

```
Edit price in Shopify
  → Shopify fires products/update (or inventory_levels/update) webhook
  → /api/webhooks/products-updated calls revalidateTag('products') + revalidateTag('collections')
  → Next.js purges those cache entries + the routes that depended on them
  → next visitor regenerates the page with the new price
```

This is **on-demand revalidation** — the page is fresh *the moment Shopify changes*, not on a timer.
The current `cache: 'no-cache'` is strictly worse: it refetches on every render even when nothing
changed — paying for a live API round-trip 10,000 times to catch the 3 price changes/week the webhook
already catches. `force-cache` + the existing tags = "serve from cache until Shopify says it changed."
Same freshness, ~1/1000th the compute. The webhook even handles `inventory_levels/update`, so the
in-stock/out-of-stock state stays correct.

### Live quantity at purchase — not the page's job

A cached page is never the source of truth for stock; **Shopify checkout is**. When the customer pays,
Shopify re-validates price and inventory server-side and rejects overselling. `createCart`
(`cache: 'no-store'`) and the final checkout run live at click time — those stay dynamic and should.

### The split that keeps it safe

| Data | Freshness need | Mechanism | Cache? |
|------|----------------|-----------|--------|
| Prices, `availableForSale`, catalog | On change | webhook → `revalidateTag` | ✅ `force-cache` + tags |
| Page content (CMS blocks) | On edit | Payload `revalidatePath`/`revalidateTag` hooks | ✅ ISR |
| Cart creation (`createCart`) | Live, per-click | runs at click time | ❌ `no-store` (keep) |
| Final price + stock truth | Live, per-purchase | Shopify checkout | ❌ Shopify-side |

Making pages ISR + collections `force-cache` does **not** risk wrong prices or overselling. The only
thing lost is the per-view live refetch — which bought compute bills, not correctness.

**Edge case:** if you later show an exact live "3 left in stock" counter, don't bake that number into
the cached HTML — fetch it client-side (a server action when the user opens the product) so only that
one number is live while the rest of the page stays cached. Surgical dynamic, not whole-page dynamic.

**Safety net:** `revalidate = 3600` on the ISR pages also bounds worst-case staleness — if a webhook
delivery ever fails, the page still self-heals within the revalidate window instead of serving the
stale price indefinitely.

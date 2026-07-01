# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **▶ START HERE (active work):** Vercel Fluid Compute over the Hobby cap. Audit in
> [`docs/plans/fluid-compute-audit.md`](docs/plans/fluid-compute-audit.md). **Caching fix DONE &
> confirmed:** `getAllCollections` → `force-cache` + `revalidate: 3600` + `tags` (`api.ts`),
> `revalidate` plumbed through `shopifyFetch` (`client.ts`); `/` went `ƒ` → `○` ISR (1h) in the build.
> `draftMode()` was never the cause (reading `isEnabled` doesn't force dynamic); the fetch-level
> `revalidate` drives ISR without any `export const revalidate`. **Remaining TODO (webhooks):** the 6
> `moodbox.pl` subscriptions are dead (307-redirect → Shopify won't follow) — delete them, keep
> `www.moodbox.pl`; and add + subscribe `collections/*` topics so collection edits invalidate the
> cache (`products-updated/route.ts` only handles `products/*` + `inventory_levels/update`).

## Project Overview

Moodbox Payload is a Payload CMS-powered e-commerce website with a hybrid architecture that integrates with Shopify. Shopify handles transactions (checkout, payments, inventory), while Payload CMS handles customer lifecycle management (surveys, analytics, email campaigns, admin dashboard).

## Commands

```bash
# Development
pnpm dev                    # Start dev server (uses .env.local)
pnpm build                  # Build for production (runs migrations first)
pnpm start                  # Start production server

# Database Migrations
pnpm run migrate:create     # Create new migration (local env)
pnpm run migrate:docker     # Run migrations on local Docker DB
pnpm run migrate:staging    # Run migrations on staging DB

# Code Quality
pnpm lint                   # Run ESLint
pnpm lint:fix               # Fix ESLint issues
pnpm prettify               # Format all files with Prettier
pnpm typecheck              # TypeScript type checking

# Testing
pnpm test                   # Run all tests (int + e2e)
pnpm test:int               # Run integration tests (vitest)
pnpm test:e2e               # Run E2E tests (playwright)

# Payload
pnpm generate:types         # Regenerate payload-types.ts
pnpm generate:importmap     # Generate import map

# Docker (local Postgres)
docker compose up -d        # Start local DB
docker compose down         # Stop container (keeps data)
docker compose down -v      # Stop and delete all data
```

## Architecture

### Tech Stack

- **Framework**: Next.js 16 (App Router) with Payload CMS 3.x
- **Database**: Vercel Postgres (Neon) with Drizzle ORM
- **Storage**: Vercel Blob for media
- **Styling**: TailwindCSS with shadcn/ui components
- **E-commerce**: Shopify (Storefront + Admin APIs)

### Directory Structure

```
src/
├── app/
│   ├── (frontend)/        # Public website pages
│   │   ├── [slug]/        # Dynamic CMS pages
│   │   ├── ankieta/       # Survey page
│   │   └── contact/       # Contact form
│   ├── (payload)/         # Payload admin panel
│   ├── actions/           # Server actions (checkout, survey, sync)
│   └── api/
│       ├── cron/          # Scheduled jobs (email sending)
│       ├── export/        # CSV export endpoints
│       └── webhooks/      # Shopify webhooks (order-created, order-fulfilled, products-updated)
├── collections/           # Payload collections (Orders, Newsletter, SurveyResponses, ScheduledEmails)
├── blocks/                # Layout builder blocks (Banner, CallToAction, Content, Media, Code)
├── components/
│   └── _custom_moodbox/   # Moodbox-specific components (cart, survey)
├── lib/
│   └── shopify/           # Shopify API clients and queries
│       ├── api.ts         # Storefront API functions
│       ├── adminApi.ts    # Admin API functions (orders, discounts)
│       ├── queries.ts     # GraphQL queries
│       └── webhooks/      # Webhook verification
└── utilities/
    └── email_templates/   # Modular email template system
```

### Key Integrations

**Shopify Webhooks** (receive at `/api/webhooks/`):

- `order-created`: Syncs order data to Payload, captures newsletter signups
- `order-fulfilled`: Schedules feedback survey emails
- `products-updated`: Revalidates Next.js cache for product/collection pages

**Customer Flow**:

1. Checkout via Shopify (cart form in `_custom_moodbox/home/cart/`)
2. Order webhook creates record in Payload
3. Fulfillment webhook schedules survey email (7 days delay)
4. Survey completion generates discount code via Shopify Admin API

### Path Aliases

- `@/*` → `./src/*`
- `@payload-config` → `./src/payload.config.ts`

### Environment Variables (required)

See `.env.example`. Key variables:

- `POSTGRES_URL` - Database connection
- `PAYLOAD_SECRET` - Payload auth secret
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage
- `EMAIL_*` - SMTP configuration
- `SHOPIFY_*` - Shopify API tokens and webhook secret
- `CRON_SECRET` - Authorization for cron endpoints

## Coding Rules

### Formatting (Prettier)

- Single quotes, no semicolons
- Trailing commas everywhere
- 100 character line width

### TypeScript

- Strict mode enabled
- Use `@/*` path alias for imports from `src/`
- Suffix type names with `T` (e.g., `CartSchemaT`, `AttributeKeyT`)
- Server actions are suffixed with `A` (e.g., `checkoutA`, `submitSurveyA`)

### React & Next.js

- Use `'use server'` directive for server actions
- React Server Components by default (App Router)
- Use `cn()` utility from `@/utilities/ui` for conditional Tailwind classes
- shadcn/ui components located in `src/components/ui/`

### Payload CMS

- Collections use PascalCase exports (e.g., `Orders`, `SurveyResponses`)
- Admin component paths use string format: `'@/components/ComponentName'`
- Polish (`pl`) and English (`en`) labels for admin UI
- Custom admin cell components for specialized display (e.g., `BooleanCell`, `LinkCell`)

### Shopify Integration

- Storefront API: `src/lib/shopify/api.ts` and `queries.ts`
- Admin API: `src/lib/shopify/adminApi.ts` and `adminQueries.ts`
- Webhook handlers verify HMAC signatures before processing
- Use `ATTRIBUTE_KEY_PL` mapping for Polish field names in Shopify attributes

### Error Handling

- Use emoji prefixes in console logs: `❌` for errors, `📦` for data logging
- Return `{ error: true, message: string }` pattern from server actions
- User-facing messages in Polish

## Testing

- **Integration tests**: `tests/int/` - Run with vitest against jsdom
- **E2E tests**: `tests/e2e/` - Run with Playwright (starts dev server automatically)

## Migrations Workflow

1. **Local development**: Docker DB with `push: false` in Payload config
2. **Create migration**: `pnpm run migrate:create <name>` - generates SQL in `src/migrations/`
3. **Test locally**: `pnpm run migrate:docker`
4. **Test staging**: `pnpm run migrate:staging`
5. **Production**: Migrations run automatically during `pnpm build` (via `payload migrate`)

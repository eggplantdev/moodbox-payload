# Image Optimization Audit — 2026-03-31

## What happened

Vercel Hobby plan image optimization quota (5,000 transformations/day) was exceeded, causing **402 errors** on uncached images. Some product images appeared as broken placeholders randomly across collections.

### Root causes

1. **Shopify images double-optimized** — All product images from `cdn.shopify.com` were routed through Vercel's `/_next/image` optimizer. Shopify CDN already serves optimized WebP/AVIF at requested sizes for free. Every Shopify image consumed Vercel transformations for zero benefit.

2. **60-second default `minimumCacheTTL`** — No `minimumCacheTTL` was configured. The default for remote images is 60 seconds. After 60s without a request, the cached optimization goes STALE. Next request = new transformation billed. With ~300 Shopify images × ~3 width variants each, most went stale between visits and were re-optimized constantly.

3. **`qualities: [100]` global override** (was in deployed build) — Forced full quality on all images. Larger payloads, no visual benefit.

4. **`quality={100}` hardcoded** in `ImageMedia` and `SelectedVariantImg` — Redundant with global config, same waste.

5. **CartItem missing `sizes` prop** — 60×60px thumbnail with no `sizes` meant the browser assumed `100vw` and requested a massive image variant.

### How the cache works

- **HIT** (fresh, within TTL) → served from cache, 0 transformations
- **STALE** (TTL expired) → re-optimized, 1 transformation
- **MISS** (never seen) → optimized from scratch, 1 transformation

Cache key = `URL + width + quality + format`. Each unique combo is a separate entry.

`minimumCacheTTL` sets the floor for how long an optimized image stays fresh. Vercel uses `max(originCacheControl, minimumCacheTTL)`.

### Hobby plan behavior on quota exceeded

New images return **HTTP 402**, triggering `onError` on `<Image>` and showing `alt` text. Already-cached images continue to work. No graceful fallback to unoptimized originals.

---

## What we did

### 1. Created Shopify CDN loader (`src/lib/shopify/image-loader.ts`)

Custom `next/image` loader that delegates resizing to Shopify CDN via `?width=N` parameter. Shopify handles resize + format negotiation (WebP/AVIF) for free.

```ts
import type { ImageLoaderProps } from 'next/image'

export default function shopifyLoader({ src, width }: ImageLoaderProps): string {
  const url = new URL(src)
  url.searchParams.set('width', width.toString())
  return url.toString()
}
```

Applied to all Shopify image components:
- `SelectedVariantImg.tsx` — `loader={shopifyLoader}`
- `VariantImg.tsx` — `loader={shopifyLoader}`
- `CartItem.tsx` — `loader={shopifyLoader}` + added `sizes="60px"`

**Result:** Shopify images bypass Vercel optimizer entirely. Responsive `srcset` still works. Zero transformations consumed.

### 2. Set `minimumCacheTTL: 2678400` (31 days) in `next.config.js`

Ensures CMS images (Payload) stay cached for 31 days instead of 60 seconds. Safe because `getMediaUrl` appends `?updatedAt` to CMS image URLs — when an image changes in the CMS, the URL changes, creating a new cache entry automatically.

### 3. Removed `qualities: [100]` from `next.config.js`

Images now use default quality settings.

### 4. Temporary: set `unoptimized` on `ImageMedia` component

Because the quota was already exceeded, re-enabling optimization would serve 402 errors. CMS images are temporarily served unoptimized until the quota resets.

---

## TODO: once quota resets

### Remove `unoptimized` from `ImageMedia`

File: `src/components/Media/ImageMedia/index.tsx`

```diff
  <NextImage
-   unoptimized
    alt={alt || ''}
```

This re-enables Vercel optimization for Payload CMS images (~10-20 per page). With `minimumCacheTTL: 2678400` already set, these will be optimized once and cached for 31 days. Expected usage: ~20 transformations/month for CMS images.

### Optional: set explicit `quality` on `ImageMedia`

Currently no `quality` prop after removing `quality={100}`. Next.js default is 75, which is fine. If you want to tune it:

```tsx
<NextImage quality={75} ... />
```

### Optional: reduce `deviceSizes` and `imageSizes`

Default `deviceSizes` has 8 entries (640–3840px), `imageSizes` has 8 entries (16–384px). For your layout, you likely need fewer:

```js
images: {
  deviceSizes: [640, 828, 1200, 1920],
  imageSizes: [64, 128, 256, 384],
  minimumCacheTTL: 2678400,
}
```

Fewer size entries = fewer unique cache keys = fewer transformations. Only do this if you want to further reduce quota usage.

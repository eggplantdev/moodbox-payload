# Plan: Shopify CDN Image Loader

## Problem

Vercel's free tier allows 5,000 image optimizations per rolling 30-day window. As of 2026-03-11, the project has used 3,879 — 78% of the limit — on a small e-commerce site.

The root cause: every Shopify product image (`cdn.shopify.com`) is routed through Vercel's `/_next/image` optimizer. Each unique `(src, width, quality)` combination counts as a separate optimization. With multiple device widths across visitors, the count grows linearly with traffic.

Shopify's CDN already supports on-the-fly resizing (`?width=X`) and automatic WebP delivery via content negotiation. Routing these images through Vercel's optimizer is redundant.

## Goal

Eliminate Vercel image optimization quota usage for all Shopify-sourced images while preserving responsive `srcset` behavior and image quality.

CMS images (Payload / Vercel Blob) continue using Vercel's optimizer — their volume is negligible.

## Affected Files

| File | Role |
|------|------|
| `src/lib/shopify/imageLoader.ts` | **New** — Shopify CDN loader function |
| `src/components/_custom_moodbox/home/shopify_collections/SelectedVariantImg.tsx` | Main product image (largest, most viewed) |
| `src/components/_custom_moodbox/home/shopify_collections/VariantImg.tsx` | Variant selector thumbnails |
| `src/components/_custom_moodbox/home/cart/CartItem.tsx` | Cart item thumbnails |
| `next.config.js` | Remove `cdn.shopify.com` from `remotePatterns` |

## Implementation

### 1. Create Shopify image loader

`src/lib/shopify/imageLoader.ts`

Next.js `<Image>` accepts a `loader` prop — a function that receives `{ src, width, quality }` and returns a URL string. Instead of generating `/_next/image?url=cdn.shopify.com/...&w=640&q=100`, the loader builds `cdn.shopify.com/...?width=640` directly.

```ts
type ImageLoaderParamsT = {
  src: string
  width: number
  quality?: number
}

export const shopifyImageLoader = ({ src, width, quality }: ImageLoaderParamsT): string => {
  const url = new URL(src)
  url.searchParams.set('width', String(width))
  if (quality) url.searchParams.set('quality', String(quality))
  return url.toString()
}
```

### 2. Apply loader to Shopify image components

Add `loader={shopifyImageLoader}` to `<Image>` in each component. No other props change — `sizes`, `fill`, `alt`, `quality` all stay the same.

**SelectedVariantImg.tsx**
```diff
+ import { shopifyImageLoader } from '@/lib/shopify/imageLoader'
  ...
  <Image
+   loader={shopifyImageLoader}
    quality={100}
    ref={ref}
    fill={true}
    ...
  />
```

**VariantImg.tsx**
```diff
+ import { shopifyImageLoader } from '@/lib/shopify/imageLoader'
  ...
  <Image
+   loader={shopifyImageLoader}
    fill={true}
    src={image.url}
    sizes={'5vw'}
    ...
  />
```

**CartItem.tsx**
```diff
+ import { shopifyImageLoader } from '@/lib/shopify/imageLoader'
  ...
  <Image
+   loader={shopifyImageLoader}
    width={60}
    height={60}
    src={src}
    ...
  />
```

### 3. Remove Shopify from `remotePatterns`

Once the loader is in place, Shopify images bypass `/_next/image` entirely. The `remotePatterns` entry for `cdn.shopify.com` is no longer needed and should be removed to prevent accidental usage.

```diff
  remotePatterns: [
-   {
-     protocol: 'https',
-     hostname: 'cdn.shopify.com',
-     pathname: '/**',
-   },
    ...[NEXT_PUBLIC_SERVER_URL].map((item) => {
```

## Verification

1. `pnpm build` — confirm no build errors
2. `pnpm dev` — load a page with product images
3. Open DevTools → Network tab → filter image requests
4. Confirm image `src` attributes point to `cdn.shopify.com/...?width=X`, **not** `/_next/image?url=...`
5. Confirm `srcset` contains multiple Shopify CDN URLs at different widths
6. Check response `Content-Type` header is `image/webp` (Shopify's automatic format negotiation)
7. Monitor Vercel dashboard over following days — transformations should drop significantly

## Expected Impact

Shopify product images make up the vast majority of optimizations. After this change:
- **Vercel image optimizations**: drops from ~3,900/month to a fraction (only CMS media remains)
- **Performance**: unchanged — Shopify CDN serves resized WebP just like Vercel would
- **Responsive behavior**: unchanged — `srcset` + `sizes` still work, just pointing at Shopify URLs

## Risks

- **Shopify CDN URL format changes**: unlikely, but if Shopify changes their `?width=` parameter support, images would load at original size. Easy to detect (large network payloads) and revert.
- **Quality parameter support**: Shopify may ignore the `quality` param on some image formats. Verify during testing. If unsupported, remove it from the loader — Shopify's default quality is good enough.

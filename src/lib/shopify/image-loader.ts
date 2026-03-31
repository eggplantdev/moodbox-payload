import type { ImageLoaderProps } from 'next/image'

export default function shopifyLoader({ src, width }: ImageLoaderProps): string {
  const url = new URL(src)
  url.searchParams.set('width', width.toString())
  return url.toString()
}

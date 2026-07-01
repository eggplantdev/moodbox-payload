// 'use server'

import 'server-only' //

import { env } from '@/lib/env'
import { ShopifyResponseT } from './types'

type ShopifyFetchParamsT = {
  query: string
  variables?: Record<string, unknown>
  cache?: RequestCache
  tags?: string[]
  revalidate?: number
}

export async function shopifyFetch<T>({
  query,
  variables = {},
  cache = 'no-cache',
  tags = [],
  revalidate,
}: ShopifyFetchParamsT): Promise<ShopifyResponseT<T> | null> {
  const next: RequestInit['next'] = { tags }
  if (revalidate) next.revalidate = revalidate

  const response = await fetch(env.SHOPIFY_STOREFRONT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    cache,
    next,
  })

  if (!response.ok) {
    console.log(`Shopify API error: ${response.status} ${response.statusText}`)
    return null
  }

  const json = await response.json()

  if (json.errors) {
    console.error('Shopify GraphQL errors:', json.errors)
    console.error('Shopify GraphQL errors:', JSON.stringify(json.errors, null, 2))
    return null
  }
  return json
}

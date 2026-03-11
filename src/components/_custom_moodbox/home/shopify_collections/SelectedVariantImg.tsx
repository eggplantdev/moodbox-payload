import Image from 'next/image'
import React, { useEffect, useRef } from 'react'
import { cn } from '@/utilities/ui'
import { ProductVariantT } from '@/lib/shopify/types'
import useCart from '@/lib/hooks/useCart'
import { Checkbox } from '@/components/ui/checkbox'
import Tag from '@/components/_custom_moodbox/common/Tag'
import SelectedVariantImgFullScreen from './SelectedImgFullScreenCheckbox'

type PropsT = {
  fullScreen: boolean
  variant: ProductVariantT
  selectable: boolean
  setShowItemsLimitInfo: (show: boolean) => void
  setImgHeight?: (scrollHeight: number) => void
}

export default function SelectedVariantImg({
  variant,
  fullScreen,
  selectable,
  setShowItemsLimitInfo,
  setImgHeight,
}: PropsT) {
  const { addCartItem, deleteCartItem, cartItems } = useCart()
  const checked = cartItems.includes(variant.id)
  const src = variant.image?.url
  const ref = useRef<HTMLImageElement>(null)

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectable && !checked) {
      setShowItemsLimitInfo(true)
      return
    }

    setShowItemsLimitInfo(false)
    if (checked) return deleteCartItem(variant.id)
    addCartItem(variant.id)
  }

  useEffect(() => {
    // setImgHeight is available only for first img in first slider we don't need to calculate each img
    if (!setImgHeight || !ref.current) return
    const element = ref.current

    const observer = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        const entry = entries[0]
        if (!entry) return

        setImgHeight(entry.target.scrollHeight)
      })
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [setImgHeight])

  return (
    <div className={cn(`relative mx-auto aspect-square rounded`)}>
      {src && (
        <Image
          quality={100}
          ref={ref}
          fill={true}
          className={cn(`h-full w-full rounded`)}
          src={src}
          alt={''}
          sizes={
            fullScreen
              ? '(max-width: 1280px) 40vw, 480px'
              : '(max-width: 767px) 90vw, (max-width: 1023px) 24vw, 15vw'
          }
        />
      )}
      {variant.availableForSale ? (
        <div
          role={`button`}
          aria-label={checked ? 'Usuń z koszyka' : 'Dodaj do koszyka'}
          onClick={(e) => toggle(e)}
          className={cn(
            `absolute top-0 right-0 z-10 p-2`,
            fullScreen && `p-4`,
            !selectable && !checked ? `cursor-not-allowed` : 'cursor-pointer',
          )}
        >
          {fullScreen ? (
            <SelectedVariantImgFullScreen checked={checked} selectable={selectable} />
          ) : (
            <Checkbox
              className={cn(
                `h-full w-full`,
                fullScreen ? 'size-8 xl:size-10' : 'size-6',
                !selectable && !checked ? `cursor-not-allowed` : 'cursor-pointer',
              )}
              checked={checked}
              aria-label={checked ? 'Usuń z koszyka' : 'Dodaj do koszyka'}
            />
          )}
        </div>
      ) : (
        <div className={cn(`absolute top-0 right-0 z-10`, fullScreen ? `p-4` : `p-2`)}>
          <Tag
            fullScreen={fullScreen}
            className={fullScreen ? `text-xs` : `text-[0.625rem]`}
            title={`Niedostępny`}
          />
        </div>
      )}
    </div>
  )
}

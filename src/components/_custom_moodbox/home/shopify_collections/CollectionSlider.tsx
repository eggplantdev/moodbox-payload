'use client'

import CollectionSliderBtn from './CollectionSliderBtn'
import CollectionSliderDialog from './CollectionSliderDialog'
import CollectionSliderProduct from './CollectionSliderProduct'
import CollectionTitle from './CollectionTitle'
import { useState } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/scrollbar'
import { Keyboard, Mousewheel, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { cn } from '@/utilities/ui'
import { ProductT } from '@/lib/shopify/types'
import useCart from '@/lib/hooks/useCart'
import { useMaxLG, useMaxSM } from '../../../../lib/hooks/useMediaQuery'
import { useShopifyCollectionCtx } from '../../../../providers/ShopifyCollectionCtx/ShopifyCollectionsProvider'

type PropsT = {
  slides: ProductT[]
  title: string
  isFullScreen: boolean
  initSlide?: number
  className?: string
  collectionIndex: number
}

export default function CollectionSlider({
  slides,
  title,
  isFullScreen,
  initSlide = 0,
  collectionIndex,
}: PropsT) {
  const [swiperIsReady, setSwiperIsReady] = useState(false)
  const [swiper, setSwiper] = useState<SwiperType | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [showItemsLimitInfo, setShowItemsLimitInfo] = useState(false)
  const [fullScreenDialogOpen, setFullScreenDialogOpen] = useState(false)

  const { setImgHeight } = useShopifyCollectionCtx()

  const { cartItems } = useCart()

  // Filter once so the click index and the dialog's initialSlide both index the SAME rendered
  // list. Filtering inline in the map desynced raw indices from Swiper's rendered-child count and
  // opened the wrong product. Applied in dev too so the two environments render identically.
  const visibleSlides = slides.filter((slide) => slide.availableForSale)

  const allVariants = slides.flatMap((el) => el.variants.edges)
  const selectedWithinCatLen =
    allVariants.filter((variant) => cartItems.includes(variant.node.id)).length ?? 0

  const isMaxLg = useMaxLG()
  const isSm = useMaxSM()
  let numberOfVisibleSlides = 6
  let spaces = 48
  if (isSm) {
    numberOfVisibleSlides = 1
    spaces = 0
  } else if (isMaxLg) {
    numberOfVisibleSlides = 4
    spaces = 24
  }

  const actualSlidesPerView = isFullScreen ? 1 : numberOfVisibleSlides
  const navigationActive = isFullScreen
    ? visibleSlides.length > 1
    : visibleSlides.length > numberOfVisibleSlides

  const swiperConfig = {
    modules: [Pagination, Mousewheel, Keyboard],
    spaceBetween: isFullScreen ? 0 : spaces,
    slidesPerView: actualSlidesPerView,
    draggable: true,
    centeredSlides: false,
    initialSlide: initSlide,
    loop: visibleSlides.length > actualSlidesPerView,
    speed: 250,
    mousewheel: { forceToAxis: true, releaseOnEdges: true, sensitivity: 3.5 },
    keyboard: { enabled: true, onlyInViewport: true },

    onSwiper: (swiperInstance: SwiperType) => {
      setSwiper(swiperInstance)
      setSwiperIsReady(true)
    },
  }

  function toggle(index: number) {
    if (isSm) return
    if (isFullScreen) return
    setFullScreenDialogOpen((curr) => !curr)
    setActiveSlide(index)
  }

  if (visibleSlides.length < 1) return <></>

  return (
    <>
      <div
        className={cn(
          `mx-auto h-full w-full max-w-[1440px]`,
          swiperIsReady ? 'opacity-100 duration-500' : 'opacity-0',
          isFullScreen ? 'max-h-[90vh] overflow-y-auto' : 'xPaddings',
        )}
      >
        {!isFullScreen && (
          <CollectionTitle
            selectedWithinCatLen={selectedWithinCatLen}
            title={title}
            showItemsLimitInfo={showItemsLimitInfo}
          />
        )}
        <div className={cn(`flex`, isFullScreen ? `mx-auto w-full items-center` : 'items-start')}>
          <CollectionSliderBtn
            disabled={!swiperIsReady ? false : !navigationActive}
            onClick={() => swiper?.slidePrev()}
            isFullScreen={isFullScreen}
            direction={'left'}
          />
          <Swiper {...swiperConfig} className={`mx-9 w-full`}>
            {visibleSlides.map((slide, i) => {
              const isHeightReference = collectionIndex === 0 && i === 0
              return (
                <SwiperSlide key={slide.id}>
                  <CollectionSliderProduct
                    slide={slide}
                    selectable={selectedWithinCatLen < 2}
                    fullScreen={isFullScreen}
                    toggleFullScreen={() => toggle(i)}
                    // this is to position arrow buttons and we need to calculate only one img hence undefined
                    setImgHeight={isHeightReference ? setImgHeight : undefined}
                    setShowItemsLimitInfo={setShowItemsLimitInfo}
                  />
                </SwiperSlide>
              )
            })}
          </Swiper>

          <CollectionSliderBtn
            disabled={!swiperIsReady ? false : !navigationActive}
            onClick={() => swiper?.slideNext()}
            isFullScreen={isFullScreen}
            direction={'right'}
          />
        </div>
      </div>

      <CollectionSliderDialog
        title={title}
        slides={visibleSlides}
        initSlide={activeSlide}
        fullScreenDialogOpen={fullScreenDialogOpen}
        setFullScreenDialogOpen={setFullScreenDialogOpen}
      />
    </>
  )
}

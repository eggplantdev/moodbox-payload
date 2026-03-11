'use client'

import { PartnersBlock } from '@/payload-types'
import { ImageMedia } from '../Media/ImageMedia'
import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/scrollbar'
import { Autoplay, Keyboard, Mousewheel, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { useState } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { cn } from '@/utilities/ui'
export const Partners: React.FC<PartnersBlock> = ({ partners }) => {
  const [swiperIsReady, setSwiperIsReady] = useState(false)
  const [_, setSwiper] = useState<SwiperType | null>(null)

  if (!partners || partners.length === 0) return <></>

  const config = {
    modules: [Pagination, Mousewheel, Keyboard, Autoplay],
    spaceBetween: 10,
    slidesPerView: partners.length >= 6 ? 6 : partners.length,
    loop: true,
    speed: 3000,
    autoplay: {
      delay: 0,
      disableOnInteraction: false,
      pauseOnMouseEnter: false,
    },
    onSwiper: (swiperInstance: SwiperType) => {
      setSwiper(swiperInstance)
      setSwiperIsReady(true)
    },
  }

  return (
    <section className={`xPaddings mx-auto max-w-[1440px] xPaddings`}>
      <Swiper
        {...config}
        className={cn(
          'flex  bg-mood-dark-brown duration-500 transition-opacity ',
          swiperIsReady ? 'opacity-100' : 'opacity-0',
        )}
      >
        {partners?.map((partner) => {
          return (
            <SwiperSlide key={partner.id}>
              <div
                key={partner.id}
                className="w-full h-[150px] relative flex items-center justify-center  "
              >
                <ImageMedia
                  resource={partner.partner}
                  sizes="(max-width: 1468px) 20vw, 250px"
                  fill={true}
                  imgClassName="object-contain"
                />
              </div>
            </SwiperSlide>
          )
        })}
      </Swiper>
    </section>
  )
}

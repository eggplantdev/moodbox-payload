import { StepsBlock } from '@/payload-types'
import React from 'react'
import { ImageMedia } from '../Media/ImageMedia'

export const Steps: React.FC<StepsBlock> = ({ steps }) => {
  return (
    <div
      className={`xPaddings mx-auto grid max-w-[1440px] grid-cols-2 gap-4 my-16 md:grid-cols-4 xl:my-20`}
    >
      {steps?.map((step) => {
        return (
          <div key={step.id} className={`flex flex-col items-center w-full`}>
            <div className="w-full h-full min-h-[80px]  relative">
              <ImageMedia resource={step.icon} sizes="(max-width: 767px) 40vw, 20vw" fill={true} />
            </div>
            <p className={`text-mood-dark-gray max-w-[120px] pt-1 text-center font-bold`}>
              {step.step}
            </p>
          </div>
        )
      })}
    </div>
  )
}

import React from 'react'
import { assets } from '../assets/assets'

const OurPolicy = () => {
  return (
    <div className='flex flex-col sm:flex-row justify-around gap-12 sm:gap-2 text-center py-20 text-xs sm:text-sm md:text-base text-gray-700'>

        <div>
            <img src={assets.exchange_icon} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Returns & Exchanges</p>
            <p className='text-gray-400'>For return and warranty inquiries, please contact our support team.</p>
        </div>
        <div>
            <img src={assets.quality_icon} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Warranty Policy</p>
            <p className='text-gray-400'>We provide standard technical warranty for appliances</p>
        </div>
        <div>
            <img src={assets.support_img} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Expert Support</p>
            <p className='text-gray-400'>Contact our team for installation and service inquiries</p>
        </div>
    </div>
  )
}

export default OurPolicy
import React from 'react'
import { assets } from '../assets/assets'
import { Link } from 'react-router-dom'

const Hero = () => {
  return (
    <div className='flex flex-col sm:flex-row'>
      <Link to='/product/697'>
        <img className='w-full rounded-xl' src={assets.banner} alt="banner" />
      </Link>
    </div>
  )
}

export default Hero
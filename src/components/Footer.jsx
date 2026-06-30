import React from 'react'
import { assets } from '../assets/assets'
import { Link, NavLink } from 'react-router-dom'

const Footer = () => {
  return (
    <div>
        <div className='flex flex-col sm:grid grid-cols-[3fr_1fr_1fr] gap-14 my-10 mt-40 text-sm'>

            <div>
                <p className='font-prata font-bold text-xl mb-4'>MODERN HOME</p>
                <p className='w-full md:w-2/3 text-gray-600'>
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Similique ipsa, voluptatem temporibus ratione ea nisi voluptatum, alias ipsam, nemo cupiditate iste maiores! Culpa architecto quos nostrum nam recusandae? Vel, ducimus?
                </p>
            </div>
            <div>
                <p className='text-xl font-medium mb-5'>OUR STORE</p>
                <ul className='flex flex-col gap-1 text-gray-600'>
                    <li><Link to={'/'}>Home</Link></li>
                    <li><Link to={'/about'}>About Us</Link></li>
                    <li><Link to={'/'}>Privacy</Link></li>
                    <li><Link to={'/'}>Delivery</Link></li>
                </ul>
            </div>
            <div>
                <p className='text-xl font-medium mb-5'>GET IN TOUCH</p>
                <ul className='flex flex-col gap-1 text-gray-600'>
                    <li>+98-913-242-5728</li>
                    <li>info@kmodern.ir</li>
                </ul>
            </div>
        </div>
        <div>
                <hr className='h-[1.1px] border-none bg-gray-200'/>
                <p className='py-5 text-sm text-center'>Copyright © 2026 kmodern.ir - All Rights Reserved.</p>
            </div>
    </div>
  )
}

export default Footer
import React, { useContext, useState } from 'react'
import {assets} from '../assets/assets'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext';
const Navbar = () => {

  const [visible,setVisibility] = useState(false);
  const {setShowSearch, getCartCount} = useContext(ShopContext);

  return (
    <div className='flex items-center justify-between py-5 font-medium'>
        <Link to='/'>
          <img src={assets.logo} className='w-9 sm:w-13 transition-all' alt='modern Home logo' />
        </Link>

        <ul className='hidden sm:flex gap-5 text-sm text-gray-700'>
          <NavLink to='/' className='flex flex-col items-center gap-1 hover:scale-110 transition-all ease-in-out'>
            <p>HOME</p>
            <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
          </NavLink>
          <NavLink to='/all-products' className='flex flex-col items-center gap-1 hover:scale-110 transition-all ease-in-out'>
            <p>All PRODUCTS</p>
            <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
          </NavLink>
          <NavLink to='/about' className='flex flex-col items-center gap-1 hover:scale-110 transition-all ease-in-out'>
            <p>ABOUT</p>
            <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
          </NavLink>
          <NavLink to='/contact' className='flex flex-col items-center gap-1 hover:scale-110 transition-all ease-in-out'>
            <p>CONTACT</p>
            <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
          </NavLink>
          <NavLink to='/orders' className='flex flex-col items-center gap-1 hover:scale-110 transition-all ease-in-out'>
            <p>ORDERS</p>
            <hr className='w-2/4 border-none h-[1.5px] bg-gray-700 hidden' />
          </NavLink>
        </ul>

        <div className='flex items-center gap-6'>
          <Link to='/all-products' onClick={()=>{setShowSearch(true);}}>
            <img src={assets.search_icon} alt="search_button" className='w-5 cursor-pointer' />
          </Link>
          <div className='group relative'>
              <Link to='/login'>
                <img src={assets.profile_icon} alt="profile_icon" className='w-5 cursor-pointer' />
              </Link>
            <div className='group-hover:block hidden absolute dropdown-menu right-0 pt-4' >
              <div className='flex flex-col gap-2 w-36  py-3 px-5 bg-slate-100 text-gray-500 rounded'>
                <p className='cursor-pointer hover:text-black'>My Profile</p>
                <Link to='/orders'><p className='cursor-pointer hover:text-black'>Orders</p></Link>
                <p className='cursor-pointer hover:text-black'>Logout</p>
              </div>
            </div>
          </div>
          <Link to='/cart' className='relative'>
            <img src={assets.cart_icon} alt="cart" className='w-6 min-w-6' />
            <p className='absolute right-[-5px] top-[-4px] w-4 h-4 text-center leading-3.5 bg-black text-white aspect-square rounded-full text-[8px] border-2'>{getCartCount()}</p>
          </Link>
          <img onClick={() => setVisibility(true)} src={assets.menu_icon} alt="menu" className='w-5 cursor-pointer sm:hidden' />
        </div>
        {/* sidebar */}
        <div className={`z-9999 absolute right-0 top-0 bottom-0 overflow-hidden bg-white transition-all ${visible ? 'w-full' : 'w-0'}`}>
          <div className='flex flex-col text-gray-600'>
            <div onClick={() => setVisibility(false)} className='flex items-center gap-4 p-3 cursor-pointer'>
              <img src={assets.dropdown_icon} alt="Back" className='h-4 rotate-180' />
              <p>Back</p>
            </div>
            <NavLink onClick={()=>setVisibility(false)} className='py-2 pl-6 border-b border-t border-gray-300' to='/' >HOME</NavLink>
            <NavLink onClick={()=>setVisibility(false)} className='py-2 pl-6 border-b border-gray-300' to='/all-products' >ALL PRODUCTS</NavLink>
            <NavLink onClick={()=>setVisibility(false)} className='py-2 pl-6 border-b border-gray-300' to='/about' >ABOUT</NavLink>
            <NavLink onClick={()=>setVisibility(false)} className='py-2 pl-6 border-b border-gray-300' to='/contact' >CONTACT</NavLink>
            <NavLink onClick={()=>setVisibility(false)} className='py-2 pl-6 border-b border-gray-300' to='/orders' >ORDERS</NavLink>
          </div>
        </div>
    </div>
  )
}

export default Navbar
import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import { assets } from '../assets/assets';
import { useLocation } from 'react-router-dom';

const SearchBar = () => {

    const {search, setSearch, showSearch, setShowSearch} = useContext(ShopContext);
    const location = useLocation();
    const [visible,setVisibility] = useState(false);

    useEffect(()=>{
        if (location.pathname.includes('all-products')){
            setVisibility(true);
        } else {
            setVisibility(false);
        }
    },[location])

  return showSearch && visible ? (
    <div className='border-t border-gray-100 text-center mb-5'>
        <div className='inline-flex items-center justify-center border
        border-gray-400 px-5 py-2 my-5 mx-3 rounded-full w-3/4 sm:w-1/2 '>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} type="text" placeholder='Search' className='flex-1 outline-none bg-inherit text-sm'/>
            <img src={assets.search_icon} className='w-4' alt="search_icon" />
        </div>
        <img onClick={()=>setShowSearch(false)} className='inline w-3 cursor-pointer' src={assets.cross_icon} alt="cross_icon" />
    </div>
  ) : null
}

export default SearchBar
import React, { useContext, useEffect, useState } from 'react'
import Title from '../components/Title';
import { ShopContext } from '../context/ShopContext'
import { assets } from '../assets/assets';
import CartTotal from '../components/CartTotal';
import { Link } from 'react-router-dom';

const Cart = () => {

  const {products, currency, cartItems, updateQuantity} = useContext(ShopContext);
  const [cartData,setCartData] = useState([]);

  useEffect(()=>{
    const tempData = [];
    for (const items in cartItems) {
      for (const item in cartItems[items]){
        if (cartItems[items][item] > 0){
          tempData.push({
            _id: items,
            color: item,
            quantity: cartItems[items][item]
          })
        }
      }
    }
    setCartData(tempData);
  },[cartItems])

  return (
    <div className='border-t border-gray-300 pt-14'>
      <div className='text-2xl mb-3'>
        <Title text1={'YOUR'}text2={'CART'} />
      </div>
      <div className='mt-6'>
        {cartData.length === 0 && (
          <p className='text-gray-500'>No products yet.</p>
        )}
        {cartData.map((item,index)=>{
          const productData = products.find((product)=> product._id === item._id);

          return (
            <div key={index} className='py-4 border-t border-b border-gray-200 text-gray-700 grid grid-cols-[4fr_0.2fr_0.2fr_0.2fr] sm:grid-cols-[4fr_2fr_0.5fr_0.5fr] items-center gap-4'>
              <Link to={`/product/${productData._id}`}>
              <div className='flex items-start gap-6 hover:scale-102 transition-all ease-in-out'>
                <img className='w-16 sm:w-20' src={productData.image[0]} alt="product_image" />
                <div>
                  <p className='text-sm sm:text-lg font-medium'>{productData.name}</p>
                  <div className='flex items-center gap-5 mt-2'>
                    <p>{productData.price.toLocaleString('en-US')}{currency}</p>
                  </div>
                </div>
              </div>
              </Link>
              <p className='px-2 sm:px-3 flex justify-center sm:py-1 border border-gray-200 bg-slate-50'>{item.color}</p>
              <input className='border border-gray-200 max-w-10 sm:max-w-20 px-1 sm:px-2 py-1' type="number" min={1} step={1} defaultValue={item.quantity} onChange={(e) => e.target.value === '' || e.target.value === '0' ? null : updateQuantity(item._id, item.color, Number(e.target.value))} onKeyDown={(e) => ['e', 'E', '.', '-', ','].includes(e.key) && e.preventDefault()} 
            />
              <img onClick={()=>updateQuantity(item._id,item.color,0)} className='w-4 mr-4 sm:w-5 cursor-pointer hover:scale-110 transition-all ease-in-out' src={assets.bin_icon} alt="bin" />
            </div>
          )
        })
      }
      </div>
      <div className='flex justify-end my-20'>
        <div className='w-full sm:w-[450px]'>
          <CartTotal />
          <div className='w-full text-end'>
            <Link to='/place-order'>
              <button className='bg-black text-white text-sm my-8 py-3 px-8 hover:scale-105 transition-all ease-in-out'>PROCEED TO CHECKOUT</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Cart
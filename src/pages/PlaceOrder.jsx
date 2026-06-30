import React, { useState, useContext } from 'react'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import { assets } from '../assets/assets'
import { toast } from "react-toastify";
import { useNavigate } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext'

const PlaceOrder = () => {

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
    phone: '',
  });
  const [method,setMethod] = useState('mellat');
  const { placeOrder } = useContext(ShopContext);
  const navigate = useNavigate();

  const onChangeHandler = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({...prev, [name]: value}));
  };

  const isKerman = formData.city.trim().toLowerCase() === 'kerman' && formData.province.trim().toLowerCase() === 'kerman';

  const handleMethodSelect = (method) => {
    if (method === 'cod') {
      if (!isKerman) {
        toast.error('Cash on delivery is only available for Kerman City.');
        return;
      }
    }
    setMethod(method);
  };

  return (
    <div className='flex flex-col sm:flex-row justify-between gap-4 pt-5 sm:pt-14 min-h-[80vh] border-t border-gray-200'>
      {/* left */}
      <div className='flex flex-col gap-4 w-full sm:max-w-[480px]'>
        <div className='text-xl sm:text-2xl my-3'>
          <Title text1={'DELIVERY'} text2={'INFORMATION'}/>
        </div>
        <div className='flex gap-3'>
          <input name='firstName' value={formData.firstName} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='First name' type="text" />
          <input name='lastName' value={formData.lastName} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Last name' type="text" />
        </div>
        <input name='email' value={formData.email} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Email address' type="email" />
        <input name='street' value={formData.street} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Street' type="text" />
        <div className='flex gap-3'>
          <input name='city' value={formData.city} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='City' type="text" />
          <input name='province' value={formData.province} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Province' type="text" />
        </div>
        <div className='flex gap-3'>
          <input name='postalCode' value={formData.postalCode} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Postal code' type="number" />
          <input name='country' value={formData.country} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Country' type="text" />
        </div>
        <input name='phone' value={formData.phone} onChange={onChangeHandler} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' placeholder='Phone' type="number" />
      </div>
      {/* right */}
      <div className='mt-8'>
        <div className='mt-8 min-w-80'>
          <CartTotal/>
        </div>
        <div className='mt-12'>
          <Title text1={'PAYMENT'} text2={'METHOD'} />
          <div className='flex gap-3 flex-col lg:flex-row '>
            {/* mellat */}
            <div onClick={() => handleMethodSelect('mellat')} className='flex items-center gap-3 border border-gray-300 p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border border-gray-300 rounded-full ${method === 'mellat' ? 'bg-green-400' : ''}`}></p>
              <img className='h-10 mx-4' src={assets.mellat_logo} alt="mellat_logo" />
            </div>
            {/* zarin */}
            <div onClick={() => handleMethodSelect('zarrinPal')} className='flex items-center gap-3 border border-gray-300 p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border border-gray-300 rounded-full ${method === 'zarrinPal' ? 'bg-green-400' : ''}`}></p>
              <img className='h-10 mx-4' src={assets.zarrinpal_logo} alt="zarrinpal_logo" />
            </div>
            {/* up */}
            <div onClick={()=>handleMethodSelect('up')} className='flex items-center gap-3 border border-gray-300 p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border border-gray-300 rounded-full ${method === 'up' ? 'bg-green-400' : ''}`}></p>
              <img className='h-10 mx-4' src={assets.up_logo} alt="up_logo" />
            </div>
            {/* cod */}
              <div onClick={()=>handleMethodSelect('cod')} className={`flex items-center gap-3 border border-gray-300 p-2 px-3 cursor-pointer transition-all ${isKerman ? 'opacity-100' : 'opacity-45'}`}>
                <p className={`min-w-3.5 h-3.5 border border-gray-300 rounded-full ${method === 'cod' ? 'bg-green-400' : ''}`}></p>
                <p className='text-gray-500 text-sm font-medium mx-4'>CASH ON DELIVERY</p>
              </div>
            </div>

            <div className='w-full text-end mt-8'>
              <button onClick={() => { const res = placeOrder(formData, method); if (res) navigate('/orders'); }} className='bg-black text-white px-16 py-3 text-sm hover:scale-105 transition-all ease-in-out'>
                PLACE ORDER
              </button>
            </div>
          </div>
        </div>
      </div>
  )
}

export default PlaceOrder
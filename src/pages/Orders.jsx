import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title';
import { Link } from 'react-router-dom';

const Orders = () => {
  const { products, currency, orders } = useContext(ShopContext);
  const [orderData, setOrderData] = useState([]);

  useEffect(() => {
    setOrderData(orders || []);
  }, [orders]);

  return (
    <div className='border-t pt-16'>
      <div className='text-2xl'>
        <Title text1={'MY'} text2={'ORDERS'} />
      </div>

      <div className='mt-6'>
        {orderData.length === 0 && (
          <p className='text-gray-500'>No orders yet.</p>
        )}

        {orderData.map((order, oi) => (
          <div key={order.id || oi} className='mb-8'>
            <div className='mb-4 text-sm text-gray-600'>Order #{order.id} — {new Date(order.date).toLocaleString()}</div>

            {order.items.map((item, idx) => {
              const productData = products.find((p) => p._id === item._id);
              if (!productData) return null;

              return (
                <div key={idx} className='py-4 border-t border-b border-gray-200 text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                  <Link to={`/product/${item._id}`}>
                    <div className='flex items-start gap-6 text-sm hover:scale-105 transition-all ease-in-out'>
                      <img className='w-16 sm:w-20' src={productData.image?.[0]} alt={productData.name} />
                      <div>
                        <p className='sm:text-base font-medium'>{productData.name}</p>
                        <div className='flex items-center gap-4 mt-2 text-base text-gray-700'>
                          <p className='text-lg'>{(productData.price * item.quantity).toLocaleString('en-US')}{currency}</p>
                          <p>Quantity: {item.quantity}</p>
                          <p>Color: {item.color}</p>
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className='md:w-1/2 flex justify-between'>
                    <div className='flex items-center gap-2'>
                      <p className='min-w-2 h-2 rounded-full bg-green-500'></p>
                      <p className='text-sm md:text-base'>Ready to ship</p>
                    </div>
                    <button className='border border-gray-300 px-4 py-2 text-sm font-medium rounded-sm cursor-pointer hover:scale-105 transition-all ease-in-out'>Track Order</button>
                  </div>
                </div>
              )
            })}

          </div>
        ))}
      </div>
    </div>
  )
}

export default Orders
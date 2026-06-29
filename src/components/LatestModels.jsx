import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import Title from './Title';
import PorductItem from './PorductItem';

const LatestModels = () => {

    const { products } = useContext(ShopContext);
    const [latestProducts, setlatestProducts] = useState([]);

    useEffect(() => {
      setlatestProducts(products.slice(0, 10));
    },[])

  return (
    <div className='my-10'>
      <div className='text-center sm:py-3 md:py-8 lg:py-10 sm:text-xl md:text-2xl lg:text-3xl'>
        <Title text1={'LATEST'} text2={'MODELS'}/>
        <p className='w-3/4 m-auto text-xs sm:text-sm md:text-base text-gray-600 pb-5'>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Necessitatibus soluta corporis nemo ipsam voluptate</p>
      </div>
      {/* add product */}
      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
        {
          latestProducts.map((item,index)=>(
            <PorductItem key={index} id={item._id} image={item.image} name={item.name} price={item.price} />
          ))
        }
      </div>
    </div>
  )
}

export default LatestModels;
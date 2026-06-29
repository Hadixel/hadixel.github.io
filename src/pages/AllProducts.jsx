import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title';
import PorductItem from '../components/PorductItem';

const AllProducts = () => {

  const {products, search, showSearch} = useContext(ShopContext);
  const [filteredProducts, setFilteredProducts] = useState([]);

  const applyFilter = () => {
    let productsCopy = products.slice();
    if (showSearch && search) {
      productsCopy = productsCopy.filter(item => item.name
        .toLocaleLowerCase().includes(search.toLocaleLowerCase())
      );
    }
    setFilteredProducts(productsCopy);
  }

  useEffect(()=>{
    applyFilter();
  },[search, showSearch, products])

  return (
    <div className='flex flex-col sm:flex-row gap-1 sm:gap-10 pt-10'>
      <div className='flex-1'>
        <div className='flex justify-between text-base sm:text-2xl mb-4'>
          <Title text1={'ALL'} text2={'PRODUCTS '}/>
        </div>
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 gap-y-6'>
          {
            filteredProducts.map((item,index)=>(
              <PorductItem key={index} name={item.name} id={item._id} price={item.price} image={item.image}  />
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default AllProducts
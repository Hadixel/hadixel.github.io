import React, { useContext } from 'react'
import { ShopContext } from '../context/ShopContext'
import { Link } from 'react-router-dom';

const PorductItem = ({id,image,name,price}) => {

    const {currency} = useContext(ShopContext);

  return (
    <Link className='text-gray-700 cursor-pointer p-3 border border-gray-200' to={`/product/${id}`}>
        <div className='overflow-hidden'>
            <img className='hover:scale-110 transition ease-in-out ' src={image[0]} alt={`product ${name}`} />
        </div>
        <p className='pt-3 pb-1 text-sm'>{name}</p>
        <p className='text-sm font-medium'>{price.toLocaleString('en-US')}{currency}</p>
    </Link>
  )
}

export default PorductItem
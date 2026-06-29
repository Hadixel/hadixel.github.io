import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext'
import { assets } from '../assets/assets';
import RelatedProducts from '../components/RelatedProducts';

const Product = () => {

  const {productId} = useParams();
  const {products, currency, addToCart} = useContext(ShopContext);
  const [productData,setProductData] = useState(false);
  const [image,setImage] = useState('');
  const [color,setColor] = useState('');
  const [activeTab, setActiveTab] = useState('features');

  const fetchProductData = async () => {
    products.map((item)=>{
      if(item._id === productId) {
        setProductData(item);
        setImage(item.image[0]);
        return null;
      }
    })
  }

  useEffect(()=>{
    fetchProductData();
  },[productId, products]);

  return productData ? (
    <div className='border-t-2 border-gray-200 pt-10 transition-opacity ease-in duration-500 opacity-100'>
      {/* product data */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-12 relative'>

        {/* p images */}
        <div className='flex flex-col-reverse gap-3 md:flex-row relative'>
          <div className='flex sm:flex-col overflow-x-auto sm:overflow-y-auto items-start sm:justify-normal sm:absolute sm:left-0 sm:bottom-0 sm:top-0 sm:w-[18.7%] w-full [&::-webkit-scrollbar]:hidden'>
            {
              productData.image.map((item,index)=>(
                <img onClick={()=>setImage(item)} className='w-[24%] sm:w-full sm:mb-3 shrink-0 hover:scale-110 cursor-pointer' src={item} key={index} alt="product_image" />
              ))
            }
          </div>
          <div className='w-full sm:w-[80%] sm:ml-auto'>
            <img src={image} className='w-full h-auto aspect-square border border-gray-300 object-contain' alt="product_image" />
          </div>
        </div>
        
        {/* p info */}
        <div className='flex flex-col justify-start'>
          <div className='flex flex-col'>
            <h1 className='font-medium text-2xl mt-2'>{productData.name}</h1>
            <div className='flex items-center gap-1 mt-2'>
              <img src={assets.star_icon} alt="start_icon" className="w-3.5" />
              <img src={assets.star_icon} alt="start_icon" className="w-3.5" />
              <img src={assets.star_icon} alt="start_icon" className="w-3.5" />
              <img src={assets.star_icon} alt="start_icon" className="w-3.5" />
              <img src={assets.star_dull_icon} alt="dull_star_icon" className="w-3.5" />
              <p className='pl-2'>(122)</p>
          </div>
          <p className='mt-5 text-3xl font-medium'>{productData.price.toLocaleString('en-US')}{currency}</p>
          </div>

          <div className='mt-5 md:w-4/5 text-gray-500 leading-relaxed text-sm'>
              <p>{productData.description}</p>
          </div>
          
          <div className='flex flex-col'>
            <div className='flex flex-col gap-4 my-8'>
              <p>Select Color</p>
              <div className='flex gap-2'>{productData.colors.map((item,index)=>(
                <button onClick={()=>setColor(item)} className={`border border-gray-200 py-2 px-4 bg-gray-100 hover:scale-110 transition ease-in-out ${item === color ? 'border-orange-500' : ''}`} key={index}>{item}</button>))}
              </div>
            </div>
            <button onClick={()=>addToCart(productData._id,color)} className='bg-black text-white px-8 py-3 text-sm active:bg-gray-700 w-full md:w-auto self-start'>ADD TO CART</button>
            <hr className='mt-8 sm:w-4/5'/>
          </div>
        </div>
      </div>

      {/* policy */}
      <div className='flex flex-col sm:flex-row justify-around gap-12 sm:gap-2 text-center py-20 text-xs sm:text-sm md:text-base text-gray-700'>
        <div>
            <img src={assets.exchange_icon} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Returns & Exchanges</p>
            <p className='text-gray-400'>For return and warranty inquiries, please contact our support team.</p>
        </div>
        <div>
            <img src={assets.quality_icon} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Warranty Policy</p>
            <p className='text-gray-400'>We provide standard technical warranty for appliances</p>
        </div>
        <div>
            <img src={assets.support_img} className='w-12 m-auto mb-5' alt="policy_icon" />
            <p className='font-semibold'>Expert Support</p>
            <p className='text-gray-400'>Contact our team for installation and service inquiries</p>
        </div>
      </div>

      {/* p features and specs */}
      <div className='mt-20'>
        <div className='flex gap-1'>
          <button 
            onClick={() => setActiveTab('features')} 
            className={`px-5 py-3 text-sm font-medium border transition-all ${
              activeTab === 'features' 
                ? 'border-gray-500 border-b-transparent font-bold text-black' 
                : 'border-gray-300 text-gray-400 hover:text-gray-600'
            }`}
          >
            Features
          </button>
          <button 
            onClick={() => setActiveTab('specs')} 
            className={`px-5 py-3 text-sm font-medium border transition-all ${
              activeTab === 'specs' 
                ? 'border-gray-500 border-b-transparent font-bold text-black' 
                : 'border-gray-300 text-gray-400 hover:text-gray-600'
            }`}
          >
            Specifications
          </button>
        </div>

        <div className='border border-gray-300 px-6 py-6 text-sm text-gray-500 min-h-[150px]'>
          {activeTab === 'features' ? (
            <div className='flex flex-col gap-4'>
              {productData.features?.map((item, index) => (
                <ul key={index}>
                  <li className='list-disc list-inside'>{item}</li>
                </ul>
              ))}
            </div>
          ) : (
            <div className='flex flex-col gap-3 max-w-2xl'>
              {productData.specs?.map((item, index) => (
                <div key={index} className='grid grid-cols-2 sm:grid-cols-[200px_1fr] py-2 border-b border-gray-100 last:border-b-0'>
                  <span className='font-semibold text-gray-700'>{item.label}</span>
                  <span className='text-gray-600'>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* related P */}
      <RelatedProducts category={productData.category} subCategory={productData.subCategory}/>
    </div>
  ) : <div className='opacity-0'></div>
}

export default Product
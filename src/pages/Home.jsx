import React from 'react';
import Hero from '../components/Hero';
import LatestModels from '../components/LatestModels';
import BestSeller from '../components/BestSeller';
import OurPolicy from '../components/OurPolicy';

const Home = () => {
  return (
    <div>
      <Hero/>
      <LatestModels/>
      <BestSeller/>
      <OurPolicy/>
    </div>
  )
}
 
export default Home
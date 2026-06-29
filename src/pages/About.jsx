import React from 'react'
import Title from '../components/Title'
import { assets } from '../assets/assets'

const About = () => {
  return (
    <div>
      <div className='text-2xl text-center pt-8 border-t border-gray-200'>
        <Title text1={'ABOUT'} text2={'US'} />
      </div>
      <div className='my-10 flex flex-col md:flex-row gap-16'>
        <img className='w-full md:max-w-[450px]' src={assets.about_img} alt="modern_kitchen" />
        <div className='flex flex-col justify-center gap-6 md:w-2/4 text-gray-600'>
          <p>Lorem ipsum, dolor sit amet consectetur adipisicing elit. Dolorem veniam qualor Lorem ipsum dolor sit, amet consectetur adipisicing elit. Doloremque, obcaecati dolore? Explicabo minus ipsa, dolorum animi atque tempore quisquam, optio provident, repellat deleniti aliquam a nostrum quia neque ducimus libero! erat eum aliquid ipsum quam voluptatibus repellat magnam laboriosam nam placeat nobis, commodi, aut quibusdam sequi delectus, dicta voluptatem unde?</p>
          <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Quaerat, dolore? Aliquid ea accusamus Lorem ipsum dolor sit amet consectetur adipisicing elit. Culpa magnam suscipit dolor sit perferendis in accusantium recusandae commodi ab, autem, saepe consectetur inventore voluptatibus atque quidem mollitia maiores omnis ipsum!
          </p>
          <b className='text-gray-800'>
            Our Mission
          </b>
          <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Eos explicabo maxime ullam mollitia doloremque saepe tenetur, ratione inventore nesciunt repudiandae doloribus numquam hic quod nam aliquam illo magnam velit a.</p>
        </div>
      </div>
      <div className='text-xl py-4'>
          <Title text1={'WHY'} text2={'CHOOSE US'} />
      </div>
      <div className='flex flex-col md:flex-row text-sm mb-20'>
        <div className='border border-gray-300 px-10 md:px-16 py-8 sm:py-20 flex flex-col gap-5'>
          <b>Quality Assurance:</b>
          <p className='text-gray-600'>Lorem ipsum, dolor sit amet consectetur adipisicing elit. Dolor, iste incidunt officiis, corporis voluptates dicta id eum eos veritatis tempora iusto fugiat aliquam accusamus autem neque quos nesciunt blanditiis quidem.</p>
        </div>
        <div className='border border-gray-300 px-10 md:px-16 py-8 sm:py-20 flex flex-col gap-5'>
          <b>Convenience:</b>
          <p className='text-gray-600'>Lorem ipsum, dolor sit amet con Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptas nam, doloribus modi enim error, delectus reiciendis assumenda sequi, tenetur iusto exercitationem vel quibusdam nisi maiores at dolorem molestias ex ab! sectetur adipisicing elit. Dolor, iste incidunt officiis, corporis voluptates dicta id eum eos veritatis tempora iusto fugiat aliquam accusamus autem neque quos nesciunt blanditiis quidem.</p>
        </div>
        <div className='border border-gray-300 px-10 md:px-16 py-8 sm:py-20 flex flex-col gap-5'>
          <b>Exceptonal Customer Service</b>
          <p className='text-gray-600'>Lorem ipsum, dolor sit amet consectetur adipisicing elit. Dolor, iste incidunt officiis, corporis voluptates dicta id eum eos veritatis tempora ius Lorem ipsum dolor, sit amet consectetur adipisicing elit. Sapiente, doloribus quidem? Molestiae, quos, iusto quas pariatur fuga esse maxime laborum quia ipsa sed maiores rerum molestias blanditiis culpa dolorum aut? to fugiat aliquam accusamus autem neque quos nesciunt blanditiis quidem.</p>
        </div>
      </div>
    </div>
  )
}

export default About
import React, { createContext, useEffect, useState } from "react";
import { products } from "../assets/assets";
import { toast } from "react-toastify";

export const ShopContext = createContext();

const ShopContextProvider = (props) => {

    const currency = ' TOMAN';
    const delivery_fee = 200000;
    const [search,setSearch] = useState('');
    const [showSearch,setShowSearch] = useState(false);
    const [cartItems,setCartItems] = useState({});
    const [orders, setOrders] = useState([]);

    const addToCart = async (itemId,color) => {

        if (!color) {
            toast.error('Please Select A Color');
            return;
        }

        let cartData = structuredClone(cartItems);

        if (cartData[itemId]) {
            if (cartData[itemId][color]) {
                cartData[itemId][color] += 1;
            } else {
                cartData[itemId][color] = 1;
            }
        } else {
            cartData[itemId] = {};
            cartData[itemId][color] = 1;
        }

        setCartItems(cartData);
    }

    const clearCart = () => {
        setCartItems({});
    }

    const placeOrder = (customerInfo = {}, method = 'mellat') => {
        if (getCartCount() === 0) {
            toast.error('Your cart is empty');
            return null;
        }

        const orderItems = [];
        for (const productId in cartItems) {
            for (const color in cartItems[productId]) {
                const qty = cartItems[productId][color];
                if (qty > 0) {
                    orderItems.push({ _id: productId, color, quantity: qty });
                }
            }
        }

        const order = {
            id: Date.now().toString(),
            items: orderItems,
            total: getCartAmount(),
            customer: customerInfo,
            method,
            date: Date.now()
        };

        setOrders(prev => [order, ...prev]);

        clearCart();

        toast.success('Order placed successfully');
        return order;
    }

    const getCartCount = () => {
        let totalCount = 0;
        for (const items in cartItems){
            for(const item in cartItems[items]){
                try {
                    if (cartItems[items][item] > 0) {
                        totalCount += cartItems[items][item];
                    }
                } catch (error) {
                    
                }
            }
        }
        return totalCount;
    }

    const updateQuantity = async (itemId,color,quantity) => {
        let cartData = structuredClone(cartItems);
        cartData[itemId][color] = quantity;

        setCartItems(cartData);
    }

    const getCartAmount = () => {
        let totalAmount = 0;
        for (const items in cartItems){
            let itemInfo = products.find((product)=> product._id === items);
            for (const item in cartItems[items]){
                try {
                    if (cartItems[items][item] > 0 ){
                        totalAmount += itemInfo.price * cartItems[items][item];
                    }
                } catch (error) {
                    
                }
            }
        }
        return totalAmount;
    }

    const value = {
        products,
        currency,
        delivery_fee,
        search,
        setSearch,
        showSearch,
        setShowSearch,
        cartItems,
        addToCart,
        getCartCount,
        updateQuantity,
        getCartAmount,
        orders,
        placeOrder,
        clearCart
    };

    return (
        <ShopContext value={value}>
            {props.children}
        </ShopContext>
    );
};

export default ShopContextProvider;
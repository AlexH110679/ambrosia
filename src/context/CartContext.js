// src/context/CartContext.js
import React, { createContext, useContext, useReducer, useCallback, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDeliveryFee, updateDeliveryFeeInDB } from '../services/productService';

const CartContext = createContext(null);

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { product } = action.payload;
      const existing = state.items.find(i => i.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return state;
        return {
          ...state,
          items: state.items.map(i =>
            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...product, quantity: 1 }],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(i => i.id !== action.payload.productId),
      };

    case 'INCREMENT':
      return {
        ...state,
        items: state.items.map(i => {
          if (i.id !== action.payload.productId) return i;
          if (i.quantity >= i.stock) return i;
          return { ...i, quantity: i.quantity + 1 };
        }),
      };

    case 'DECREMENT': {
      const item = state.items.find(i => i.id === action.payload.productId);
      if (!item) return state;
      if (item.quantity <= 1) {
        return { ...state, items: state.items.filter(i => i.id !== action.payload.productId) };
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.payload.productId ? { ...i, quantity: i.quantity - 1 } : i
        ),
      };
    }

    case 'CLEAR_CART':
      return { ...state, items: [] };

    case 'APPLY_PROMO':
      return {
        ...state,
        promoCode: action.payload.code,
        discountPercent: action.payload.discount,
      };

    case 'REMOVE_PROMO':
      return { ...state, promoCode: null, discountPercent: 0 };

    default:
      return state;
  }
};

const initialState = {
  items: [],
  promoCode: null,
  discountPercent: 0,
};

const DEFAULT_PROMO_CODES = {
  THIAGO10: 10,
  FIESTA20: 20,
  LICOR15: 15,
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [deliveryCost, setDeliveryCost] = useState(4000);
  const [promosConfig, setPromosConfig] = useState(DEFAULT_PROMO_CODES);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const storedDelivery = await AsyncStorage.getItem('@delivery_cost');
        if (storedDelivery) {
          const parsedStored = parseInt(storedDelivery.toString().replace(/[^0-9]/g, ''), 10);
          if (!isNaN(parsedStored) && parsedStored >= 0) {
            setDeliveryCost(parsedStored);
          }
        }
        const dbFee = await fetchDeliveryFee();
        if (dbFee !== null && !isNaN(dbFee) && dbFee >= 0) {
          setDeliveryCost(dbFee);
          await AsyncStorage.setItem('@delivery_cost', dbFee.toString());
        }

        const storedPromos = await AsyncStorage.getItem('@custom_promos');
        if (storedPromos) {
          setPromosConfig(JSON.parse(storedPromos));
        }
      } catch (e) {
        console.warn('Error loading config:', e.message);
      }
    };
    loadConfig();
  }, []);

  const addPromoConfig = async (code, percentage) => {
    try {
      const cleanCode = code.trim().toUpperCase();
      const pct = parseInt(percentage, 10);
      if (!cleanCode || isNaN(pct) || pct <= 0 || pct > 100) return false;

      const updatedPromos = { ...promosConfig, [cleanCode]: pct };
      setPromosConfig(updatedPromos);
      await AsyncStorage.setItem('@custom_promos', JSON.stringify(updatedPromos));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const deletePromoConfig = async (code) => {
    try {
      const cleanCode = code.trim().toUpperCase();
      const updatedPromos = { ...promosConfig };
      delete updatedPromos[cleanCode];
      setPromosConfig(updatedPromos);
      await AsyncStorage.setItem('@custom_promos', JSON.stringify(updatedPromos));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const updateDeliveryCost = useCallback(async (newCost) => {
    try {
      if (newCost === undefined || newCost === null) return false;
      const cleaned = newCost.toString().replace(/[^0-9]/g, '');
      const parsed = parseInt(cleaned, 10);
      if (isNaN(parsed) || parsed < 0) return false;

      setDeliveryCost(parsed);
      await AsyncStorage.setItem('@delivery_cost', parsed.toString());
      await updateDeliveryFeeInDB(parsed);
      return true;
    } catch (e) {
      console.error('Error updating delivery cost:', e);
      return false;
    }
  }, []);

  const addItem = useCallback((product) => {
    dispatch({ type: 'ADD_ITEM', payload: { product } });
  }, []);

  const removeItem = useCallback((productId) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { productId } });
  }, []);

  const increment = useCallback((productId) => {
    dispatch({ type: 'INCREMENT', payload: { productId } });
  }, []);

  const decrement = useCallback((productId) => {
    dispatch({ type: 'DECREMENT', payload: { productId } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
  }, []);

  const applyPromo = useCallback((code) => {
    const trimmed = code.trim().toUpperCase();
    const discount = promosConfig[trimmed];
    if (discount) {
      dispatch({ type: 'APPLY_PROMO', payload: { code: trimmed, discount } });
      return { success: true, discount };
    }
    return { success: false, availableCodes: Object.keys(promosConfig) };
  }, [promosConfig]);

  const removePromo = useCallback(() => {
    dispatch({ type: 'REMOVE_PROMO' });
  }, []);

  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountAmount = subtotal * (state.discountPercent / 100);
  const deliveryFee = subtotal > 0 ? deliveryCost : 0;
  const total = subtotal - discountAmount + deliveryFee;
  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        promoCode: state.promoCode,
        discountPercent: state.discountPercent,
        subtotal,
        discountAmount,
        deliveryFee,
        total,
        itemCount,
        addItem,
        removeItem,
        increment,
        decrement,
        clearCart,
        applyPromo,
        removePromo,
        updateDeliveryCost,
        baseDeliveryCost: deliveryCost,
        promosConfig,
        addPromoConfig,
        deletePromoConfig,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
};

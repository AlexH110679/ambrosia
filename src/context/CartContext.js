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
      return { ...state, items: [], promoCode: null, discountPercent: 0, promoTarget: 'all' };

    case 'APPLY_PROMO':
      return {
        ...state,
        promoCode: action.payload.code,
        discountPercent: action.payload.discount,
        promoTarget: action.payload.target || 'all',
      };

    case 'REMOVE_PROMO':
      return { ...state, promoCode: null, discountPercent: 0, promoTarget: 'all' };

    default:
      return state;
  }
};

const initialState = {
  items: [],
  promoCode: null,
  discountPercent: 0,
  promoTarget: 'all',
};

const DEFAULT_PROMO_CODES = {
  THIAGO10: { pct: 10, target: 'all', originalCode: 'THIAGO10' },
  FIESTA20: { pct: 20, target: 'all', originalCode: 'FIESTA20' },
  LICOR15: { pct: 15, target: 'licores', originalCode: 'LICOR15' },
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [deliveryCost, setDeliveryCost] = useState(4000);
  const [promosConfig, setPromosConfig] = useState(DEFAULT_PROMO_CODES);
  const [usedPromos, setUsedPromos] = useState([]);

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
          const parsed = JSON.parse(storedPromos);
          // Auto migration for older number format
          for(let k in parsed) {
            if(typeof parsed[k] === 'number') {
              parsed[k] = { pct: parsed[k], target: 'all', originalCode: k };
            }
          }
          setPromosConfig(parsed);
        }

        const storedUsed = await AsyncStorage.getItem('@used_promos_list');
        if (storedUsed) setUsedPromos(JSON.parse(storedUsed));

      } catch (e) {
        console.warn('Error loading config:', e.message);
      }
    };
    loadConfig();
  }, []);

  const addPromoConfig = async (code, percentage, target = 'all') => {
    try {
      const cleanUpper = code.trim().toUpperCase();
      const pct = parseInt(percentage, 10);
      if (!cleanUpper || isNaN(pct) || pct <= 0 || pct > 100) return false;

      const updatedPromos = { ...promosConfig, [cleanUpper]: { pct, target, originalCode: code.trim() } };
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
    if(!code) return { success: false, reason: 'unrecognized' };
    const trimmed = code.trim().toUpperCase();
    const rule = promosConfig[trimmed];
    
    if (rule) {
      if (usedPromos.includes(trimmed)) {
        return { success: false, reason: 'used' }; // Ya fue usado
      }

      const discount = typeof rule === 'number' ? rule : rule.pct;
      const target = typeof rule === 'object' ? rule.target : 'all';
      const originalCode = typeof rule === 'object' ? rule.originalCode : trimmed;

      dispatch({ type: 'APPLY_PROMO', payload: { code: originalCode, discount, target } });
      return { success: true, discount, target, originalCode };
    }
    return { success: false, reason: 'unrecognized' };
  }, [promosConfig, usedPromos]);

  const markPromoAsUsed = async (code) => {
    if(!code) return;
    const clean = code.trim().toUpperCase();
    if(!usedPromos.includes(clean)) {
      const newUsed = [...usedPromos, clean];
      setUsedPromos(newUsed);
      await AsyncStorage.setItem('@used_promos_list', JSON.stringify(newUsed));
    }
  };

  const removePromo = useCallback(() => {
    dispatch({ type: 'REMOVE_PROMO' });
  }, []);

  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Calcula monto descuento inteligentemente (solo para target, o para todo)
  const discountAmount = state.items.reduce((sum, item) => {
    if (!state.promoCode || state.discountPercent === 0) return sum;
    if (state.promoTarget === 'all' || item.category === state.promoTarget) {
      return sum + (item.price * item.quantity * (state.discountPercent / 100));
    }
    return sum;
  }, 0);

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
        markPromoAsUsed,
        promoTarget: state.promoTarget,
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

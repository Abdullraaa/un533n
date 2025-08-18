import create from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const useStore = create(persist(
  (set, get) => ({
    // --- State ---
    cart: { items: [] },
    user: null,
    token: null,
    addresses: [], 
    orders: [], // New state for user orders
    wishlist: [], // New state for user wishlist

    // --- Actions ---

    // --- Auth Actions ---
    login: async (email, password) => {
      const { data } = await axios.post('/api/users/login', { email, password });
      set({ user: data.user, token: data.token });
      get().mergeCart();
    },
    signup: async (userData) => {
      await axios.post('/api/users/signup', userData);
    },
    logout: () => {
      set({ user: null, token: null });
    },

    // --- User Profile Actions ---
    updateProfile: async (profileData) => {
      if (!get().token) return; 
      const { data } = await axios.put('/api/users/profile', profileData, { headers: { Authorization: `Bearer ${get().token}` } });
      set(state => ({ user: { ...state.user, ...profileData } })); // Optimistically update user state
      return data;
    },

    // --- Cart Actions ---
    fetchCart: async () => {
      if (get().token) {
        const { data } = await axios.get('/api/cart', { headers: { Authorization: `Bearer ${get().token}` } });
        set({ cart: data });
      } else {
        // For guest users, the cart is already in the session state on the server
        const { data } = await axios.get('/api/cart');
        set({ cart: data });
      }
    },
    addToCart: async (variant_id, quantity) => {
      const headers = get().token ? { Authorization: `Bearer ${get().token}` } : {};
      await axios.post('/api/cart', { variant_id, quantity }, { headers });
      get().fetchCart();
    },
    updateCartItemQuantity: async (variant_id, quantity) => {
      const headers = get().token ? { Authorization: `Bearer ${get().token}` } : {};
      await axios.put(`/api/cart/${variant_id}`, { quantity }, { headers });
      get().fetchCart();
    },
    removeFromCart: async (variant_id) => {
      const headers = get().token ? { Authorization: `Bearer ${get().token}` } : {};
      await axios.delete(`/api/cart/${variant_id}`, { headers });
      get().fetchCart();
    },
    mergeCart: async () => {
      if (get().token) {
        await axios.post('/api/cart/merge', {}, { headers: { Authorization: `Bearer ${get().token}` } });
        get().fetchCart();
      }
    },

    // --- Address Actions ---
    fetchAddresses: async () => {
      if (!get().token) return; 
      const { data } = await axios.get('/api/users/addresses', { headers: { Authorization: `Bearer ${get().token}` } });
      set({ addresses: data });
    },
    addAddress: async (addressData) => {
      if (!get().token) return; 
      await axios.post('/api/users/addresses', addressData, { headers: { Authorization: `Bearer ${get().token}` } });
      get().fetchAddresses();
    },
    updateAddress: async (id, addressData) => {
      if (!get().token) return; 
      await axios.put(`/api/users/addresses/${id}`, addressData, { headers: { Authorization: `Bearer ${get().token}` } });
      get().fetchAddresses();
    },
    deleteAddress: async (id) => {
      if (!get().token) return; 
      await axios.delete(`/api/users/addresses/${id}`, { headers: { Authorization: `Bearer ${get().token}` } });
      get().fetchAddresses();
    },

    // --- Order Actions ---
    createOrder: async (orderData) => {
      if (!get().token) throw new Error('User not authenticated for order creation.');
      const { data } = await axios.post('/api/orders', orderData, { headers: { Authorization: `Bearer ${get().token}` } });
      set({ cart: { items: [] } }); // Clear cart after successful order
      get().fetchOrders(); // Refresh orders after creating a new one
      return data;
    },
    fetchOrders: async () => {
      if (!get().token) return; 
      const { data } = await axios.get('/api/orders', { headers: { Authorization: `Bearer ${get().token}` } });
      set({ orders: data });
    },

    // --- Wishlist Actions ---
    fetchWishlist: async () => {
      if (!get().token) return; 
      const { data } = await axios.get('/api/wishlist', { headers: { Authorization: `Bearer ${get().token}` } });
      set({ wishlist: data });
    },
    addToWishlist: async (variant_id) => {
      if (!get().token) return; 
      await axios.post('/api/wishlist', { variant_id }, { headers: { Authorization: `Bearer ${get().token}` } });
      get().fetchWishlist();
    },
    removeFromWishlist: async (variant_id) => {
      if (!get().token) return; 
      await axios.delete(`/api/wishlist/${variant_id}`, { headers: { Authorization: `Bearer ${get().token}` } });
      get().fetchWishlist();
    },

    // --- Product Actions (for Shop page) ---
    products: [], // State to hold products
    fetchProducts: async (category = null) => {
      let url = '/api/products';
      if (category) {
        url += `?category=${category}`;
      }
      const { data } = await axios.get(url);
      set({ products: data });
    },
  }),
  {
    name: 'un533n-store', 
    getStorage: () => localStorage, 
  }
));

export default useStore;

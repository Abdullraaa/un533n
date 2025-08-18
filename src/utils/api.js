const API_URL = '/api';

const api = {
  getProducts: () => fetch(`${API_URL}/products`).then(res => res.json()),
  getProduct: (id) => fetch(`${API_URL}/products/${id}`).then(res => res.json()),
  signup: (data) => fetch(`${API_URL}/users/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  login: (data) => fetch(`${API_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  getCart: () => fetch(`${API_URL}/cart`).then(res => res.json()),
  addToCart: (data) => fetch(`${API_URL}/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  updateCart: (productId, data) => fetch(`${API_URL}/cart/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  removeFromCart: (productId) => fetch(`${API_URL}/cart/${productId}`, {
    method: 'DELETE',
  }).then(res => res.json()),
  createOrder: (data) => fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  getOrders: (userId) => fetch(`${API_URL}/orders/${userId}`).then(res => res.json()),
  getWishlist: (userId) => fetch(`${API_URL}/wishlist/${userId}`).then(res => res.json()),
  addToWishlist: (data) => fetch(`${API_URL}/wishlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => res.json()),
  removeFromWishlist: (userId, productId) => fetch(`${API_URL}/wishlist/${userId}/${productId}`, {
    method: 'DELETE',
  }).then(res => res.json()),
};

export default api;
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Products
export const getProducts = async () => {
  const response = await api.get('/api/products');
  return response.data;
};

export const getProductById = async (id) => {
  const response = await api.get(`/api/products/${id}`);
  return response.data;
};

// Orders
export const createOrder = async (orderData) => {
  const response = await api.post('/api/inquiries', orderData);
  return response.data;
};

export const trackOrder = async (orderId) => {
  const response = await api.get(`/api/track/${orderId}`);
  return response.data;
};

export const getDeliveredOrders = async () => {
  const response = await api.get('/api/orders/delivered');
  return response.data;
};

// Reviews
export const getReviews = async () => {
  const response = await api.get('/api/reviews');
  return response.data;
};

export const createReview = async (reviewData) => {
  const response = await api.post('/api/reviews', reviewData);
  return response.data;
};

export default api;

import Constants from 'expo-constants';

// Get API URL from Constants.expoConfig for production or process.env for development
const getApiUrl = () => {
  // Try Constants.expoConfig.extra first (works in production)
  if (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL) {
    return Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;
  }
  // Fallback to process.env (works in development)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Final fallback
  return 'https://chammyflorals.vercel.app';
};

export const API_URL = getApiUrl();

console.log('API URL:', API_URL);
console.log('Environment check:', {
  hasConstants: !!Constants.expoConfig,
  hasExtra: !!Constants.expoConfig?.extra,
  hasProcessEnv: !!process.env.EXPO_PUBLIC_API_URL
});

export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string;
  pricing: Array<{
    label?: string;
    set?: string;
    price: number;
  }>;
  colors?: Array<{
    name: string;
    value: string;
  }>;
  addons?: Array<{
    label: string;
    price: number;
  } | string>;
  created_at?: string;
}

export interface Order {
  id: number;
  order_id?: string;
  customer_name: string;
  name?: string; // Alias for customer_name
  customer_email?: string;
  email?: string; // Alias for customer_email
  customer_phone?: string;
  phone?: string; // Alias for customer_phone
  flower_type: string;
  quantity: number;
  price: number;
  total_price?: number;
  total_fee?: number; // Alias for price/total_price
  delivery_date?: string;
  delivery_address?: string;
  message?: string;
  status: string;
  created_at: string;
  items?: any[];
  rush?: string;
  addons?: string[];
  fb_link?: string;
}

export interface Review {
  id: number;
  order_id?: string;
  name: string;
  stars: number;
  message: string;
  created_at: string;
  image_url?: string;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(includeAuth = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    try {
      console.log('Fetching products from:', `${API_URL}/api/products`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_URL}/api/products`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('Products API error:', response.status, response.statusText);
        return [];
      }
      const data = await response.json();
      console.log('Products fetched successfully:', data.length);
      return data || [];
    } catch (error: any) {
      console.error('Failed to fetch products:', error);
      return [];
    }
  }

  async getProduct(id: number): Promise<Product> {
    const response = await fetch(`${API_URL}/api/products/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch product');
    }
    return response.json();
  }

  // Orders
  async createOrder(orderData: any): Promise<Order> {
    // The server expects inquiries/orders to be posted to /api/inquiry
    const response = await fetch(`${API_URL}/api/inquiry`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(orderData),
    });
    if (!response.ok) {
      throw new Error('Failed to create order');
    }
    const order = await response.json();
    return order;
  }

  async getOrders(): Promise<Order[]> {
    try {
      console.log('Fetching orders from:', `${API_URL}/api/admin/orders`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${API_URL}/api/admin/orders`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('Orders API error:', response.status);
        return [];
      }
      const data = await response.json();
      console.log('Orders fetched successfully:', data.length);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      return [];
    }
  }

  async trackOrder(orderId: string): Promise<any> {
    try {
      console.log('Tracking order:', orderId);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_URL}/api/track/${orderId}`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 404) {
        throw new Error('ORDER_NOT_FOUND');
      }
      
      if (!response.ok) {
        console.error('Track order API error:', response.status);
        throw new Error('NETWORK_ERROR');
      }
      
      const data = await response.json();
      if (!data || Object.keys(data).length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }
      
      return data;
    } catch (error: any) {
      console.error('Failed to track order:', error);
      if (error.message === 'ORDER_NOT_FOUND') {
        throw new Error('ORDER_NOT_FOUND');
      }
      throw new Error('NETWORK_ERROR');
    }
  }

  async getOrderById(orderId: string): Promise<Order> {
    const response = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch order');
    return response.json();
  }

  async updateOrderStatus(orderId: string | number, status: string): Promise<Order> {
    const response = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update order status');
    return response.json();
  }

  async updateOrder(orderId: string | number, orderData: Partial<Order>): Promise<Order> {
    const response = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(orderData),
    });
    if (!response.ok) throw new Error('Failed to update order');
    return response.json();
  }

  async deleteOrder(orderId: string | number): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
      method: 'DELETE',
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to delete order');
  }

  // Reviews
  async getReviews(): Promise<Review[]> {
    try {
      console.log('Fetching reviews from:', `${API_URL}/api/reviews`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_URL}/api/reviews`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('Reviews API error:', response.status, response.statusText);
        return [];
      }
      const data = await response.json();
      console.log('Reviews fetched successfully:', data.length);
      return data || [];
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      return [];
    }
  }

  async createReview(reviewData: any): Promise<Review> {
    try {
      console.log('Creating review...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(reviewData),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Try to read JSON error message, fallback to text
        let errorMsg = `Status ${response.status}`;
        try {
          const j = await response.json();
          if (j && (j.error || j.message)) errorMsg = j.error || j.message;
          else errorMsg = JSON.stringify(j);
        } catch (e) {
          try { errorMsg = await response.text(); } catch (e) {}
        }
        console.error('Create review error:', response.status, errorMsg);
        throw new Error(errorMsg || 'REVIEW_SUBMISSION_FAILED');
      }

      return response.json();
    } catch (error: any) {
      console.error('Failed to create review:', error);
      throw new Error('REVIEW_SUBMISSION_FAILED');
    }
  }

  // Inquiry/Custom Orders
  async createInquiry(inquiryData: any): Promise<any> {
    try {
      console.log('Creating inquiry...', inquiryData);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_URL}/api/inquiry`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(inquiryData),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create inquiry error:', response.status, errorText);
        throw new Error('SUBMISSION_FAILED');
      }
      
      return response.json();
    } catch (error: any) {
      console.error('Failed to create inquiry:', error);
      throw new Error('SUBMISSION_FAILED');
    }
  }

  // Admin
  async adminLogin(credentials: { username: string; password: string }): Promise<any> {
    const response = await fetch(`${API_URL}/api/admin/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(credentials),
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  }

  async getDashboardStats(): Promise<any> {
    try {
      console.log('=== getDashboardStats START ===');
      console.log('Token:', this.token ? 'Present' : 'Missing');
      console.log('URL:', `${API_URL}/api/admin/dashboard`);
      
      const headers = this.getHeaders(true);
      console.log('Headers:', JSON.stringify(headers, null, 2));
      
      const response = await fetch(`${API_URL}/api/admin/dashboard`, {
        headers,
      });
      
      console.log('Response status:', response.status);
      console.log('Response statusText:', response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Dashboard API error response:', errorText);
        throw new Error(`Failed to fetch dashboard stats: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Dashboard data received:', data);
      console.log('=== getDashboardStats END ===');
      
      return data;
    } catch (error: any) {
      console.error('getDashboardStats ERROR:', error);
      throw error;
    }
  }

  // Admin Orders
  async getAdminOrders(): Promise<Order[]> {
    return this.getOrders();
  }

  // Admin Products
  async getAdminProducts(): Promise<Product[]> {
    try {
      console.log('=== getAdminProducts START ===');
      console.log('Token:', this.token ? 'Present' : 'Missing');
      console.log('Calling getProducts()...');
      const products = await this.getProducts();
      console.log('Products received:', products.length);
      console.log('=== getAdminProducts END ===');
      return products;
    } catch (error: any) {
      console.error('getAdminProducts ERROR:', error);
      throw error;
    }
  }

  async createProduct(productData: any): Promise<Product> {
    const response = await fetch(`${API_URL}/api/admin/products`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(productData),
    });
    if (!response.ok) throw new Error('Failed to create product');
    return response.json();
  }

  async updateProduct(id: number, productData: any): Promise<Product> {
    const response = await fetch(`${API_URL}/api/admin/products/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify(productData),
    });
    if (!response.ok) throw new Error('Failed to update product');
    return response.json();
  }

  async deleteProduct(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to delete product');
  }

  // Admin Reviews
  async deleteReview(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin/reviews/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to delete review');
  }

  // Admin Reports
  async getAdminReports(period: 'daily' | 'weekly' | 'monthly'): Promise<any[]> {
    const response = await fetch(`${API_URL}/api/admin/reports?period=${period}`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch reports');
    return response.json();
  }
}

export default new ApiService();

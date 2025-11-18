const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

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
  created_at?: string;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  flower_type: string;
  quantity: number;
  price: number;
  delivery_date?: string;
  delivery_address?: string;
  message?: string;
  status: string;
  created_at: string;
}

export interface Review {
  id: number;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

class ApiService {
  private getHeaders(includeAuth = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (includeAuth) {
      const token = ''; // Token will be managed by AuthContext
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    try {
      const response = await fetch(`${API_URL}/api/products`, {
        headers: this.getHeaders(),
        timeout: 10000,
      } as any);
      if (!response.ok) {
        console.error('Products API error:', response.status);
        return [];
      }
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Failed to fetch products:', error);
      return [];
    }
  }

  async getProduct(id: number): Promise<Product> {
    const response = await fetch(`${API_URL}/api/products/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch product');
    return response.json();
  }

  // Orders
  async createOrder(orderData: any): Promise<Order> {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(orderData),
    });
    if (!response.ok) throw new Error('Failed to create order');
    return response.json();
  }

  async getOrders(): Promise<Order[]> {
    const response = await fetch(`${API_URL}/api/orders`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch orders');
    return response.json();
  }

  async trackOrder(orderId: string): Promise<Order> {
    try {
      const response = await fetch(`${API_URL}/api/orders/track/${orderId}`, {
        headers: this.getHeaders(),
        timeout: 10000,
      } as any);
      if (!response.ok) throw new Error('Failed to track order');
      return response.json();
    } catch (error) {
      console.error('Failed to track order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId: number, status: string): Promise<Order> {
    const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update order status');
    return response.json();
  }

  // Reviews
  async getReviews(): Promise<Review[]> {
    try {
      const response = await fetch(`${API_URL}/api/reviews`, {
        headers: this.getHeaders(),
        timeout: 10000,
      } as any);
      if (!response.ok) {
        console.error('Reviews API error:', response.status);
        return [];
      }
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      return [];
    }
  }

  async createReview(reviewData: any): Promise<Review> {
    const response = await fetch(`${API_URL}/api/reviews`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(reviewData),
    });
    if (!response.ok) throw new Error('Failed to create review');
    return response.json();
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
    const response = await fetch(`${API_URL}/api/admin/dashboard`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch dashboard stats');
    return response.json();
  }
}

export default new ApiService();

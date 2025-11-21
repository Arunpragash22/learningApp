// Auth service for handling authentication API calls

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  status: number; // 0 = pending, 1 = active
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'student' | 'instructor' | 'admin';
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user: User;
  access_token: string;
  token_type: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user: User;
  access_token: string;
  token_type: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper function to get auth headers with JWT token
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

export const authService = {
  // Register a new user
  async register(userData: RegisterData): Promise<RegisterResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Registration failed');
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  // Login user
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  },

  // Get all users (admin only)
  async getAllUsers(): Promise<User[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch users');
      }

      const data = await response.json();
      return data.users || [];
    } catch (error: any) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },
};



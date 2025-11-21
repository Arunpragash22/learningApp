import React, { useEffect, useState, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { authService } from '../services/authService';
// Define types
interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  status: number; // 0 = pending, 1 = active
}
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  activateAccount: (token: string) => Promise<boolean>;
}
interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  passwordHint: string;
  role: 'student' | 'instructor' | 'admin';
}
// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);
// Mock users for demo purposes
const mockUsers = [{
  id: '1',
  firstName: 'John',
  lastName: 'Student',
  email: 'student@example.com',
  password: 'password123',
  role: 'student',
  status: 1
}, {
  id: '2',
  firstName: 'Jane',
  lastName: 'Instructor',
  email: 'instructor@example.com',
  password: 'password123',
  role: 'instructor',
  status: 1
}, {
  id: '3',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  password: 'password123',
  role: 'admin',
  status: 1
}];
export const AuthProvider: React.FC<{
  children: React.ReactNode;
}> = ({
  children
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Check if user is already logged in
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user data', error);
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);
  // Login function
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(email, password);
      
      if (response.success && response.user) {
        // Store user in state and localStorage
        setUser(response.user);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        // Store JWT token separately
        if (response.access_token) {
          localStorage.setItem('access_token', response.access_token);
          localStorage.setItem('token_type', response.token_type || 'bearer');
        }
        
        toast.success(response.message || 'Login successful');
        return true;
      }
      
      toast.error('Login failed');
      return false;
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to login');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  // Register function
  const register = async (userData: RegisterData) => {
    setIsLoading(true);
    try {
      const registerData = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        role: userData.role,
      };
      
      const response = await authService.register(registerData);
      
      if (response.success) {
        // Store JWT token if auto-login after registration
        if (response.access_token && response.user) {
          setUser(response.user);
          localStorage.setItem('user', JSON.stringify(response.user));
          localStorage.setItem('access_token', response.access_token);
          localStorage.setItem('token_type', response.token_type || 'bearer');
        }
        
        toast.success(response.message || 'Registration successful! You can now log in.');
        return true;
      }
      
      toast.error('Registration failed');
      return false;
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Failed to register');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  // Logout function
  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    setUser(null);
    toast.success('You have been logged out');
  };
  // Forgot password function
  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Check if email exists
      const userExists = mockUsers.some(u => u.email === email);
      if (!userExists) {
        // Don't reveal if email exists for security reasons
        toast.success('If your email is registered, you will receive a password reset link');
        return true;
      }
      // In a real app, this would send a password reset email
      toast.success('If your email is registered, you will receive a password reset link');
      return true;
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error('Failed to process request');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  // Reset password function
  const resetPassword = async (token: string, password: string) => {
    setIsLoading(true);
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      // In a real app, this would validate the token and update the password
      toast.success('Password reset successful! You can now login with your new password.');
      return true;
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Failed to reset password');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  // Activate account function
  const activateAccount = async (token: string) => {
    setIsLoading(true);
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      // In a real app, this would validate the token and activate the account
      toast.success('Account activated successfully! You can now login.');
      return true;
    } catch (error) {
      console.error('Account activation error:', error);
      toast.error('Failed to activate account');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    activateAccount
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
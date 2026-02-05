// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { authService } from "../services/authService";
import { initPushNotifications } from "../services/pushNotificationService";

// ---------------------------
// TYPES
// ---------------------------
interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "student" | "instructor" | "admin";
  status: number;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  passwordHint: string;
  role: "student" | "instructor" | "admin";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  tokenType: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
}

// ---------------------------
// CONTEXT
// ---------------------------
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------
// PROVIDER
// ---------------------------
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string | null>("Bearer");
  const [isLoading, setIsLoading] = useState(true);

  // Load stored login
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("access_token");
    const storedTokenType = localStorage.getItem("token_type");

    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedToken) setToken(storedToken);
    if (storedTokenType) setTokenType(storedTokenType);

    setIsLoading(false);
  }, []);

  // ---------------------------
  // LOGIN
  // ---------------------------
  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      const response = await authService.login(email, password);

      if (response.success && response.user) {
        // Save user
        setUser(response.user);
        localStorage.setItem("user", JSON.stringify(response.user));

        // Save JWT token
        if (response.access_token) {
          setToken(response.access_token);
          localStorage.setItem("access_token", response.access_token);

          setTokenType(response.token_type || "Bearer");
          localStorage.setItem("token_type", response.token_type || "Bearer");
        }

        toast.success("Login successful");
        
        // Initialize push notifications for students
        if (response.user.role === "student") {
          // Run in background, don't block login
          setTimeout(() => {
            initPushNotifications().then((success) => {
              if (success) {
                console.log("✅ Push notifications enabled");
              } else {
                console.log("ℹ️ Push notifications not available");
              }
            });
          }, 1000); // Wait 1 second after login
        }
        
        return true;
      }

      toast.error("Invalid credentials");
      return false;
    } catch (err: any) {
      console.error("Login failed:", err);
      toast.error("Login failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // REGISTER
  // ---------------------------
  const register = async (userData: RegisterData): Promise<boolean> => {
    setIsLoading(true);

    try {
      const response = await authService.register(userData);

      if (response.success) {
        toast.success("Registration successful! Please check your email to verify your account.");
        return true;
      }

      toast.error("Registration failed");
      return false;
    } catch (err: any) {
      const message = err.message || "Registration failed";
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // LOGOUT
  // ---------------------------
  const logout = () => {
    setUser(null);
    setToken(null);
    setTokenType("Bearer");

    localStorage.removeItem("user");
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_type");

    toast.success("Logged out successfully");
  };

  // User is only authenticated if both user AND token exist
  const isAuthenticated = !!(user && token);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        tokenType,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ---------------------------
// HOOK
// ---------------------------
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

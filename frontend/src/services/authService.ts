export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "student" | "instructor" | "admin";
  status: number;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "student" | "instructor" | "admin";
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
  emailSent?: boolean;
  user: {
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  emailSent?: boolean;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

// ✔ Correct API root — no slash, no /api
const API_BASE_URL = import.meta.env.VITE_API_URL;

const getAuthHeaders = () => {
  const token = sessionStorage.getItem("access_token");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const authService = {
  // REGISTER
  async register(userData: RegisterData): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Registration failed");
    return data;
  },

  // LOGIN
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Login failed");
    return data;
  },

  // GET USERS
  async getAllUsers(): Promise<User[]> {
    const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to fetch users");
    return data.users || [];
  },

  // VERIFY EMAIL
  async verifyEmail(token: string): Promise<VerifyEmailResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-email/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Email verification failed");
    return data;
  },

  // RESEND VERIFICATION EMAIL
  async resendVerification(email: string): Promise<VerifyEmailResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to resend verification");
    return data;
  },

  // FORGOT PASSWORD
  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to process request");
    return data;
  },

  // RESET PASSWORD
  async resetPassword(token: string, password: string): Promise<ResetPasswordResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to reset password");
    return data;
  },
};

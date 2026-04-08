import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';
import { api } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is already logged in on mount
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setLoading(false);
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await api.login(email, password);
      
      // Save auth data
      authService.saveAuthData(
        response.access_token,
        response.user_id,
        response.name
      );
      
      // Set user state
      const userData = {
        userId: response.user_id,
        userName: response.name,
        token: response.access_token
      };
      
      setUser(userData);
      return userData;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (email, password, name) => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await api.register(email, password, name);
      
      // Save auth data
      authService.saveAuthData(
        response.access_token,
        response.user_id,
        response.name
      );
      
      // Set user state
      const userData = {
        userId: response.user_id,
        userName: response.name,
        token: response.access_token
      };
      
      setUser(userData);
      return userData;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    authService.clearAuthData();
    setUser(null);
    setError(null);
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
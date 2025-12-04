import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('hermes_token'));

  // Configurar axios amb token
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Verificar token al carregar
  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API_URL}/api/auth/me`);
          setUser(response.data);
        } catch (error) {
          // Token invàlid
          localStorage.removeItem('hermes_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    verifyToken();
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username,
        password
      });

      if (response.data.status === 'success') {
        localStorage.setItem('hermes_token', response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
        return { success: true };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Error iniciant sessió'
      };
    }
  };

  const register = async (username, password, email, displayName) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        username,
        password,
        email,
        display_name: displayName
      });

      if (response.data.status === 'success') {
        localStorage.setItem('hermes_token', response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
        return { success: true };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Error registrant usuari'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('hermes_token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const updateProfile = async (data) => {
    try {
      const response = await axios.put(`${API_URL}/api/auth/profile`, data);
      if (response.data.status === 'success') {
        // Refrescar dades usuari
        const userResponse = await axios.get(`${API_URL}/api/auth/me`);
        setUser(userResponse.data);
        return { success: true };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Error actualitzant perfil'
      };
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isPremium: user?.is_premium || user?.is_admin || false, // Admins sempre són premium
    login,
    register,
    logout,
    updateProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth ha de ser usat dins de AuthProvider');
  }
  return context;
}

export default AuthContext;

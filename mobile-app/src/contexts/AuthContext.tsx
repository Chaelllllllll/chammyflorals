import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '../services/api';
import Sentry from '../../sentry.config';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  user: any;
  token: string | null;
  login: (token: string, userData: any) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthState();
  }, []);

  // Update ApiService token whenever token changes
  useEffect(() => {
    ApiService.setToken(token);
  }, [token]);

  const loadAuthState = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('authToken');
      const userData = await AsyncStorage.getItem('userData');
      
      if (storedToken && userData) {
        setIsAuthenticated(true);
        setToken(storedToken);
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsAdmin(parsedUser.role === 'admin');
      }
    } catch (error: any) {
      console.error('Failed to load auth state:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { context: 'AuthContext', action: 'loadAuthState' }
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (authToken: string, userData: any) => {
    try {
      await AsyncStorage.setItem('authToken', authToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      setIsAuthenticated(true);
      setToken(authToken);
      setUser(userData);
      setIsAdmin(userData.role === 'admin');
    } catch (error: any) {
      console.error('Failed to save auth state:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { context: 'AuthContext', action: 'login' },
          extra: { userRole: userData?.role }
        });
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      setIsAuthenticated(false);
      setToken(null);
      setUser(null);
      setIsAdmin(false);
    } catch (error: any) {
      console.error('Failed to clear auth state:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { context: 'AuthContext', action: 'logout' }
        });
      }
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAdmin, user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    console.error('useAuth must be used within an AuthProvider');
    if (Sentry && typeof Sentry.captureMessage === 'function') {
      Sentry.captureMessage('useAuth called outside AuthProvider', {
        level: 'error',
        tags: { context: 'AuthContext' }
      });
    }
    // Return a safe default instead of throwing
    return {
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      token: null,
      login: async () => {},
      logout: async () => {},
      loading: false
    };
  }
  return context;
};

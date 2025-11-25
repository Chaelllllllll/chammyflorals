import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import Sentry from '../../sentry.config';

export default function AccountScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const authContext = useAuth();
  const user = authContext?.user;
  const isAuthenticated = authContext?.isAuthenticated;

  useEffect(() => {
    console.log('AccountScreen mounted');
    console.log('Auth state:', { isAuthenticated, userId: user?.id, userRole: user?.role });
    
    try {
      if (authContext) {
        const adminStatus = isAuthenticated && user && user.role === 'admin';
        
        console.log('Setting admin status:', adminStatus);
        setIsAdmin(adminStatus);
        setUserName(user?.name || '');
        setUserEmail(user?.email || '');
      }
    } catch (error: any) {
      console.error('Auth context error in AccountScreen:', error);
      Sentry.captureException(error, {
        tags: { screen: 'AccountScreen', action: 'loadAuthState' }
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAuthenticated, user?.role, user?.name, user?.email]);

  const handleLogout = () => {
    console.log('Logout initiated');
    try {
      if (authContext?.logout) {
        authContext.logout();
        setIsAdmin(false);
        console.log('Logout successful');
        Alert.alert('Success', 'Logged out successfully');
      }
    } catch (error: any) {
      console.error('Logout error:', error);
      Sentry.captureException(error, {
        tags: { screen: 'AccountScreen', action: 'logout' }
      });
      Alert.alert('Error', 'Failed to logout');
    }
  };

  const navigateToScreen = (screenName: string) => {
    console.log('Navigating to:', screenName);
    try {
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate(screenName);
        console.log('Navigation successful');
      } else {
        console.warn('Parent navigator not found');
      }
    } catch (error: any) {
      console.error('Navigation error:', error);
      Sentry.captureException(error, {
        tags: { screen: 'AccountScreen', action: 'navigate', targetScreen: screenName }
      });
      Alert.alert('Error', 'Failed to navigate');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
      </View>
    );
  }

  if (isAdmin) {
    // Admin is logged in - show admin quick access
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#FF99BB', '#FF6F9B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.adminAvatar}>
            <Ionicons name="person" size={48} color="#fff" />
          </View>
          <Text style={styles.welcomeText}>Welcome back!</Text>
          <Text style={styles.adminName}>{userName}</Text>
          <Text style={styles.adminEmail}>{userEmail}</Text>
        </LinearGradient>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Panel</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateToScreen('AdminDashboard')}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="grid" size={24} color="#FF6F9B" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Admin Dashboard</Text>
                <Text style={styles.menuSubtext}>Manage your store</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateToScreen('AdminProducts')}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="cube" size={24} color="#FF6F9B" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Products</Text>
                <Text style={styles.menuSubtext}>Manage products</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateToScreen('AdminTransactions')}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="receipt" size={24} color="#FF6F9B" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Transactions</Text>
                <Text style={styles.menuSubtext}>View all orders</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateToScreen('AdminTodo')}
            >
              <View style={styles.menuIcon}>
                <Ionicons name="clipboard" size={24} color="#FF6F9B" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>To Do</Text>
                <Text style={styles.menuSubtext}>Pending orders</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Not logged in - show login option
  return (
    <View style={styles.container}>
      <View style={styles.notLoggedInContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={64} color="#FF6F9B" />
        </View>
        <Text style={styles.notLoggedInTitle}>Admin Access</Text>
        <Text style={styles.notLoggedInSubtext}>
          Login to access the admin panel
        </Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => navigateToScreen('AdminLogin')}>
          <Ionicons name="log-in-outline" size={24} color="#fff" />
          <Text style={styles.loginBtnText}>Admin Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF5F8',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  adminAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  welcomeText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.95,
    marginBottom: 4,
  },
  adminName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  adminEmail: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  menuSubtext: {
    fontSize: 13,
    color: '#6B7280',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#fff',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
  },
  notLoggedInContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  notLoggedInTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  notLoggedInSubtext: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FF6F9B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    shadowColor: '#FF6F9B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

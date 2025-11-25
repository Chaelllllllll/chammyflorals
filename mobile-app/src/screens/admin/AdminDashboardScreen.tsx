import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import ApiService from '../../services/api';

const { width } = Dimensions.get('window');

export default function AdminDashboardScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-width * 0.75)).current;
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    totalProducts: 0,
    totalReviews: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [orders, products, reviews] = await Promise.all([
        ApiService.getAdminOrders().catch(() => []),
        ApiService.getAdminProducts().catch(() => []),
        ApiService.getReviews().catch(() => []),
      ]);

      const pendingCount = orders?.filter((o: any) => 
        o.status === 'Pending' || o.status === 'Processing'
      ).length || 0;

      setStats({
        totalOrders: orders?.length || 0,
        pendingOrders: pendingCount,
        totalProducts: products?.length || 0,
        totalReviews: reviews?.length || 0,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const toggleMenu = () => {
    if (menuVisible) {
      Animated.timing(slideAnim, {
        toValue: -width * 0.75,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setMenuVisible(false));
    } else {
      setMenuVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const navigateTo = (screen: string) => {
    toggleMenu();
    setTimeout(() => {
      if (screen === 'Logout') {
        logout();
        navigation.replace('Home');
      } else {
        navigation.navigate(screen);
      }
    }, 300);
  };

  const menuItems = [
    { icon: 'grid-outline', label: 'Dashboard', screen: 'AdminDashboard' },
    { icon: 'cube-outline', label: 'Products', screen: 'AdminProducts' },
    { icon: 'star-outline', label: 'Reviews', screen: 'AdminReviews' },
    { icon: 'receipt-outline', label: 'Transactions', screen: 'AdminTransactions' },
    { icon: 'clipboard-outline', label: 'To Do', screen: 'AdminTodo' },
    { icon: 'car-outline', label: 'To Deliver', screen: 'AdminToDeliver' },
    { icon: 'people-outline', label: 'Admins', screen: 'AdminManage' },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#FF99BB', '#FF6F9B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={toggleMenu} style={styles.menuButton}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <View style={styles.placeholder} />
        </View>
        <Text style={styles.welcomeText}>Welcome back, {user?.name || 'Admin'}!</Text>
      </LinearGradient>

      {/* Dashboard Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6F9B']} />
        }
      >
        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#FFE5EC' }]}
            onPress={() => navigation.navigate('AdminTransactions')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FF6F9B' }]}>
              <Ionicons name="receipt" size={28} color="#fff" />
            </View>
            <Text style={styles.statValue}>{stats.totalOrders}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#FFF4E6' }]}
            onPress={() => navigation.navigate('AdminTodo')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FFA500' }]}>
              <Ionicons name="time" size={28} color="#fff" />
            </View>
            <Text style={styles.statValue}>{stats.pendingOrders}</Text>
            <Text style={styles.statLabel}>Pending Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}
            onPress={() => navigation.navigate('AdminProducts')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#4CAF50' }]}>
              <Ionicons name="cube" size={28} color="#fff" />
            </View>
            <Text style={styles.statValue}>{stats.totalProducts}</Text>
            <Text style={styles.statLabel}>Products</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}
            onPress={() => navigation.navigate('AdminReviews')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FFB300' }]}>
              <Ionicons name="star" size={28} color="#fff" />
            </View>
            <Text style={styles.statValue}>{stats.totalReviews}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AdminTodo')}
            >
              <Ionicons name="clipboard-outline" size={32} color="#FF6F9B" />
              <Text style={styles.actionLabel}>View To Do</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AdminToDeliver')}
            >
              <Ionicons name="car-outline" size={32} color="#FF6F9B" />
              <Text style={styles.actionLabel}>To Deliver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AdminProducts')}
            >
              <Ionicons name="add-circle-outline" size={32} color="#FF6F9B" />
              <Text style={styles.actionLabel}>Add Product</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AdminManage')}
            >
              <Ionicons name="people-outline" size={32} color="#FF6F9B" />
              <Text style={styles.actionLabel}>Manage Admins</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Drawer Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="none"
        onRequestClose={toggleMenu}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayTouch} onPress={toggleMenu} activeOpacity={1} />
          <Animated.View
            style={[
              styles.drawerMenu,
              {
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={['#FF99BB', '#FF6F9B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.drawerHeader}
            >
              <View style={styles.drawerHeaderContent}>
                <View style={styles.adminAvatar}>
                  <Ionicons name="person" size={32} color="#fff" />
                </View>
                <Text style={styles.drawerAdminName}>{user?.name || 'Admin'}</Text>
                <Text style={styles.drawerAdminEmail}>{user?.email || ''}</Text>
              </View>
            </LinearGradient>

            <ScrollView style={styles.drawerContent}>
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.drawerItem}
                  onPress={() => navigateTo(item.screen)}
                >
                  <View style={styles.drawerItemIcon}>
                    <Ionicons name={item.icon as any} size={24} color="#FF6F9B" />
                  </View>
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                </TouchableOpacity>
              ))}

              <View style={styles.drawerDivider} />

              <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Logout')}>
                <View style={[styles.drawerItemIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="log-out-outline" size={24} color="#EF4444" />
                </View>
                <Text style={[styles.drawerItemText, { color: '#EF4444' }]}>Logout</Text>
                <Ionicons name="chevron-forward" size={20} color="#EF4444" />
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
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
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 16,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  welcomeText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.95,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: (width - 44) / 2,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    padding: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: (width - 44) / 2,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  actionLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
  },
  overlayTouch: {
    flex: 1,
  },
  drawerMenu: {
    width: width * 0.75,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  drawerHeader: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  drawerHeaderContent: {
    alignItems: 'center',
  },
  adminAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  drawerAdminName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  drawerAdminEmail: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  drawerContent: {
    flex: 1,
    paddingTop: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  drawerItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  drawerItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
    marginHorizontal: 20,
  },
});

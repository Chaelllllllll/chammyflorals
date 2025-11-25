import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import ApiService from '../../services/api';

export default function AdminDashboardScreen({ navigation }: any) {
  const { logout, user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getDashboardStats();
      console.log('Dashboard stats:', data);
      setStats(data);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      Alert.alert('Error', `Failed to load dashboard data: ${error.message || 'Unknown error'}`);
      // Set default stats to prevent crashes
      setStats({
        total_orders: 0,
        pending_orders: 0,
        completed_orders: 0,
        total_revenue: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          await logout();
          navigation.replace('MainTabs');
        },
        style: 'destructive',
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6F9B" />
        <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 16 }}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.email || 'Admin'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={loadDashboardData} style={styles.refreshButton}>
            <Ionicons name="refresh-outline" size={24} color="#4B5563" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="cart-outline" size={40} color="#ff6f9b" />
          <Text style={styles.statValue}>{stats?.total_orders || 0}</Text>
          <Text style={styles.statLabel}>Total Orders</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="time-outline" size={40} color="#FFA500" />
          <Text style={styles.statValue}>{stats?.pending_orders || 0}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle-outline" size={40} color="#4CAF50" />
          <Text style={styles.statValue}>{stats?.completed_orders || 0}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="cash-outline" size={40} color="#2196F3" />
          <Text style={styles.statValue}>₱{stats?.total_revenue || 0}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>

      <View style={styles.quickActionsContainer}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminTodo')}
        >
          <Ionicons name="clipboard-outline" size={30} color="#FF9500" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>To Do</Text>
            <Text style={styles.actionDescription}>
              View pending orders
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminToDeliver')}
        >
          <Ionicons name="car-outline" size={30} color="#007AFF" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>To Deliver</Text>
            <Text style={styles.actionDescription}>
              Ready for delivery orders
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminOrders')}
        >
          <Ionicons name="list-outline" size={30} color="#ff6f9b" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>All Orders</Text>
            <Text style={styles.actionDescription}>
              View and manage all orders
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminProducts')}
        >
          <Ionicons name="flower-outline" size={30} color="#34C759" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Products</Text>
            <Text style={styles.actionDescription}>
              Manage product catalog
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminReviews')}
        >
          <Ionicons name="star-outline" size={30} color="#FFD700" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Reviews</Text>
            <Text style={styles.actionDescription}>
              Moderate customer reviews
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('AdminReports')}
        >
          <Ionicons name="bar-chart-outline" size={30} color="#5856D6" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Reports</Text>
            <Text style={styles.actionDescription}>
              View sales analytics
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  userName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1F2937',
  },
  logoutButton: {
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
  },
  refreshButton: {
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 12,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    fontWeight: '500',
  },
  quickActionsContainer: {
    padding: 20,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  actionContent: {
    flex: 1,
    marginLeft: 16,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});

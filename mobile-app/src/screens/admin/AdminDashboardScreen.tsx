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
      const data = await ApiService.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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
        <ActivityIndicator size="large" color="#ff6f9b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.username || 'Admin'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#ff6f9b" />
        </TouchableOpacity>
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
          onPress={() => navigation.navigate('AdminOrders')}
        >
          <Ionicons name="list-outline" size={30} color="#ff6f9b" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Orders</Text>
            <Text style={styles.actionDescription}>
              View and update order status
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <Ionicons name="flower-outline" size={30} color="#ff6f9b" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Products</Text>
            <Text style={styles.actionDescription}>
              Add, edit, or remove products
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <Ionicons name="star-outline" size={30} color="#ff6f9b" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Reviews</Text>
            <Text style={styles.actionDescription}>
              Moderate customer reviews
            </Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <Ionicons name="bar-chart-outline" size={30} color="#ff6f9b" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Reports</Text>
            <Text style={styles.actionDescription}>
              View sales and analytics
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
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff6f9',
  },
  welcomeText: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 15,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  quickActionsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  actionContent: {
    flex: 1,
    marginLeft: 15,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  actionDescription: {
    fontSize: 12,
    color: '#666',
  },
});

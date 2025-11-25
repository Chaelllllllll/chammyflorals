import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService, { Order } from '../../services/api';

export default function AdminTodoScreen({ navigation }: any) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getAdminOrders();
      const todoOrders = (data || []).filter(
        o => o.status === 'Pending' || o.status === 'Processing'
      );
      setOrders(todoOrders);
    } catch (error) {
      Alert.alert('Error', 'Failed to load to-do orders');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, newStatus);
      Alert.alert('Success', `Order updated to ${newStatus}`);
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'Failed to update order');
    }
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>#{item.order_id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'Pending' ? '#FFA50020' : '#2196F320' }]}>
          <Text style={[styles.statusText, { color: item.status === 'Pending' ? '#FFA500' : '#2196F3' }]}>
            {item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.orderName}>{item.name || item.customer_name}</Text>
      <Text style={styles.orderFlower}>
        {Array.isArray(item.flower_type) ? item.flower_type.join(', ') : item.flower_type}
      </Text>
      <Text style={styles.orderTotal}>₱{(item.total_fee || 0).toFixed(2)}</Text>
      
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
          onPress={() => item.order_id && updateStatus(item.order_id, 'Processing')}
        >
          <Text style={styles.actionText}>Process</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#34C759' }]}
          onPress={() => item.order_id && updateStatus(item.order_id, 'To Receive')}
        >
          <Text style={styles.actionText}>Ready</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>To Do</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6F9B']} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#4CAF50" />
            <Text style={styles.emptyText}>All caught up!</Text>
            <Text style={styles.emptySubtext}>No pending orders</Text>
          </View>
        }
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  placeholder: {
    width: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  list: {
    padding: 16,
  },
  orderCard: {
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
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6F9B',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  orderName: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  orderFlower: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});

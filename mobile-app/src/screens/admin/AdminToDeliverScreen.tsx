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

export default function AdminToDeliverScreen({ navigation }: any) {
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
      const deliverOrders = (data || []).filter(o => o.status === 'To Receive');
      setOrders(deliverOrders);
    } catch (error) {
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const markAsDelivered = async (orderId: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, 'Delivered');
      Alert.alert('Success', 'Order marked as delivered');
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'Failed to update order');
    }
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>#{item.order_id}</Text>
        <View style={styles.statusBadge}>
          <Ionicons name="cube" size={14} color="#34C759" />
          <Text style={styles.statusText}>To Receive</Text>
        </View>
      </View>
      <Text style={styles.orderName}>{item.name || item.customer_name}</Text>
      {item.delivery_address && (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={16} color="#6B7280" />
          <Text style={styles.orderAddress}>{item.delivery_address}</Text>
        </View>
      )}
      {item.delivery_date && (
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <Text style={styles.orderDate}>
            {new Date(item.delivery_date).toLocaleDateString()}
          </Text>
        </View>
      )}
      <Text style={styles.orderTotal}>₱{(item.total_fee || 0).toFixed(2)}</Text>
      
      <TouchableOpacity
        style={styles.deliveredBtn}
        onPress={() => item.order_id && markAsDelivered(item.order_id)}
      >
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={styles.deliveredText}>Mark as Delivered</Text>
      </TouchableOpacity>
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
        <Text style={styles.title}>To Deliver</Text>
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
            <Ionicons name="car-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No deliveries pending</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#34C75920',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34C759',
  },
  orderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  orderAddress: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  orderDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
  },
  deliveredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 10,
  },
  deliveredText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
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
});

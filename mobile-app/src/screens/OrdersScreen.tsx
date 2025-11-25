import React, { useState, useEffect, useCallback } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '../services/api';

interface Order {
  id: number;
  order_id: string;
  customer_name: string;
  flower_type: string;
  quantity: number;
  total_price: number;
  status: string;
  delivery_date?: string;
  created_at: string;
  items?: any[];
}

const STATUS_COLORS: { [key: string]: string } = {
  pending: '#ffc107',
  processing: '#2196f3',
  'to receive': '#9c27b0',
  delivered: '#4caf50',
  cancelled: '#f44336',
};

const STATUS_ICONS: { [key: string]: any } = {
  pending: 'time-outline',
  processing: 'hammer-outline',
  'to receive': 'cube-outline',
  delivered: 'checkmark-circle-outline',
  cancelled: 'close-circle-outline',
};

export default function OrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadOrders = async () => {
    try {
      // Get user's phone number or email from AsyncStorage
      const userPhone = await AsyncStorage.getItem('userPhone');
      const userEmail = await AsyncStorage.getItem('userEmail');

      if (!userPhone && !userEmail) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Fetch all orders and filter by user
      const allOrders = await ApiService.getOrders();
      const userOrders = allOrders.filter((order: any) => 
        order.customer_phone === userPhone || 
        order.customer_email === userEmail
      );

      // Sort by created_at descending
      userOrders.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setOrders(userOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
      Alert.alert('Error', 'Failed to load your orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, []);

  const getFilteredOrders = () => {
    if (filterStatus === 'all') return orders;
    return orders.filter(order => order.status.toLowerCase() === filterStatus);
  };

  const renderStatusFilter = () => {
    const statuses = ['all', 'pending', 'processing', 'to receive', 'delivered', 'cancelled'];
    
    return (
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={statuses}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === item && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus(item)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === item && styles.filterButtonTextActive,
                ]}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const status = item.status.toLowerCase();
    const statusColor = STATUS_COLORS[status] || '#999';
    const statusIcon = STATUS_ICONS[status] || 'help-outline';

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => {
          Alert.alert(
            'Order Details',
            `Order ID: ${item.order_id}\n` +
            `Status: ${item.status}\n` +
            `Items: ${item.flower_type}\n` +
            `Quantity: ${item.quantity}\n` +
            `Total: ₱${item.total_price}\n` +
            `Date: ${new Date(item.created_at).toLocaleDateString()}`,
            [{ text: 'OK' }]
          );
        }}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderIdContainer}>
            <Text style={styles.orderIdLabel}>Order ID</Text>
            <Text style={styles.orderIdText}>{item.order_id}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Ionicons name={statusIcon} size={14} color="#fff" />
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.orderBody}>
          <Text style={styles.orderItem}>{item.flower_type}</Text>
          <Text style={styles.orderQuantity}>Qty: {item.quantity}</Text>
          {item.delivery_date && (
            <Text style={styles.orderDate}>
              Delivery: {new Date(item.delivery_date).toLocaleDateString()}
            </Text>
          )}
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>₱{item.total_price}</Text>
          <Text style={styles.orderCreated}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff6f9b" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  const filteredOrders = getFilteredOrders();

  return (
    <View style={styles.container}>
      {renderStatusFilter()}

      {filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>
            {filterStatus === 'all' 
              ? 'Place your first order to see it here!'
              : `No ${filterStatus} orders`}
          </Text>
          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => navigation.navigate('Products')}
          >
            <Text style={styles.shopButtonText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#ff6f9b']}
              tintColor="#ff6f9b"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  filterContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#ff6f9b',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 15,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderIdContainer: {
    flex: 1,
  },
  orderIdLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  orderBody: {
    marginBottom: 10,
  },
  orderItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  orderQuantity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6f9b',
  },
  orderCreated: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
  shopButton: {
    marginTop: 20,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: '#ff6f9b',
    borderRadius: 25,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

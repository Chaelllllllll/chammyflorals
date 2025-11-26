import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';

import { API_URL } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCustomAlert } from '../hooks/useCustomAlert';
import CustomAlert from '../components/CustomAlert';

// Use canonical API URL from services/api

interface Order {
  order_id: string;
  name?: string;
  customer_name?: string;
  email?: string;
  customer_email?: string;
  phone?: string;
  customer_phone?: string;
  status: string;
  total_fee?: number;
  total_amount?: number;
  created_at: string;
  items?: any[];
  delivery_address?: string;
  delivery_date?: string;
  message?: string;
  fb_link?: string;
}

const STATUS_COLORS: { [key: string]: string } = {
  pending: '#fbbf24',
  processing: '#3b82f6',
  'to receive': '#10b981',
  delivered: '#22c55e',
  cancelled: '#ef4444',
};

const STATUS_ICONS: { [key: string]: any } = {
  pending: 'time-outline',
  processing: 'construct-outline',
  'to receive': 'cube-outline',
  delivered: 'checkmark-circle-outline',
  cancelled: 'close-circle-outline',
};

export default function MyOrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<any>(null);
  const { showAlert, hideAlert, alertConfig, visible: alertVisible } = useCustomAlert();

  useFocusEffect(
    useCallback(() => {
      loadUserOrders();
    }, [])
  );

  // Listen for incoming push notifications and update orders when status updates arrive
  const notificationListener = useRef<any>(null);

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(async (notification) => {
      try {
        const data = notification?.request?.content?.data || {};
        if (data && (data.type === 'status_update' || data.type === 'order_update') && data.orderId) {
          // Fetch latest order info and update list
          await updateOrderFromServer(String(data.orderId));
        }
      } catch (err) {
        console.warn('Failed to handle incoming notification:', err);
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
    };
  }, [userEmail, orders]);

  const loadUserOrders = async () => {
    setLoading(true);
    try {
      // Try to get user email from storage
      const savedEmail = await AsyncStorage.getItem('userEmail');
      
      // If user hasn't saved an email, fall back to device-local cached orders
      if (!savedEmail) {
        setUserEmail('');
        try {
          const cached = await AsyncStorage.getItem('cachedOrders:device');
          if (cached) {
            const parsed = JSON.parse(cached);
            setOrders(Array.isArray(parsed) ? parsed : []);
            // do not return here - we'll attempt a network fetch below only if we have an email/phone
          } else {
            setOrders([]);
          }
        } catch (e) {
          setOrders([]);
        }
      } else {
        setUserEmail(savedEmail);
      }

      // Fetch orders for this email
      let response: Response | null = null;
      if (savedEmail) {
        try {
          response = await fetch(`${API_URL}/api/orders/by-email/${encodeURIComponent(savedEmail)}`);
        } catch (fetchErr) {
          response = null;
        }
      }

      if (response && response.ok) {
        const data = await response.json();
        // Sort by created_at descending
        const sortedOrders = (data || []).sort((a: Order, b: Order) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setOrders(sortedOrders);
        // Cache orders for offline access
        try { 
          if (savedEmail) await AsyncStorage.setItem(`cachedOrders:${savedEmail}`, JSON.stringify(sortedOrders));
          // also mirror to device cache so orders created on this device are always visible
          await AsyncStorage.setItem('cachedOrders:device', JSON.stringify(sortedOrders));
        } catch (e) {}
      } else {
        // Attempt to load cached orders when network fails or server returns error
        try {
          const cached = await AsyncStorage.getItem(`cachedOrders:${savedEmail}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            setOrders(Array.isArray(parsed) ? parsed : []);
            showAlert('Offline', 'Showing cached orders. Pull to refresh when online.');
          } else {
            // If the server didn't respond or there is no savedEmail, try fetching by device push token
            if (!savedEmail) {
              try {
                const pushToken = await AsyncStorage.getItem('expoPushToken');
                if (pushToken) {
                  const tokenResp = await fetch(`${API_URL}/api/orders/by-token/${encodeURIComponent(pushToken)}`);
                  if (tokenResp && tokenResp.ok) {
                    const tokenData = await tokenResp.json();
                    const sortedOrders = (tokenData || []).sort((a: Order, b: Order) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    setOrders(sortedOrders);
                    await AsyncStorage.setItem('cachedOrders:device', JSON.stringify(sortedOrders));
                    return;
                  }
                }
              } catch (tErr) {
                // ignore token fetch errors
              }
            }
            if (response) {
              const data = await response.json().catch(() => ({}));
              showAlert('Error', data.error || 'Failed to load orders');
            } else {
              showAlert('Network Error', 'Could not reach server to load orders');
            }
            setOrders([]);
          }
        } catch (cacheErr) {
          setOrders([]);
        }
      }

      // Always try to sync with server by push token for devices without email
      try {
        const pushToken = await AsyncStorage.getItem('expoPushToken');
        if (pushToken) {
          const tokenResp = await fetch(`${API_URL}/api/orders/by-token/${encodeURIComponent(pushToken)}`);
          if (tokenResp && tokenResp.ok) {
            const tokenData = await tokenResp.json();
            if (Array.isArray(tokenData) && tokenData.length) {
              const sortedTokenOrders = tokenData.sort((a: Order, b: Order) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              setOrders(sortedTokenOrders);
              await AsyncStorage.setItem('cachedOrders:device', JSON.stringify(sortedTokenOrders));
            }
          }
        }
      } catch (tokenSyncErr) {
        // ignore token sync failures
      }
    } catch (error: any) {
      console.error('Failed to load orders:', error);
      showAlert('Error', error.message || 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch a single order from server (track endpoint) and merge/update local list
  const updateOrderFromServer = async (orderId: string) => {
    try {
      const resp = await fetch(`${API_URL}/api/track/${encodeURIComponent(orderId)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const mapped: Order = {
        order_id: data.orderId || orderId,
        status: data.status || 'pending',
        created_at: data.created_at || new Date().toISOString(),
        items: data.items || [],
        total_fee: data.total_fee || data.total_amount || 0,
      } as Order;

      setOrders(prev => {
        const exists = prev.some(p => String(p.order_id) === String(mapped.order_id));
        const next = exists ? prev.map(p => (String(p.order_id) === String(mapped.order_id) ? { ...p, ...mapped } : p)) : [mapped, ...prev];
        // persist cache
        if (userEmail) {
          AsyncStorage.setItem(`cachedOrders:${userEmail}`, JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
    } catch (err) {
      console.warn('Failed to update order from server:', err);
    }
  };

  const promptEmailEntry = () => {
    // Navigate to account or show input
    navigation.navigate('Account');
  };

  const syncDeviceOrders = async () => {
    setIsSyncing(true);
    try {
      const pushToken = await AsyncStorage.getItem('expoPushToken');
      if (!pushToken) {
        showAlert('No Push Token', 'Push token not found on this device. Ensure notifications are enabled.');
        return;
      }
      const url = `${API_URL}/api/orders/by-token/${encodeURIComponent(pushToken)}`;
      console.log('[MyOrders] Sync by token:', url);
      const resp = await fetch(url);
      let bodyText = '';
      try { bodyText = await resp.text(); } catch (e) { bodyText = ''; }
      // Try parse JSON if possible
      let parsed: any = null;
      try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch (e) { parsed = bodyText; }
      setLastSyncInfo({ url, status: resp.status, body: parsed });
      if (!resp.ok) {
        console.warn('[MyOrders] Sync failed', resp.status, parsed || resp.statusText);
        showAlert('Sync Failed', `Server returned ${resp.status}: ${JSON.stringify(parsed) || resp.statusText}`);
        return;
      }
      const data = parsed;
      const sortedOrders = (data || []).sort((a: Order, b: Order) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(sortedOrders);
      await AsyncStorage.setItem('cachedOrders:device', JSON.stringify(sortedOrders));
      if (!sortedOrders.length) {
        showAlert('No Orders', 'No server-side orders were found for this device.');
      }
    } catch (err: any) {
      console.warn('[MyOrders] Device sync error:', err);
      // Provide a helpful message for Expo Go differences
      const msg = err?.message || String(err);
      showAlert('Error', `Failed to sync device orders: ${msg}. If you are using Expo Go, push tokens and server registration can behave differently — try on a standalone build or ensure notifications are enabled.`);
    } finally {
      setIsSyncing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUserOrders();
  }, []);

  const getFilteredOrders = () => {
    if (!searchQuery.trim()) return orders;
    
    const query = searchQuery.toLowerCase();
    return orders.filter(order => 
      order.order_id?.toLowerCase().includes(query) ||
      order.status?.toLowerCase().includes(query)
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const statusKey = (item.status || '').toLowerCase();
    const statusColor = STATUS_COLORS[statusKey] || '#6b7280';
    const statusIcon = STATUS_ICONS[statusKey] || 'help-circle-outline';
    const totalAmount = item.total_fee || item.total_amount || 0;

    return (
      <TouchableOpacity 
        style={styles.orderCard}
        onPress={() => openOrderDetails(item)}
      >
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderId}>#{item.order_id}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Ionicons name={statusIcon} size={16} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.orderBody}>
          {item.items && item.items.length > 0 ? (
            <Text style={styles.itemsText}>
              {item.items.length} item{item.items.length > 1 ? 's' : ''}
            </Text>
          ) : null}
          <Text style={styles.totalText}>₱{totalAmount.toFixed(2)}</Text>
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.viewDetails}>View Details</Text>
          <Ionicons name="chevron-forward" size={20} color="#ff6f9b" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={80} color="#d1d5db" />
      <Text style={styles.emptyText}>No orders yet</Text>
      <Text style={styles.emptySubtext}>
        Start shopping to see your orders here
      </Text>  
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff6f9b" />
      </View>
    );
  }

  const filteredOrders = getFilteredOrders();

  return (
    <View style={styles.container}>
      {alertConfig && (
        <CustomAlert
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          buttons={alertConfig.buttons}
          type={alertConfig.type}
          onDismiss={hideAlert}
        />
      )}

      {orders.length > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by order ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.order_id}
        contentContainerStyle={filteredOrders.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#ff6f9b']}
            tintColor="#ff6f9b"
          />
        }
      />

      

      {/* Order Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedOrder && (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Order ID</Text>
                    <Text style={styles.detailValue}>#{selectedOrder.order_id}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Status</Text>
                    {(() => {
                      const selStatusKey = (selectedOrder.status || '').toLowerCase();
                      const selColor = STATUS_COLORS[selStatusKey] || '#6b7280';
                      const selIcon = STATUS_ICONS[selStatusKey] || 'help-circle-outline';
                      return (
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: selColor + '20' }
                        ]}>
                          <Ionicons 
                            name={selIcon} 
                            size={16} 
                            color={selColor} 
                          />
                          <Text style={[
                            styles.statusText, 
                            { color: selColor }
                          ]}>
                            {selectedOrder.status}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Date Ordered</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedOrder.created_at)}</Text>
                  </View>

                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Items</Text>
                      {selectedOrder.items.map((item, index) => (
                        <View key={index} style={styles.itemRow}>
                          <Text style={styles.itemName}>
                            {item.name || item.flower_type || 'Item'} × {item.quantity || 1}
                          </Text>
                          {item.price && (
                            <Text style={styles.itemPrice}>₱{item.price.toFixed(2)}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Total Amount</Text>
                    <Text style={styles.totalAmount}>
                      ₱{(selectedOrder.total_fee || selectedOrder.total_amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  {selectedOrder.delivery_address && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Delivery Address</Text>
                      <Text style={styles.detailValue}>{selectedOrder.delivery_address}</Text>
                    </View>
                  )}

                  {selectedOrder.message && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Message</Text>
                      <Text style={styles.detailValue}>{selectedOrder.message}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  orderBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemsText: {
    fontSize: 14,
    color: '#6b7280',
  },
  totalText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff6f9b',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  viewDetails: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6f9b',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  shopButton: {
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 16,
    color: '#1f2937',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginTop: 6,
  },
  itemName: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6f9b',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ff6f9b',
  },
  messengerSection: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  messengerText: {
    fontSize: 14,
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  messengerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0084ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  messengerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

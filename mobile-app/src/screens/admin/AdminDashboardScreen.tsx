import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import CustomAlert from '../../components/CustomAlert';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://chamfloral.vercel.app';

interface Order {
  order_id: string;
  name: string;
  email: string;
  fb_link: string;
  phone?: string;
  status: string;
  total_fee: number;
  created_at: string;
  items?: any[];
  flower_type?: string;
  quantity?: number;
  addons?: string[];
  message?: string;
  rush?: string;
}

const AdminDashboardScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<Order>>({});
  const { showAlert, hideAlert, alertConfig, visible: alertVisible } = useCustomAlert();

  const loadOrders = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) {
        showAlert('Error', 'Please login first');
        return;
      }

      const verifyResponse = await fetch(`${API_URL}/api/admin/verify-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!verifyResponse.ok) {
        await AsyncStorage.multiRemove(['adminToken', 'adminUserName', 'adminUserEmail']);
        showAlert('Error', 'Session expired. Please login again.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login')
          }
        ]);
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok) {
        // Filter out delivered and "to receive" orders
        const activeOrders = (data || []).filter((order: Order) => {
          const status = order.status.toLowerCase();
          return status !== 'delivered' && status !== 'to receive';
        });
        setOrders(activeOrders);
        applyFilters(activeOrders, searchQuery, statusFilter);
      } else {
        showAlert('Error', data.error || 'Failed to load orders');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error loading orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (orderList: Order[], search: string, status: string) => {
    let filtered = orderList;

    if (status) {
      filtered = filtered.filter(
        (order) => order.status.toLowerCase() === status.toLowerCase()
      );
    }

    if (search) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.order_id.toLowerCase().includes(query) ||
          order.name.toLowerCase().includes(query) ||
          order.email.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    setFilteredOrders(filtered);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(orders, text, statusFilter);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    applyFilters(orders, searchQuery, status);
  };

  const handleOrderPress = (order: Order) => {
    setSelectedOrder(order);
    setEditMode(false);
    setModalVisible(true);
  };

  const handleEditOrder = () => {
    if (selectedOrder) {
      setEditData({
        name: selectedOrder.name,
        email: selectedOrder.email,
        message: selectedOrder.message,
        rush: selectedOrder.rush,
        status: selectedOrder.status,
        total_fee: selectedOrder.total_fee,
      });
      setEditMode(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;

    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/orders/${selectedOrder.order_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editData),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('Success', 'Order updated successfully', [
          {
            text: 'OK',
            onPress: () => {
              setModalVisible(false);
              setEditMode(false);
              loadOrders(false);
            }
          }
        ], 'success');
      } else {
        showAlert('Error', data.error || 'Failed to update order');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error updating order');
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('Success', 'Order status updated', undefined, 'success');
        setModalVisible(false);
        loadOrders(false);
      } else {
        showAlert('Error', data.error || 'Failed to update status');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error updating status');
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const openFacebookLink = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(() => {
        showAlert('Error', 'Cannot open Facebook link');
      });
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders(false);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return '#fbbf24';
      case 'processing':
        return '#3b82f6';
      case 'to receive':
        return '#10b981';
      case 'delivered':
        return '#22c55e';
      case 'cancelled':
        return '#6b7280';
      default:
        return '#9ca3af';
    }
  };

  const getStatusCount = (status: string) => {
    return orders.filter(
      (order) => order.status.toLowerCase() === status.toLowerCase()
    ).length;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff69b4" />
      </View>
    );
  }

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

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{orders.length}</Text>
          <Text style={styles.statLabel}>Total Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#fbbf24' }]}>{getStatusCount('Pending')}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#3b82f6' }]}>{getStatusCount('Processing')}</Text>
          <Text style={styles.statLabel}>Processing</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff69b4', padding: 14, borderRadius: 12 }}
          onPress={() => navigation.navigate('Products')}
        >
          <Ionicons name="flower-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Manage Products</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Order ID, name, or email..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: 16, marginBottom: 16, flexGrow: 0 }}
        contentContainerStyle={{ gap: 8 }}
      >
        <TouchableOpacity
          style={[styles.filterBadge, !statusFilter && { backgroundColor: '#ff69b4' }]}
          onPress={() => handleStatusFilter('')}
        >
          <Text style={[styles.filterText, !statusFilter && { color: '#fff', fontWeight: '600' }]}>
            All
          </Text>
        </TouchableOpacity>
        {['Pending', 'Processing'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterBadge, statusFilter === status && { backgroundColor: '#ff69b4' }]}
            onPress={() => handleStatusFilter(status)}
          >
            <Text style={[styles.filterText, statusFilter === status && { color: '#fff', fontWeight: '600' }]}>
              {status}
            </Text>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 }}>
              <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>{getStatusCount(status)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff69b4']} />}
      >
        {filteredOrders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Ionicons name="document-text-outline" size={64} color="#d1d5db" />
            <Text style={{ marginTop: 16, fontSize: 16, color: '#9ca3af' }}>No matching orders</Text>
          </View>
        ) : (
          filteredOrders.map((order) => (
            <TouchableOpacity
              key={order.order_id}
              style={styles.orderCard}
              onPress={() => handleOrderPress(order)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ff69b4' }}>{order.order_id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{order.status}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, color: '#333', marginBottom: 4, fontWeight: '500' }}>{order.name}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{order.email}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#10b981' }}>₱{Number(order.total_fee).toLocaleString()}</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(order.created_at).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                {editMode ? 'Edit Order' : 'Order Details'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              {selectedOrder && !editMode && (
                <View>
                  {[
                    { label: 'Order ID', value: selectedOrder.order_id },
                    { label: 'Customer', value: selectedOrder.name },
                    { label: 'Email', value: selectedOrder.email },
                    { label: 'Flower Type', value: selectedOrder.flower_type || '-' },
                    { label: 'Quantity', value: String(selectedOrder.quantity || 0) },
                    { label: 'Message', value: selectedOrder.message || '-' },
                    { label: 'Rush Order', value: selectedOrder.rush || 'No' },
                    { label: 'Total Fee', value: `₱${Number(selectedOrder.total_fee).toLocaleString()}` },
                    { label: 'Status', value: selectedOrder.status },
                    { label: 'Order Date', value: formatDateTime(selectedOrder.created_at) },
                  ].map((item, i) => (
                    <View key={i} style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{item.label}:</Text>
                      <Text style={{ fontSize: 16, color: '#333' }}>{item.value}</Text>
                    </View>
                  ))}

                  {selectedOrder.fb_link && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Facebook:</Text>
                      <TouchableOpacity onPress={() => openFacebookLink(selectedOrder.fb_link)}>
                        <Text style={{ fontSize: 16, color: '#3b82f6', textDecorationLine: 'underline' }}>View Profile</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {selectedOrder && editMode && (
                <View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Customer Name:</Text>
                    <TextInput
                      style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                      value={editData.name}
                      onChangeText={(text) => setEditData({ ...editData, name: text })}
                    />
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Email:</Text>
                    <TextInput
                      style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                      value={editData.email}
                      onChangeText={(text) => setEditData({ ...editData, email: text })}
                      keyboardType="email-address"
                    />
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Message:</Text>
                    <TextInput
                      style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, minHeight: 80 }}
                      value={editData.message}
                      onChangeText={(text) => setEditData({ ...editData, message: text })}
                      multiline
                    />
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Rush Order:</Text>
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                      <TouchableOpacity
                        style={{ padding: 12 }}
                        onPress={() => {
                          const options = ['No', 'Yes'];
                          const currentIndex = options.indexOf(editData.rush || 'No');
                          const nextIndex = (currentIndex + 1) % options.length;
                          setEditData({ ...editData, rush: options[nextIndex] });
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#333' }}>{editData.rush || 'No'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Status:</Text>
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
                      {['Pending', 'Processing', 'To Receive', 'Cancelled'].map((status, index) => (
                        <TouchableOpacity
                          key={status}
                          style={{
                            padding: 12,
                            backgroundColor: editData.status === status ? '#f3f4f6' : 'transparent',
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: '#e5e7eb',
                          }}
                          onPress={() => setEditData({ ...editData, status })}
                        >
                          <Text style={{ fontSize: 16, color: editData.status === status ? '#ff69b4' : '#333', fontWeight: editData.status === status ? '600' : '400' }}>
                            {status}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Fee:</Text>
                    <TextInput
                      style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                      value={String(editData.total_fee || 0)}
                      onChangeText={(text) => setEditData({ ...editData, total_fee: parseFloat(text) || 0 })}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={{ marginTop: 24 }}>
                    <TouchableOpacity
                      style={{ padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#10b981' }}
                      onPress={handleSaveEdit}
                    >
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save Changes</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 }}>
              {editMode ? (
                <>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' }}
                    onPress={() => setEditMode(false)}
                  >
                    <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' }}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff69b4' }}
                    onPress={handleEditOrder}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Edit Order</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  statsContainer: { flexDirection: 'row', padding: 16, gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff6f9', padding: 16, borderRadius: 12, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#ff69b4' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', margin: 16, marginTop: 0, paddingHorizontal: 12, borderRadius: 8 },
  searchInput: { flex: 1, height: 40, fontSize: 14 },
  filterBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6' },
  filterText: { fontSize: 14, color: '#6b7280' },
  orderCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
});

export default AdminDashboardScreen;

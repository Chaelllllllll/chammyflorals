import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService, { Order } from '../../services/api';

export default function OrderDetailsScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editedOrder, setEditedOrder] = useState<Partial<Order>>({});

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getOrderById(orderId);
      setOrder(data);
      setEditedOrder(data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load order details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    Alert.alert(
      'Change Status',
      `Change order status to ${newStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await ApiService.updateOrderStatus(orderId, newStatus);
              Alert.alert('Success', `Order status changed to ${newStatus}`);
              loadOrder();
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to delete this order? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteOrder(orderId);
              Alert.alert('Success', 'Order deleted');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete order');
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    try {
      await ApiService.updateOrder(orderId, editedOrder);
      Alert.alert('Success', 'Order updated successfully');
      setEditModalVisible(false);
      loadOrder();
    } catch (error) {
      Alert.alert('Error', 'Failed to update order');
    }
  };

  const openFacebookLink = () => {
    if (order?.fb_link) {
      Linking.openURL(order.fb_link);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Order not found</Text>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#34C759';
      case 'to deliver': return '#007AFF';
      case 'todo': case 'pending': return '#FF9500';
      case 'cancelled': return '#FF3B30';
      default: return '#6B7280';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editBtn}>
          <Ionicons name="create-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderId}>#{order.order_id}</Text>
            {order.rush === 'yes' && (
              <View style={styles.rushBadge}>
                <Ionicons name="flash" size={14} color="#fff" />
                <Text style={styles.rushText}>RUSH ORDER</Text>
              </View>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
            <Text style={styles.statusText}>{order.status}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <InfoRow icon="person" label="Name" value={order.name || order.customer_name} />
          <InfoRow icon="mail" label="Email" value={order.email || order.customer_email} />
          <InfoRow icon="call" label="Phone" value={order.phone || order.customer_phone} />
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <Ionicons name="logo-facebook" size={20} color="#4B5563" />
              <Text style={styles.label}>Facebook</Text>
            </View>
            <TouchableOpacity onPress={openFacebookLink}>
              <Text style={styles.linkValue} numberOfLines={1}>
                {order.fb_link || 'Not provided'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          <InfoRow icon="flower" label="Flower Type" value={order.flower_type} />
          <InfoRow icon="cube" label="Quantity" value={String(order.quantity)} />
          {order.items && order.items.length > 0 && (
            <View style={styles.itemsList}>
              <Text style={styles.itemsTitle}>Items:</Text>
              {order.items.map((item: any, index: number) => (
                <View key={index} style={styles.itemCard}>
                  <Text style={styles.itemName}>{item.flower_type || item.flower}</Text>
                  <Text style={styles.itemQty}>Qty: {item.quantity || item.qty || 1}</Text>
                  {item.color && <Text style={styles.itemDetail}>Color: {item.color}</Text>}
                </View>
              ))}
            </View>
          )}
          {order.addons && order.addons.length > 0 && (
            <View style={styles.addonsContainer}>
              <Text style={styles.addonsLabel}>Add-ons:</Text>
              {order.addons.map((addon: string, index: number) => (
                <View key={index} style={styles.addonBadge}>
                  <Text style={styles.addonText}>{addon}</Text>
                </View>
              ))}
            </View>
          )}
          <InfoRow icon="chatbubble" label="Message" value={order.message || 'Not provided'} multiline />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Information</Text>
          <InfoRow icon="calendar" label="Delivery Date" value={order.delivery_date || 'Not specified'} />
          <InfoRow icon="location" label="Delivery Address" value={order.delivery_address || 'Not specified'} multiline />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow icon="cash" label="Total Fee" value={`₱${(order.total_fee || order.total_price || order.price || 0).toFixed(2)}`} />
          <InfoRow icon="time" label="Order Date" value={new Date(order.created_at).toLocaleString()} />
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.toDeliverBtn]}
            onPress={() => handleStatusChange('To Deliver')}
          >
            <Ionicons name="car" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Mark To Deliver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deliveredBtn]}
            onPress={() => handleStatusChange('Delivered')}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Mark Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelBtn]}
            onPress={() => handleStatusChange('Cancelled')}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Cancel Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteBtn]}
            onPress={handleDelete}
          >
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Delete Order</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Order</Text>
            <TouchableOpacity onPress={handleSaveEdit}>
              <Ionicons name="checkmark" size={28} color="#FF6F9B" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Customer Name</Text>
            <TextInput
              style={styles.input}
              value={editedOrder.name || editedOrder.customer_name}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, name: text, customer_name: text })}
            />
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={editedOrder.email || editedOrder.customer_email}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, email: text, customer_email: text })}
              keyboardType="email-address"
            />
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editedOrder.phone || editedOrder.customer_phone}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, phone: text, customer_phone: text })}
              keyboardType="phone-pad"
            />
            <Text style={styles.inputLabel}>Flower Type</Text>
            <TextInput
              style={styles.input}
              value={editedOrder.flower_type}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, flower_type: text })}
            />
            <Text style={styles.inputLabel}>Quantity</Text>
            <TextInput
              style={styles.input}
              value={String(editedOrder.quantity || 0)}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, quantity: Number(text) || 0 })}
              keyboardType="numeric"
            />
            <Text style={styles.inputLabel}>Total Fee</Text>
            <TextInput
              style={styles.input}
              value={String(editedOrder.total_fee || editedOrder.total_price || editedOrder.price || 0)}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, total_fee: Number(text) || 0 })}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>Delivery Date</Text>
            <TextInput
              style={styles.input}
              value={editedOrder.delivery_date}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, delivery_date: text })}
            />
            <Text style={styles.inputLabel}>Delivery Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editedOrder.delivery_address}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, delivery_address: text })}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editedOrder.message}
              onChangeText={(text) => setEditedOrder({ ...editedOrder, message: text })}
              multiline
              numberOfLines={3}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const InfoRow = ({ icon, label, value, multiline }: any) => (
  <View style={styles.infoRow}>
    <View style={styles.infoLabel}>
      <Ionicons name={icon} size={20} color="#4B5563" />
      <Text style={styles.label}>{label}</Text>
    </View>
    <Text style={[styles.value, multiline && styles.multilineValue]} numberOfLines={multiline ? undefined : 1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  backBtn: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  editBtn: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
  },
  rushBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  rushText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  multilineValue: {
    textAlign: 'left',
  },
  linkValue: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  itemsList: {
    marginTop: 8,
    marginBottom: 12,
  },
  itemsTitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 8,
  },
  itemCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemQty: {
    fontSize: 13,
    color: '#6B7280',
  },
  itemDetail: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  addonsContainer: {
    marginTop: 8,
  },
  addonsLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 8,
  },
  addonBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  addonText: {
    fontSize: 12,
    color: '#6B21A8',
    fontWeight: '600',
  },
  actionsCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  toDeliverBtn: {
    backgroundColor: '#007AFF',
  },
  deliveredBtn: {
    backgroundColor: '#34C759',
  },
  cancelBtn: {
    backgroundColor: '#FF9500',
  },
  deleteBtn: {
    backgroundColor: '#FF3B30',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});

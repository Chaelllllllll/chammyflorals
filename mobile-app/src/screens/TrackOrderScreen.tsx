import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService from '../services/api';

export default function TrackOrderScreen() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    if (!orderId.trim()) {
      Alert.alert('Enter Order ID', 'Please enter your order ID to track your order.');
      return;
    }

    setLoading(true);
    setOrder(null);
    try {
      const orderData = await ApiService.trackOrder(orderId.trim());
      setOrder(orderData);
    } catch (error: any) {
      if (error.message === 'ORDER_NOT_FOUND') {
        Alert.alert(
          'Order Not Found',
          `No order found with ID "${orderId.trim()}". Please check your order ID and try again.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Connection Error',
          'Unable to track your order. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return '#FFA500';
      case 'confirmed':
        return '#2196F3';
      case 'preparing':
        return '#9C27B0';
      case 'out for delivery':
        return '#FF9800';
      case 'delivered':
        return '#4CAF50';
      case 'cancelled':
        return '#F44336';
      default:
        return '#999';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="location" size={60} color="#ff6f9b" />
          <Text style={styles.title}>Track Your Order</Text>
          <Text style={styles.subtitle}>
            Enter your order ID to check the status
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter Order ID"
            placeholderTextColor="#999"
            value={orderId}
            onChangeText={setOrderId}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.trackButton}
            onPress={handleTrack}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="search" size={20} color="#fff" />
                <Text style={styles.trackButtonText}>Track</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {order && (
          <View style={styles.orderDetails}>
            <View style={styles.statusContainer}>
              <Text style={styles.statusLabel}>Status:</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(order.status) },
                ]}
              >
                <Text style={styles.statusText}>
                  {order.status?.toUpperCase() || 'UNKNOWN'}
                </Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>Order Information</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Order ID:</Text>
                <Text style={styles.detailValue}>#{order.orderId}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Customer Name:</Text>
                <Text style={styles.detailValue}>{order.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Flower Type:</Text>
                <Text style={styles.detailValue}>{order.flower_type}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity:</Text>
                <Text style={styles.detailValue}>{order.quantity}</Text>
              </View>
              {order.addons && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Add-ons:</Text>
                  <Text style={styles.detailValue}>{order.addons}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total Amount:</Text>
                <Text style={[styles.detailValue, styles.priceText]}>
                  ₱{order.total_fee || 0}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Order Date:</Text>
                <Text style={styles.detailValue}>
                  {new Date(order.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {order.message && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>Special Instructions</Text>
                <Text style={styles.messageText}>{order.message}</Text>
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>Order Timeline</Text>
              <View style={styles.timelineItem}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <Text style={styles.timelineText}>Order Placed</Text>
              </View>
              {order.status !== 'pending' && (
                <View style={styles.timelineItem}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={styles.timelineText}>Order Confirmed</Text>
                </View>
              )}
              {['preparing', 'out for delivery', 'delivered'].includes(
                order.status?.toLowerCase()
              ) && (
                <View style={styles.timelineItem}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={styles.timelineText}>Preparing</Text>
                </View>
              )}
              {['out for delivery', 'delivered'].includes(
                order.status?.toLowerCase()
              ) && (
                <View style={styles.timelineItem}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={styles.timelineText}>Out for Delivery</Text>
                </View>
              )}
              {order.status?.toLowerCase() === 'delivered' && (
                <View style={styles.timelineItem}>
                  <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  <Text style={styles.timelineText}>Delivered</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  searchContainer: {
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  trackButton: {
    backgroundColor: '#ff6f9b',
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  orderDetails: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  priceText: {
    color: '#ff6f9b',
    fontWeight: 'bold',
    fontSize: 16,
  },
  messageText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
  },
});

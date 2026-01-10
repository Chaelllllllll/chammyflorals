import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCart } from '../contexts/CartContext';
import ApiService, { API_URL } from '../services/api';
import Sentry from '../../sentry.config';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function CheckoutScreen({ navigation }: any) {
  const { items, total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const { alertConfig, visible, showAlert, hideAlert } = useCustomAlert();
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    delivery_address: '',
    delivery_date: '',
    message: '',
  });

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.customer_phone) {
      showAlert('Error', 'Please fill in required fields (Name and Phone)');
      return;
    }

    setLoading(true);
    try {
      // Push notifications disabled — do not read token
      const pushToken = null;

      const orderData = {
        ...formData,
        items: items.map((item) => ({
          flower_type: `${item.name} - ${item.variant || ''}`,
          quantity: item.quantity,
          price: item.price,
        })),
        total_amount: total,
        expo_push_token: undefined,
      };

      const order = await ApiService.createOrder(orderData);
      // The server returns { message, orderId } for inquiries. Fetch the full order record using the returned orderId.
      let fullOrder: any = null;
      const returnedOrderId = (order && (((order as any).orderId) || ((order as any).order_id) || ((order as any).id))) || null;
      if (returnedOrderId) {
        try {
          const trackResp = await fetch(`${API_URL}/api/track/${encodeURIComponent(returnedOrderId)}`);
          if (trackResp && trackResp.ok) {
            fullOrder = await trackResp.json();
          }
        } catch (e) {
          // ignore
        }
      }
      
      // Save user email to AsyncStorage for viewing orders later
      if (formData.customer_email) {
        await AsyncStorage.setItem('userEmail', formData.customer_email);
      }
      // Also save phone as backup
      if (formData.customer_phone) {
        await AsyncStorage.setItem('userPhone', formData.customer_phone);
      }
      // Cache the created order locally so My Orders can show it even without email
      try {
        const deviceKey = 'cachedOrders:device';
        const existing = await AsyncStorage.getItem(deviceKey);
        let list = [] as any[];
        if (existing) {
          list = JSON.parse(existing) || [];
        }
        // Normalize returned order (server may return numeric id or object)
        const savedOrder = fullOrder || (order && order.order_id ? order : (order && order.id ? { order_id: order.id, ...order } : (returnedOrderId ? { order_id: returnedOrderId, ...order } : order)));
        if (savedOrder) {
          // prepend newest
          list = [savedOrder, ...list.filter(o => String(o.order_id) !== String(savedOrder.order_id))];
          await AsyncStorage.setItem(deviceKey, JSON.stringify(list));
        }
      } catch (cacheErr) {
        // ignore cache failures
      }
      
      clearCart();
      navigation.replace('OrderSuccess', { orderId: returnedOrderId || order.id });
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { screen: 'CheckoutScreen', action: 'createOrder' },
        extra: { orderData: { customer_name: formData.customer_name, items_count: items.length } }
      });
      console.error('Checkout error:', error);
      showAlert('Error', 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Order Summary</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.orderItem}>
            <Text style={styles.orderItemName}>
              {item.name} {item.variant && `(${item.variant})`}
            </Text>
            <Text style={styles.orderItemDetails}>
              {item.quantity} x ₱{item.price} = ₱{(item.quantity * item.price).toFixed(2)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>₱{total.toFixed(2)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Delivery Information</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name *"
          placeholderTextColor="#999"
          value={formData.customer_name}
          onChangeText={(text) => setFormData({ ...formData, customer_name: text })}
        />

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#999"
          value={formData.customer_email}
          onChangeText={(text) => setFormData({ ...formData, customer_email: text })}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Phone Number *"
          placeholderTextColor="#999"
          value={formData.customer_phone}
          onChangeText={(text) => setFormData({ ...formData, customer_phone: text })}
          keyboardType="phone-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="Delivery Address"
          placeholderTextColor="#999"
          value={formData.delivery_address}
          onChangeText={(text) => setFormData({ ...formData, delivery_address: text })}
          multiline
          numberOfLines={3}
        />

        <TextInput
          style={styles.input}
          placeholder="Preferred Delivery Date (e.g., Dec 25, 2025)"
          placeholderTextColor="#999"
          value={formData.delivery_date}
          onChangeText={(text) => setFormData({ ...formData, delivery_date: text })}
        />

        <TextInput
          style={styles.input}
          placeholder="Special Message or Instructions"
          placeholderTextColor="#999"
          value={formData.message}
          onChangeText={(text) => setFormData({ ...formData, message: text })}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Place Order</Text>
          )}
        </TouchableOpacity>
      </View>
      <CustomAlert
        visible={visible}
        title={alertConfig?.title || ''}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onDismiss={hideAlert}
        type={alertConfig?.type}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
    marginBottom: 15,
  },
  orderItem: {
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  orderItemDetails: {
    fontSize: 14,
    color: '#666',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ff6f9b',
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
  submitButton: {
    backgroundColor: '#ff6f9b',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

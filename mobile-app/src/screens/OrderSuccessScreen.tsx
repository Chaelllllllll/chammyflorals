import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  Linking 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://chamfloral.vercel.app';

export default function OrderSuccessScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/api/track/${encodeURIComponent(orderId)}`);
      const data = await response.json();
      
      if (response.ok) {
        setOrderData(data);
      }
    } catch (error) {
      console.error('Failed to load order details:', error);
    } finally {
      setLoading(false);
    }
  };

  const openMessenger = () => {
    Linking.openURL('https://www.messenger.com/t/847673415097754').catch(() => {
      alert('Cannot open Messenger');
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6f9b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={['#fff0f5', '#ffffff']}
        style={styles.header}
      >
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
        </View>
        <Text style={styles.title}>Order Placed Successfully! 🎉</Text>
        <Text style={styles.subtitle}>Thank you for your order!</Text>
        <Text style={styles.description}>
          We've received your order and will contact you soon.
        </Text>
      </LinearGradient>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="receipt-outline" size={24} color="#ff6f9b" />
          <Text style={styles.cardTitle}>Order Summary</Text>
        </View>

        <View style={styles.trackingIdBox}>
          <Text style={styles.trackingLabel}>Tracking ID</Text>
          <Text style={styles.trackingId}>#{orderId}</Text>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
            <Text style={styles.infoText}>Save this ID to track your order</Text>
          </View>
        </View>

        {orderData && (
          <>
            {orderData.items && orderData.items.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Order Items</Text>
                {orderData.items.map((item: any, index: number) => (
                  <View key={index} style={styles.itemRow}>
                    <View style={styles.itemBadge}>
                      <Text style={styles.itemBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.itemName}>
                      {item.name || item.flower_type || 'Item'}
                    </Text>
                    <Text style={styles.itemQuantity}>×{item.quantity || 1}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Quantity</Text>
                <Text style={styles.summaryValue}>
                  {orderData.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Status</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{orderData.status || 'Pending'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalAmount}>
                ₱{(orderData.total_fee || orderData.total_amount || 0).toFixed(2)}
              </Text>
            </View>
          </>
        )}

        <View style={styles.nextStepsBox}>
          <View style={styles.nextStepsHeader}>
            <Ionicons name="time-outline" size={20} color="#3b82f6" />
            <Text style={styles.nextStepsTitle}>What's Next?</Text>
          </View>
          <Text style={styles.nextStepsText}>
            We'll process your order and send you updates via email and Messenger. 
            Expected processing time: 1-2 business days.
          </Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.actionsTitle}>Quick Actions</Text>
        
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Track', { initialOrderId: orderId })}
        >
          <Ionicons name="location-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Track Order</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Orders')}
        >
          <Ionicons name="receipt-outline" size={20} color="#ff6f9b" />
          <Text style={styles.secondaryButtonText}>View My Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
        >
          <Ionicons name="home-outline" size={20} color="#ff6f9b" />
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.messengerCard}>
        <Ionicons name="chatbubble-ellipses-outline" size={32} color="#0084ff" />
        <Text style={styles.messengerTitle}>Get Updates via Messenger</Text>
        <Text style={styles.messengerText}>
          Send "track {orderId}" to our Messenger for real-time order updates
        </Text>
        <TouchableOpacity style={styles.messengerButton} onPress={openMessenger}>
          <Ionicons name="logo-facebook" size={20} color="#fff" />
          <Text style={styles.messengerButtonText}>Open Messenger</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  trackingIdBox: {
    backgroundColor: '#fef3f8',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde4ef',
    marginBottom: 20,
  },
  trackingLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  trackingId: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ff6f9b',
    marginBottom: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    color: '#6b7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  itemBadge: {
    backgroundColor: '#ff6f9b',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  itemQuantity: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  statusBadge: {
    backgroundColor: '#fbbf2420',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fbbf24',
    textTransform: 'capitalize',
  },
  totalSection: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ff6f9b',
  },
  nextStepsBox: {
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  nextStepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  nextStepsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  nextStepsText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  actionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  actionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ff6f9b',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ff6f9b',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#ff6f9b',
    fontSize: 16,
    fontWeight: '600',
  },
  messengerCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  messengerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 12,
    marginBottom: 8,
  },
  messengerText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  messengerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0084ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  messengerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

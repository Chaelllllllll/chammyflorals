import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService, { Product } from '../services/api';
import Sentry from '../../sentry.config';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

interface OrderItem {
  flower_type: string;
  color: string;
  quantity: number;
}

interface PricingOption {
  label?: string;
  set?: string;
  price: number;
}

type ProductWithPricing = Product;

export default function InquiryScreen({ route, navigation }: any) {
  const { product }: { product?: Product } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductWithPricing[]>([]);
  const [itemProducts, setItemProducts] = useState<{ [key: number]: ProductWithPricing | null }>({});
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const { alertConfig, visible, showAlert, hideAlert } = useCustomAlert();
  
  const [formData, setFormData] = useState({
    user_name: '',
    user_email: '',
    fb_link: '',
    message: '',
    rush: 'No',
  });
  
  // Initialize with product if passed from ProductDetail
  const getInitialFlowerType = () => {
    if (product?.pricing && product.pricing.length > 0) {
      const firstPricing = product.pricing[0];
      return (firstPricing.label || firstPricing.set || '').toString().trim();
    }
    return '';
  };
  
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { flower_type: getInitialFlowerType(), color: '', quantity: 1 }
  ]);

  useEffect(() => {
    loadProducts();
    // If product was passed, set it as the initial product for item 0
    if (product) {
      setItemProducts({ 0: product as ProductWithPricing });
    }
  }, []);

  const loadProducts = async () => {
    try {
      const data = await ApiService.getProducts();
      console.log('Loaded products:', data);
      setProducts(data);
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { screen: 'InquiryScreen', action: 'loadProducts' }
      });
      console.error('Failed to load products:', error);
    }
  };

  // Get all pricing options grouped by category
  // If a specific product was passed (from Order Now button), only show that product's options
  const getPricingOptions = () => {
    const groupedOptions: { [category: string]: Array<{ label: string; value: string; product: ProductWithPricing }> } = {};
    
    // If coming from a specific product, only show that product's pricing
    const productsToShow = product ? [product as ProductWithPricing] : products;
    
    productsToShow.forEach((prod) => {
      const category = prod.category || 'Uncategorized';
      
      if (!groupedOptions[category]) {
        groupedOptions[category] = [];
      }
      
      if (prod.pricing && Array.isArray(prod.pricing)) {
        prod.pricing.forEach((pricing) => {
          const code = (pricing.label || pricing.set || '').toString().trim();
          if (!code) return; // Skip if no code
          
          const parts = [];
          if (pricing.set) parts.push(String(pricing.set));
          if (pricing.price != null) parts.push(`₱${pricing.price}`);
          const displayText = `${code}${parts.length ? ' - ' + parts.join(' - ') : ''}`;
          
          groupedOptions[category].push({
            label: displayText,
            value: code,
            product: prod
          });
        });
      }
    });
    
    console.log('Pricing options:', groupedOptions);
    return groupedOptions;
  };

  const handleFlowerTypeChange = (index: number, value: string) => {
    updateItem(index, 'flower_type', value);
    updateItem(index, 'color', ''); // Reset color when flower type changes
    
    // Find the product that has this pricing option
    const pricingOptions = getPricingOptions();
    let foundProduct: ProductWithPricing | null = null;
    for (const category in pricingOptions) {
      const option = pricingOptions[category].find(opt => opt.value === value);
      if (option) {
        foundProduct = option.product;
        break;
      }
    }
    
    // Store the product for this specific item
    setItemProducts(prev => ({ ...prev, [index]: foundProduct }));
  };

  const toggleAddon = (addon: string) => {
    if (selectedAddons.includes(addon)) {
      setSelectedAddons(selectedAddons.filter(a => a !== addon));
    } else {
      setSelectedAddons([...selectedAddons, addon]);
    }
  };

  const addItem = () => {
    setOrderItems([...orderItems, { flower_type: '', color: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  const handleSubmit = async () => {
    // Validate form
    if (!formData.user_name.trim() || !formData.user_email.trim() || !formData.fb_link.trim()) {
      showAlert('Missing Information', 'Please fill in all personal information fields (name, email, and Facebook link).', undefined, 'warning');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.user_email.trim())) {
      showAlert('Invalid Email', 'Please enter a valid email address.', undefined, 'warning');
      return;
    }

    // Validate items
    const invalidItem = orderItems.find(item => !item.flower_type || !item.color || item.quantity < 1);
    if (invalidItem) {
      showAlert('Incomplete Order', 'Please fill in all item details (flower type, color, and quantity) for each item.', undefined, 'warning');
      return;
    }

    setLoading(true);
    try {
      // Save user info for order tracking (store the email and name entered)
      if (formData.user_email) {
        await AsyncStorage.setItem('userEmail', formData.user_email);
      }
      if (formData.user_name) {
        await AsyncStorage.setItem('userName', formData.user_name);
      }
      
      // Get push token if available
      const expoPushToken = await AsyncStorage.getItem('expoPushToken');
      
      // Create order data - map form fields to canonical keys expected by the API
      const orderData = {
        name: formData.user_name,
        email: formData.user_email,
        fb_link: formData.fb_link,
        message: formData.message,
        rush: formData.rush,
        items: orderItems,
        addons: selectedAddons.join(', '),
        expo_push_token: expoPushToken || null, // Include for push notifications
      };

      await ApiService.createInquiry(orderData);
      
      showAlert(
        'Order Submitted! 🎉',
        'Thank you for your order! We will contact you shortly via Facebook Messenger to confirm your order details and arrange delivery.',
        [
          { 
            text: 'OK', 
            onPress: () => navigation.goBack() 
          }
        ],
        'success'
      );
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { screen: 'InquiryScreen', action: 'createInquiry' },
        extra: { userName: formData.user_name, itemsCount: orderItems.length }
      });
      showAlert(
        'Submission Failed',
        'Unable to submit your order. Please check your internet connection and try again. If the problem persists, please contact us directly via Facebook.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Place Your Order</Text>
          <Text style={styles.headerSubtitle}>
            Fill in the details below to create your custom bouquet
          </Text>
        </View>

        {/* Step 1: Personal Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#999"
            value={formData.user_name}
            onChangeText={(text) => setFormData({ ...formData, user_name: text })}
          />

          <Text style={styles.label}>Email Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={formData.user_email}
            onChangeText={(text) => setFormData({ ...formData, user_email: text })}
          />

          <Text style={styles.label}>Facebook Account Link *</Text>
          <TextInput
            style={styles.input}
            placeholder="https://facebook.com/yourprofile"
            placeholderTextColor="#999"
            autoCapitalize="none"
            value={formData.fb_link}
            onChangeText={(text) => setFormData({ ...formData, fb_link: text })}
          />
        </View>

        {/* Step 2: Select Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.sectionTitle}>Select Your Items</Text>
          </View>

          {orderItems.map((item, index) => (
            <View key={index} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemBadge}>Item {index + 1}</Text>
                {orderItems.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeItem(index)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.label}>Flower Type *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={item.flower_type}
                  onValueChange={(value) => handleFlowerTypeChange(index, value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Flower Type" value="" />
                  {Object.entries(getPricingOptions()).flatMap(([category, options]) =>
                    options
                      .filter(option => option.label && option.value)
                      .map((option, idx) => (
                        <Picker.Item 
                          key={`${category}-${idx}`} 
                          label={`${option.label}`}
                          value={option.value} 
                        />
                      ))
                  )}
                </Picker>
              </View>

              <Text style={styles.label}>Color *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={item.color}
                  onValueChange={(value) => updateItem(index, 'color', value)}
                  style={styles.picker}
                  enabled={!!item.flower_type}
                >
                  <Picker.Item label="Select Color" value="" />
                  {item.flower_type && itemProducts[index]?.colors && itemProducts[index]!.colors!.length > 0 ? (
                    itemProducts[index]!.colors!.map((color, idx) => (
                      <Picker.Item 
                        key={idx} 
                        label={color.name} 
                        value={color.name} 
                      />
                    ))
                  ) : item.flower_type ? (
                    <>
                      <Picker.Item label="Red" value="Red" />
                      <Picker.Item label="Pink" value="Pink" />
                      <Picker.Item label="White" value="White" />
                      <Picker.Item label="Yellow" value="Yellow" />
                      <Picker.Item label="Purple" value="Purple" />
                      <Picker.Item label="Blue" value="Blue" />
                      <Picker.Item label="Orange" value="Orange" />
                      <Picker.Item label="Mixed" value="Mixed" />
                    </>
                  ) : null}
                </Picker>
              </View>

              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={item.quantity.toString()}
                onChangeText={(text) => updateItem(index, 'quantity', parseInt(text) || 1)}
              />
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>+ Add Another Item</Text>
          </TouchableOpacity>
        </View>

        {/* Step 3: Add-ons (Show only if any selected product has add-ons) */}
        {Object.values(itemProducts).some(p => p?.addons && p.addons.length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.sectionTitle}>Add-ons</Text>
            </View>

            <View style={styles.addonsGrid}>
              {Object.values(itemProducts)
                .filter(p => p?.addons && p.addons.length > 0)
                .flatMap(p => p!.addons!)
                .filter((addon, idx, self) => {
                  const label = typeof addon === 'string' ? addon : addon.label;
                  return self.findIndex(a => {
                    const aLabel = typeof a === 'string' ? a : a.label;
                    return aLabel === label;
                  }) === idx;
                })
                .map((addon, index) => {
                  const addonLabel = typeof addon === 'string' ? addon : addon.label;
                  const addonPrice = typeof addon === 'string' ? null : addon.price;
                  const addonValue = addonPrice ? `${addonLabel} - ₱${addonPrice}` : addonLabel;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.checkboxRow}
                      onPress={() => toggleAddon(addonValue)}
                    >
                      <View style={[
                        styles.checkbox,
                        selectedAddons.includes(addonValue) && styles.checkboxChecked
                      ]}>
                        {selectedAddons.includes(addonValue) && (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>{addonLabel}</Text>
                      {addonPrice && (
                        <View style={styles.addonPriceBadge}>
                          <Text style={styles.addonPriceBadgeText}>₱{addonPrice}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}

        {/* Step 4 (or 3 if no addons): Additional Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>
                {Object.values(itemProducts).some(p => p?.addons?.length) ? '4' : '3'}
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Additional Details</Text>
          </View>

          <Text style={styles.label}>Special Message or Instructions</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add any special requests or messages for your order..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={formData.message}
            onChangeText={(text) => setFormData({ ...formData, message: text })}
          />

          <Text style={styles.label}>Rush Order?</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={formData.rush}
              onValueChange={(value) => setFormData({ ...formData, rush: value })}
              style={styles.picker}
            >
              <Picker.Item label="No - Standard Processing" value="No" />
              <Picker.Item label="Yes - Rush Order (additional fee may apply)" value="Yes" />
            </Picker>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>🛍️ Place Order Now</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          🔒 Your information is secure and will only be used to process your order
        </Text>
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
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 16,
  },
  header: {
    backgroundColor: '#ff6f9b',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ff6f9b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 100,
  },
  pickerContainer: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  itemCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemBadge: {
    backgroundColor: '#ff6f9b',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    fontWeight: 'bold',
    fontSize: 12,
  },
  removeButton: {
    backgroundColor: '#dc3545',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addButton: {
    borderWidth: 2,
    borderColor: '#ff6f9b',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#ff6f9b',
    fontWeight: '600',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#ff6f9b',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disclaimer: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 12,
    marginTop: 12,
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ff6f9b',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#ff6f9b',
  },
  addonsGrid: {
    marginTop: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },
  addonPriceBadge: {
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  addonPriceBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  addonLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  addonPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff6f9b',
  },
});

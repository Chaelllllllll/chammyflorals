import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useCart } from '../contexts/CartContext';
import { Product } from '../services/api';

export default function ProductDetailScreen({ route, navigation }: any) {
  const { product }: { product: Product } = route.params;
  const { addItem } = useCart();
  const [selectedVariant, setSelectedVariant] = useState(
    product.pricing && product.pricing.length > 0 ? product.pricing[0] : null
  );
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    if (!selectedVariant) {
      Alert.alert('Error', 'Please select a variant');
      return;
    }

    addItem({
      id: product.id,
      name: product.name,
      price: selectedVariant.price,
      quantity,
      variant: selectedVariant.label || selectedVariant.set,
      image_url: product.image_url,
    });

    Alert.alert('Success', 'Added to cart!', [
      { text: 'Continue Shopping', style: 'cancel' },
      { text: 'View Cart', onPress: () => navigation.navigate('Cart') },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Image
        source={{ uri: product.image_url || 'https://via.placeholder.com/400' }}
        style={styles.productImage}
      />

      <View style={styles.contentContainer}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productCategory}>{product.category}</Text>
        <Text style={styles.productDescription}>{product.description}</Text>

        {/* Pricing Options */}
        {product.pricing && product.pricing.length > 0 && (
          <View style={styles.pricingSection}>
            <Text style={styles.sectionTitle}>Select Option:</Text>
            {product.pricing.map((price, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.variantButton,
                  selectedVariant === price && styles.variantButtonActive,
                ]}
                onPress={() => setSelectedVariant(price)}
              >
                <Text
                  style={[
                    styles.variantText,
                    selectedVariant === price && styles.variantTextActive,
                  ]}
                >
                  {price.label || price.set} - ₱{price.price}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quantity Selector */}
        <View style={styles.quantitySection}>
          <Text style={styles.sectionTitle}>Quantity:</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(quantity + 1)}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Total Price */}
        {selectedVariant && (
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalPrice}>
              ₱{(selectedVariant.price * quantity).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Add to Cart Button */}
        <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  productImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  contentContainer: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  productCategory: {
    fontSize: 16,
    color: '#ff6f9b',
    marginBottom: 15,
  },
  productDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  pricingSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  variantButton: {
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  variantButtonActive: {
    backgroundColor: '#fff6f9',
    borderColor: '#ff6f9b',
  },
  variantText: {
    fontSize: 16,
    color: '#666',
  },
  variantTextActive: {
    color: '#ff6f9b',
    fontWeight: '600',
  },
  quantitySection: {
    marginBottom: 20,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    backgroundColor: '#ff6f9b',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: '600',
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: 'center',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff6f9b',
  },
  addToCartButton: {
    backgroundColor: '#ff6f9b',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addToCartText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

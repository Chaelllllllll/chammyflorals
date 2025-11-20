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

  return (
    <ScrollView style={styles.container}>
      <Image
        source={{ uri: product.image_url || 'https://via.placeholder.com/400' }}
        style={styles.productImage}
      />

      <View style={styles.contentContainer}>
        <View style={styles.headerSection}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconText}>🌸</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productCategory}>{product.category}</Text>
          </View>
        </View>

        {product.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionText}>{product.description}</Text>
          </View>
        )}

        {/* Pricing Options */}
        {product.pricing && product.pricing.length > 0 && (
          <View style={styles.pricingSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>🏷️</Text>
              <Text style={styles.sectionTitle}>Pricing Options</Text>
            </View>
            <View style={styles.priceTable}>
              <View style={styles.priceTableHeader}>
                <Text style={styles.priceTableHeaderText}>Flower Type</Text>
                <Text style={styles.priceTableHeaderText}>Set</Text>
                <Text style={[styles.priceTableHeaderText, styles.textRight]}>Price</Text>
              </View>
              {product.pricing.map((price, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.priceTableRow,
                    index % 2 === 0 ? styles.priceTableRowEven : styles.priceTableRowOdd
                  ]}
                >
                  <Text style={styles.priceTableCell}>{price.label || '-'}</Text>
                  <Text style={styles.priceTableCellMuted}>{price.set || '-'}</Text>
                  <View style={styles.priceBadgeContainer}>
                    <Text style={styles.priceBadge}>₱{price.price}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Available Colors */}
        {product.colors && Array.isArray(product.colors) && product.colors.length > 0 && (
          <View style={styles.colorsSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>🎨</Text>
              <Text style={styles.sectionTitle}>Available Colors</Text>
            </View>
            <View style={styles.colorsGrid}>
              {product.colors.map((color: any, index: number) => (
                <View key={index} style={styles.colorCard}>
                  <View style={[styles.colorCircle, { backgroundColor: color.value }]} />
                  <Text style={styles.colorName}>{color.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Add-ons */}
        {product.addons && Array.isArray(product.addons) && product.addons.length > 0 && (
          <View style={styles.addonsSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>🎁</Text>
              <Text style={styles.sectionTitle}>Available Add-ons</Text>
            </View>
            <View style={styles.addonsGrid}>
              {product.addons.map((addon: any, index: number) => {
                const label = typeof addon === 'string' ? addon : addon.label;
                const price = typeof addon === 'string' ? null : addon.price;
                
                return (
                  <View key={index} style={styles.addonCard}>
                    <View style={styles.addonContent}>
                      <Text style={styles.addonIcon}>🎁</Text>
                      <Text style={styles.addonLabel}>{label}</Text>
                    </View>
                    {price && <Text style={styles.addonPrice}>₱{price}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Order Button */}
        <TouchableOpacity 
          style={styles.orderButton} 
          onPress={() => navigation.navigate('Inquiry', { product })}
        >
          <Text style={styles.orderButtonText}>🛍️ Order Now</Text>
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
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#fff6f9',
    padding: 15,
    borderRadius: 12,
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconText: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  productCategory: {
    fontSize: 14,
    color: '#ff6f9b',
    fontWeight: '600',
  },
  descriptionSection: {
    marginBottom: 20,
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  pricingSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  priceTable: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  priceTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff6f9',
    padding: 12,
  },
  priceTableHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6f9b',
  },
  priceTableRow: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  priceTableRowEven: {
    backgroundColor: '#fff',
  },
  priceTableRowOdd: {
    backgroundColor: '#f8f9fa',
  },
  priceTableCell: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  priceTableCellMuted: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  priceBadgeContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  priceBadge: {
    backgroundColor: '#ff6f9b',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 'bold',
  },
  textRight: {
    textAlign: 'right',
  },
  colorsSection: {
    marginBottom: 20,
  },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorCard: {
    width: '22%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  colorCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  colorName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
  addonsSection: {
    marginBottom: 20,
  },
  addonsGrid: {
    gap: 8,
  },
  addonCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
  },
  addonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  addonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  addonPrice: {
    backgroundColor: '#ff6f9b',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 'bold',
  },
  orderButton: {
    backgroundColor: '#ff6f9b',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  orderButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

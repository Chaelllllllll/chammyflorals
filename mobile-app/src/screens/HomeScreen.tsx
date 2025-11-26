import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService, { Product } from '../services/api';
import { TextInput, FlatList, Modal } from 'react-native';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalVisible, setProductModalVisible] = useState(false);

  useEffect(() => {
    // Component mounted - load products for Collections
    loadProducts();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setTimeout(() => setRefreshing(false), 500);
  };

  const loadProducts = async (query = '') => {
    try {
      console.log('Loading products... query=', query);
      const all = await ApiService.getProducts();
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        setProducts(all.filter(p => (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)));
      } else {
        setProducts(all || []);
      }
    } catch (e) {
      console.warn('Failed to load products', e);
      setProducts([]);
    }
  };

  const openProductModal = (p: Product) => {
    setSelectedProduct(p);
    setProductModalVisible(true);
  };

  const closeProductModal = () => {
    setProductModalVisible(false);
    setSelectedProduct(null);
  };

  const groupProductsByCategory = (list: Product[]) => {
    const groups: Record<string, Product[]> = {};
    (list || []).forEach((p) => {
      const cat = p.category && String(p.category).trim() ? p.category : 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  };

  const renderProductDetails = (product: Product) => {
    return (
      <View>
        {/* Pricing */}
        {product.pricing && product.pricing.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Pricing Options</Text>
            {product.pricing.map((r, idx) => (
              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: idx < product.pricing.length - 1 ? 1 : 0, borderColor: '#f0e6ea' }}>
                <Text style={{ fontWeight: '600' }}>{r.label || r.set || '-'}</Text>
                <Text style={{ color: '#ff2d77' }}>₱{r.price}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Addons */}
        {product.addons && Array.isArray(product.addons) && product.addons.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Add-ons</Text>
            {product.addons.map((a: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < product.addons!.length - 1 ? 1 : 0, borderColor: '#f0e6ea' }}>
                <Text>{typeof a === 'string' ? a : a.label}</Text>
                <Text style={{ color: '#ff2d77' }}>₱{(typeof a === 'string' ? '' : a.price) || ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Colors */}
        {product.colors && Array.isArray(product.colors) && product.colors.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Available Colors</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {product.colors.map((c, idx) => {
                const value = (c as any).value || (c as any).hex || (c as any).color || '#eee';
                return (
                  <View key={idx} style={{ alignItems: 'center', marginRight: 8, marginBottom: 8 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: String(value), borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06 }} />
                    <Text style={{ fontSize: 12, marginTop: 6 }}>{c.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Fallback price */}
        {(!product.pricing || product.pricing.length === 0) && (
          <View style={{ paddingVertical: 16 }}>
            <Text style={{ color: '#666' }}>Contact us for pricing details</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff6f9b" colors={["#ff6f9b"]} />}
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.heroDecorTop}>🌸</Text>
          <Text style={styles.heroDecorBottom}>💐</Text>
          <Text style={styles.heroTitle}>Beautiful Bouquets & Keychains</Text>
          <Text style={styles.heroSubtitle}>
            Bloom with love — Chammy Florals crafts delicate, handcrafted bouquets and keepsakes for every occasion.
          </Text>
          <View style={styles.heroCtas}>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={() => navigation.navigate('Products')}
            >
              <Text style={styles.heroButtonText}>Order Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroButtonOutline}
              onPress={() => navigation.navigate('Orders')}
            >
              <Text style={styles.heroButtonOutlineText}>Track Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* CTA Section */}
          <View style={styles.searchSection}>
            <Text style={styles.sectionTitle}>Our Collections</Text>
            <Text style={styles.searchHint}>Handpicked & handcrafted — find the perfect arrangement</Text>
            <View style={styles.searchRow}>
              <TextInput
                value={searchQuery}
                onChangeText={(t) => { setSearchQuery(t); }}
                placeholder="Search products"
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => loadProducts(searchQuery)}
              />
              <TouchableOpacity style={styles.searchBtn} onPress={() => loadProducts(searchQuery)}>
                <Text style={styles.searchBtnText}>Search</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.productsContainer}>
              {/* Group products by category like the web */}
              {Object.entries(groupProductsByCategory(products)).map(([cat, items]) => (
                <View key={cat} style={{ marginBottom: 20 }}>
                  <View style={{ alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#ff2d77' }}>{cat}</Text>
                  </View>
                  <FlatList
                    data={items}
                    keyExtractor={(item) => String(item.id)}
                    numColumns={2}
                    columnWrapperStyle={styles.productRow}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.productCard} onPress={() => openProductModal(item)}>
                        <Image source={{ uri: item.image_url }} style={styles.productImage} />
                        <View style={styles.productBody}>
                          <Text numberOfLines={1} style={styles.productTitle}>{item.name}</Text>
                          <Text numberOfLines={2} style={styles.productDesc}>{item.description}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Product modal */}
          <Modal visible={productModalVisible} transparent animationType="slide" onRequestClose={closeProductModal}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, maxHeight: '85%' }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#f0e6ea' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#333' }}>{selectedProduct?.name}</Text>
                  <Text style={{ color: '#666', marginTop: 6 }}>View pricing details and available options</Text>
                </View>
                <ScrollView style={{ padding: 16 }}>
                  {selectedProduct && renderProductDetails(selectedProduct)}
                </ScrollView>
                <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#eee', padding: 12, borderRadius: 8, alignItems: 'center' }} onPress={closeProductModal}>
                    <Text>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#ff6f9b', padding: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => {
                    // navigate to Inquiry screen prefilled with this product
                    closeProductModal();
                    navigation.navigate('Inquiry', { product: selectedProduct });
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Order Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

      {/* Quick Links */}
      <View style={styles.quickLinks}>
        <TouchableOpacity
          style={styles.quickLinkCard}
          onPress={() => navigation.navigate('Orders')}
        >
          <Ionicons name="receipt-outline" size={30} color="#ff6f9b" />
          <Text style={styles.quickLinkText}>My Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLinkCard}
          onPress={() => navigation.navigate('Reviews')}
        >
          <Ionicons name="star-outline" size={30} color="#ff6f9b" />
          <Text style={styles.quickLinkText}>Reviews</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLinkCard}
          onPress={() => navigation.navigate('AdminLogin')}
        >
          <Ionicons name="shield-outline" size={30} color="#ff6f9b" />
          <Text style={styles.quickLinkText}>Admin</Text>
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
  hero: {
    backgroundColor: '#fff6f9',
    padding: 30,
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 50,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroDecorTop: {
    position: 'absolute',
    top: -20,
    left: 10,
    fontSize: 64,
    opacity: 0.12,
  },
  heroDecorBottom: {
    position: 'absolute',
    bottom: -20,
    right: 10,
    fontSize: 64,
    opacity: 0.12,
  },
  heroCtas: {
    flexDirection: 'row',
    marginTop: 12,
  },
  heroButtonOutline: {
    borderWidth: 1,
    borderColor: '#ff6f9b',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 8,
  },
  heroButtonOutlineText: {
    color: '#ff6f9b',
    fontSize: 16,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  heroButton: {
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  heroButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  featuresSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchHint: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#f3d7df',
  },
  searchBtn: {
    marginLeft: 8,
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  productsContainer: {
    marginTop: 8,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  productCard: {
    width: (width - 48) / 2,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0e6ea',
  },
  productImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f5f5f5',
  },
  productBody: {
    padding: 10,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  productDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureCard: {
    width: (width - 60) / 2,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 10,
    marginBottom: 5,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  ctaSection: {
    backgroundColor: '#fff6f9',
    padding: 30,
    alignItems: 'center',
    marginVertical: 20,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  ctaText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaButton: {
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickLinks: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    paddingBottom: 40,
  },
  quickLinkCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: (width - 60) / 2,
  },
  quickLinkText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});

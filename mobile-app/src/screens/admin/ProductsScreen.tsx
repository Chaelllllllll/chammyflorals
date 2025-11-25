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
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
// Image picker is imported dynamically at runtime. If you want the static
// dependency, run `expo install expo-image-picker` in the `mobile-app` folder.
// (No static declaration - we import the image-picker dynamically.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import CustomAlert from '../../components/CustomAlert';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://chamfloral.vercel.app';

interface PricingRow {
  label: string;
  set: string;
  price: number | string;
}

interface AddonRow {
  label: string;
  price: string;
}

interface ColorRow {
  name: string;
  code: string;
  value: string;
}

interface Product {
  id: string;
  name: string;
  image_url?: string;
  category?: string;
  pricing?: PricingRow[];
  addons?: AddonRow[];
  colors?: ColorRow[];
}

interface Category {
  id?: string;
  name: string;
  rush_fee?: number;
}

const ProductsScreen = ({ navigation }: any) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Product modal states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<Product>>({});
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [addonRows, setAddonRows] = useState<AddonRow[]>([]);
  const [colorRows, setColorRows] = useState<ColorRow[]>([]);
  
  // Category modal states
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryRushFee, setNewCategoryRushFee] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const { showAlert, hideAlert, alertConfig, visible: alertVisible } = useCustomAlert();

  const loadProducts = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) {
        showAlert('Error', 'Please login first');
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok) {
        setProducts(data || []);
        applyFilters(data || [], searchQuery, categoryFilter);
      } else {
        showAlert('Error', data.error || 'Failed to load products');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error loading products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCategories = async () => {
    try {
      const token = await AsyncStorage.getItem('adminToken');
      const response = await fetch(`${API_URL}/api/admin/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        setCategories(data || []);
      } else {
        // If server returned an error, show it and fallback
        if (data && data.error) showAlert('Error', data.error);
        const cats = new Set(products.filter(p => p.category).map(p => p.category!));
        setCategories(Array.from(cats).map(name => ({ name, rush_fee: 0 })));
      }
    } catch (error) {
      // Fallback to extracting from products
      const cats = new Set(products.filter(p => p.category).map(p => p.category!));
      setCategories(Array.from(cats).map(name => ({ name, rush_fee: 0 })));
    }
  };

  const applyFilters = (productsList: Product[], search: string, category: string) => {
    let filtered = productsList;

    if (search) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (category) {
      filtered = filtered.filter(p => p.category === category);
    }

    setFilteredProducts(filtered);
  };

  useFocusEffect(
    useCallback(() => {
      loadProducts();
      loadCategories();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadProducts(false);
      await loadCategories();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddProduct = () => {
    setSelectedProduct(null);
    setEditMode(true);
    setEditData({ name: '', category: '', image_url: '' });
    setPricingRows([]);
    setAddonRows([]);
    setColorRows([]);
    setModalVisible(true);
  };

  const handleProductPress = (product: Product) => {
    setSelectedProduct(product);
    setEditMode(false);
    setModalVisible(true);
  };

  const handleEditProduct = () => {
    if (selectedProduct) {
      setEditData({
        name: selectedProduct.name,
        category: selectedProduct.category,
        image_url: selectedProduct.image_url,
      });
      setPricingRows(selectedProduct.pricing || []);
      setAddonRows(selectedProduct.addons || []);
      setColorRows(selectedProduct.colors || []);
      setEditMode(true);
    }
  };

  const handleSaveProduct = async () => {
    if (!editData.name?.trim()) {
      showAlert('Error', 'Product name is required');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) return;

      const payload = {
        name: editData.name,
        category: editData.category || null,
        image_url: editData.image_url || null,
        pricing: pricingRows.filter(r => r.label || r.set || r.price),
        addons: addonRows.filter(r => r.label || r.price),
        colors: colorRows.filter(r => r.name || r.value),
      };

      const url = selectedProduct
        ? `${API_URL}/api/admin/products/${selectedProduct.id}`
        : `${API_URL}/api/admin/products`;
      
      const method = selectedProduct ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('Success', `Product ${selectedProduct ? 'updated' : 'created'} successfully`, [
          {
            text: 'OK',
            onPress: () => {
              setModalVisible(false);
              setEditMode(false);
              loadProducts(false);
            }
          }
        ], 'success');
      } else {
        showAlert('Error', data.error || 'Failed to save product');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error saving product');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const token = await AsyncStorage.getItem('adminToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        showAlert('Success', 'Product deleted successfully', [
          {
            text: 'OK',
            onPress: () => {
              setModalVisible(false);
              loadProducts(false);
            }
          }
        ], 'success');
      } else {
        const data = await response.json();
        showAlert('Error', data.error || 'Failed to delete product');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Error deleting product');
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) {
      showAlert('Error', 'Category name is required');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('adminToken');
      const rushFee = parseFloat(newCategoryRushFee) || 0;

      if (editingCategory?.id) {
        // Update existing
        const response = await fetch(`${API_URL}/api/admin/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: newCategoryName, rush_fee: rushFee }),
        });

        if (response.ok) {
          showAlert('Success', 'Category updated', undefined, 'success');
          setNewCategoryName('');
          setNewCategoryRushFee('');
          setEditingCategory(null);
          loadCategories();
        }
      } else {
        // Create new
        const response = await fetch(`${API_URL}/api/admin/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: newCategoryName, rush_fee: rushFee }),
        });

        if (response.ok) {
          showAlert('Success', 'Category added', undefined, 'success');
          setNewCategoryName('');
          setNewCategoryRushFee('');
          loadCategories();
        }
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('adminToken');
              if (category.id) {
                await fetch(`${API_URL}/api/admin/categories/${category.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              loadCategories();
              showAlert('Success', 'Category deleted', undefined, 'success');
            } catch (error: any) {
              showAlert('Error', error.message || 'Failed to delete category');
            }
          }
        }
      ]
    );
  };

  const getCategories = () => {
    const categories = new Set(products.filter(p => p.category).map(p => p.category!));
    return Array.from(categories).sort();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
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
          <Text style={styles.statNumber}>{products.length}</Text>
          <Text style={styles.statLabel}>Total Products</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{getCategories().length}</Text>
          <Text style={styles.statLabel}>Categories</Text>
        </View>
      </View>

      <View style={styles.toolbarRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              applyFilters(products, text, categoryFilter);
            }}
          />
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={() => setCategoryModalVisible(true)}>
          <Ionicons name="folder-outline" size={24} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Category filter badges removed per request */}

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6F9B']} />}
      >
        {filteredProducts.map((product) => (
          <TouchableOpacity key={product.id} style={styles.productCard} onPress={() => handleProductPress(product)}>
            {product.image_url && (
              <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
            )}
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              {product.category && (
                <Text style={styles.productCategory}>{product.category}</Text>
              )}
              {product.pricing && product.pricing.length > 0 && (
                <Text style={styles.productPrice}>
                  From ₱{Math.min(...product.pricing.map(p => typeof p.price === 'number' ? p.price : parseFloat(String(p.price)) || 0)).toLocaleString()}
                </Text>
              )}
              {product.colors && product.colors.length > 0 && (
                <View style={{ flexDirection: 'row', marginTop: 4, gap: 4 }}>
                  {product.colors.slice(0, 5).map((color, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: color.value || color.code || '#ccc',
                        borderWidth: 1,
                        borderColor: '#ddd',
                      }}
                    />
                  ))}
                  {product.colors.length > 5 && (
                    <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>+{product.colors.length - 5}</Text>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB - Add Product */}
      <TouchableOpacity style={styles.fab} onPress={handleAddProduct} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Product Modal */}
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
                {editMode ? 'Edit Product' : 'Product Details'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              {selectedProduct && !editMode && (
                <View>
                  {selectedProduct.image_url && (
                    <Image source={{ uri: selectedProduct.image_url }} style={styles.modalImage} resizeMode="cover" />
                  )}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Product Name:</Text>
                    <Text style={{ fontSize: 16, color: '#333' }}>{selectedProduct.name}</Text>
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Category:</Text>
                    <Text style={{ fontSize: 16, color: '#333' }}>{selectedProduct.category || 'Uncategorized'}</Text>
                  </View>
                  {selectedProduct.pricing && selectedProduct.pricing.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Pricing:</Text>
                      {selectedProduct.pricing.map((price, index) => (
                        <Text key={index} style={{ fontSize: 14, color: '#333', marginBottom: 4 }}>
                          {price.label} - {price.set}: ₱{price.price}
                        </Text>
                      ))}
                    </View>
                  )}
                  {selectedProduct.addons && selectedProduct.addons.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Add-ons:</Text>
                      {selectedProduct.addons.map((addon, index) => (
                        <Text key={index} style={{ fontSize: 14, color: '#333', marginBottom: 4 }}>
                          {addon.label}: {addon.price}
                        </Text>
                      ))}
                    </View>
                  )}
                  {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Available Colors:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {selectedProduct.colors.map((color, index) => (
                          <View key={index} style={{ alignItems: 'center' }}>
                            <View
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: color.value || color.code || '#ccc',
                                borderWidth: 1,
                                borderColor: '#ddd',
                              }}
                            />
                            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{color.name}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {editMode && (
                <View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Product Name *:</Text>
                    <TextInput
                      style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                      value={editData.name}
                      onChangeText={(text) => setEditData({ ...editData, name: text })}
                      placeholder="Enter product name"
                    />
                  </View>

                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Image:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {editData.image_url ? (
                        <Image source={{ uri: editData.image_url }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                      ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="image-outline" size={28} color="#9ca3af" />
                        </View>
                      )}
                      <TouchableOpacity
                        style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#8b5cf6', borderRadius: 8 }}
                        onPress={async () => {
                          try {
                            // dynamically import to avoid module resolution error when the
                            // dependency isn't installed.
                            // @ts-ignore: optional dependency may not be installed in every environment
                            const ImagePicker = await import('expo-image-picker');
                            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (permissionResult.status !== 'granted') {
                              showAlert('Permission required', 'Permission to access photos is required to upload an image');
                              return;
                            }
                            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
                            if (!result.canceled && result.assets && result.assets.length > 0) {
                              const uri = result.assets[0].uri;
                              setEditData({ ...editData, image_url: uri });
                            }
                          } catch (err: any) {
                            // If dynamic import failed, the package is not installed
                            showAlert('Image Picker Unavailable', 'Install expo-image-picker: cd mobile-app && expo install expo-image-picker');
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '600' }}>{editData.image_url ? 'Change Image' : 'Upload Image'}</Text>
                      </TouchableOpacity>
                      {editData.image_url ? (
                        <TouchableOpacity onPress={() => setEditData({ ...editData, image_url: '' })} style={{ marginLeft: 8 }}>
                          <Text style={{ color: '#ef4444' }}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Category:</Text>
                    {categories && categories.length > 0 ? (
                      <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <Picker
                          selectedValue={editData.category}
                          onValueChange={(val) => setEditData({ ...editData, category: String(val) })}
                        >
                          <Picker.Item label="Uncategorized" value={''} />
                          {categories.map((c) => (
                            <Picker.Item key={c.name} label={c.name} value={c.name} />
                          ))}
                        </Picker>
                      </View>
                    ) : (
                      <TextInput
                        style={{ fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                        value={editData.category}
                        onChangeText={(text) => setEditData({ ...editData, category: text })}
                        placeholder="Select or type category"
                      />
                    )}
                  </View>

                  {/* Pricing Rows */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Pricing:</Text>
                    {pricingRows.map((row, index) => (
                      <View key={index} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TextInput
                          style={{ flex: 2, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.label}
                          onChangeText={(text) => {
                            const updated = [...pricingRows];
                            updated[index].label = text;
                            setPricingRows(updated);
                          }}
                          placeholder="Label"
                        />
                        <TextInput
                          style={{ flex: 1.5, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.set}
                          onChangeText={(text) => {
                            const updated = [...pricingRows];
                            updated[index].set = text;
                            setPricingRows(updated);
                          }}
                          placeholder="Set"
                        />
                        <TextInput
                          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={String(row.price)}
                          onChangeText={(text) => {
                            const updated = [...pricingRows];
                            updated[index].price = text;
                            setPricingRows(updated);
                          }}
                          placeholder="Price"
                          keyboardType="numeric"
                        />
                        <TouchableOpacity onPress={() => setPricingRows(pricingRows.filter((_, i) => i !== index))}>
                          <Ionicons name="close-circle" size={24} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={{ padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setPricingRows([...pricingRows, { label: '', set: '', price: '' }])}
                    >
                      <Text style={{ color: '#6b7280' }}>+ Add Pricing Row</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Color Rows */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Available Colors:</Text>
                    {colorRows.map((row, index) => (
                      <View key={index} style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: row.value || '#fff',
                            borderWidth: 1,
                            borderColor: '#ddd',
                          }}
                        />
                        <TextInput
                          style={{ flex: 2, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.name}
                          onChangeText={(text) => {
                            const updated = [...colorRows];
                            updated[index].name = text;
                            setColorRows(updated);
                          }}
                          placeholder="Color name"
                        />
                        <TextInput
                          style={{ flex: 1.5, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.value}
                          onChangeText={(text) => {
                            const updated = [...colorRows];
                            updated[index].value = text;
                            updated[index].code = text;
                            setColorRows(updated);
                          }}
                          placeholder="#RRGGBB"
                        />
                        <TouchableOpacity onPress={() => setColorRows(colorRows.filter((_, i) => i !== index))}>
                          <Ionicons name="close-circle" size={24} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={{ padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setColorRows([...colorRows, { name: '', code: '', value: '#ffffff' }])}
                    >
                      <Text style={{ color: '#6b7280' }}>+ Add Color</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Addon Rows */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Add-ons:</Text>
                    {addonRows.map((row, index) => (
                      <View key={index} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TextInput
                          style={{ flex: 2, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.label}
                          onChangeText={(text) => {
                            const updated = [...addonRows];
                            updated[index].label = text;
                            setAddonRows(updated);
                          }}
                          placeholder="Add-on name"
                        />
                        <TextInput
                          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14 }}
                          value={row.price}
                          onChangeText={(text) => {
                            const updated = [...addonRows];
                            updated[index].price = text;
                            setAddonRows(updated);
                          }}
                          placeholder="Price"
                        />
                        <TouchableOpacity onPress={() => setAddonRows(addonRows.filter((_, i) => i !== index))}>
                          <Ionicons name="close-circle" size={24} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={{ padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setAddonRows([...addonRows, { label: '', price: '' }])}
                    >
                      <Text style={{ color: '#6b7280' }}>+ Add Add-on</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={{ padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#10b981', marginTop: 16 }}
                    onPress={handleSaveProduct}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save Product</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 }}>
              {editMode ? (
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' }}
                  onPress={() => {
                    if (selectedProduct) {
                      setEditMode(false);
                    } else {
                      setModalVisible(false);
                    }
                  }}
                >
                  <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
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
                    onPress={handleEditProduct}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#ef4444' }}
                    onPress={() => {
                      if (selectedProduct) {
                        showAlert(
                          'Delete Product',
                          `Are you sure you want to delete "${selectedProduct.name}"?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => handleDeleteProduct(selectedProduct.id)
                            }
                          ],
                          'warning'
                        );
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Management Modal */}
      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Manage Categories</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </Text>
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder="Category name"
                  />
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 }}
                    value={newCategoryRushFee}
                    onChangeText={setNewCategoryRushFee}
                    placeholder="Rush fee (₱)"
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={{ padding: 8, borderRadius: 8, backgroundColor: '#8b5cf6', alignItems: 'center' }}
                    onPress={handleSaveCategory}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                      {editingCategory ? 'Save Changes' : 'Add Category'}
                    </Text>
                  </TouchableOpacity>
                  {editingCategory && (
                    <TouchableOpacity
                      style={{ padding: 8, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                      onPress={() => {
                        setEditingCategory(null);
                        setNewCategoryName('');
                        setNewCategoryRushFee('');
                      }}
                    >
                      <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>Categories</Text>
                {categories.map((category, index) => {
                  const productCount = products.filter(p => p.category === category.name).length;
                  return (
                    <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>{category.name}</Text>
                        <Text style={{ fontSize: 12, color: '#6b7280' }}>
                          {productCount} product{productCount !== 1 ? 's' : ''} · Rush: ₱{category.rush_fee || 0}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ padding: 8, borderRadius: 8, backgroundColor: '#f3f4f6' }}
                          onPress={() => {
                            setEditingCategory(category);
                            setNewCategoryName(category.name);
                            setNewCategoryRushFee(String(category.rush_fee || 0));
                          }}
                        >
                          <Ionicons name="create-outline" size={18} color="#6b7280" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ padding: 8, borderRadius: 8, backgroundColor: '#fee2e2' }}
                          onPress={() => handleDeleteCategory(category)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <TouchableOpacity
                style={{ padding: 10, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                onPress={() => setCategoryModalVisible(false)}
              >
                <Text style={{ color: '#6b7280', fontSize: 14, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
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
  toolbarRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 8, alignItems: 'center' },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 10, borderRadius: 8 },
  searchInput: { flex: 1, height: 36, fontSize: 14, marginLeft: 8 },
  iconButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8 },
  filterContainer: { paddingHorizontal: 8, marginBottom: 6, height: 1 },
  filterBadge: { paddingHorizontal: 8, paddingVertical: 2, height: 25, borderRadius: 12, backgroundColor: '#f3f4f6', marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  filterBadgeActive: { backgroundColor: '#ff69b4' },
  filterText: { fontSize: 12, color: '#6b7280' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  productCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', elevation: 1 },
  productImage: { width: 80, height: 80, borderRadius: 8, marginRight: 12 },
  productInfo: { flex: 1, justifyContent: 'center' },
  productName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  productCategory: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  productPrice: { fontSize: 14, fontWeight: '600', color: '#ff69b4' },
  modalImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ff69b4',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 24,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
});

export default ProductsScreen;

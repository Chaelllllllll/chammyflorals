import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ApiService, { Review } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

export default function ReviewsScreen() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewFromPicker, setPreviewFromPicker] = useState(false);
  const [formData, setFormData] = useState({
    order_id: '',
    stars: 5,
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const { alertConfig, visible, showAlert, hideAlert } = useCustomAlert();

  useEffect(() => {
    loadReviews();
    // Request media library permissions for image picker
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          console.log('Image picker permission not granted');
        }
      } catch (e) {
        console.warn('Failed to request image picker permission', e);
      }
    })();
  }, []);

  const loadReviews = async () => {
    try {
      console.log('Loading reviews...');
      const data = await ApiService.getReviews();
      console.log('Reviews loaded:', data?.length || 0);
      if (!data || data.length === 0) {
        console.warn('No reviews returned from API');
      }
      setReviews(data || []);
    } catch (error) {
      console.error('Failed to load reviews:', error);
      setReviews([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReviews();
  };

  const handleSubmitReview = async () => {
    // All fields required: order_id, stars, message
    if (!String(formData.order_id || '').trim()) {
      showAlert('Missing Order ID', 'Please enter your order ID.', undefined, 'warning');
      return;
    }

    const starsVal = Number((formData && (formData as any).stars) || 0) || 0;
    if (!starsVal || starsVal < 1 || starsVal > 5) {
      showAlert('Missing Rating', 'Please select a rating (1-5 stars).', undefined, 'warning');
      return;
    }

    if (!String(formData.message || '').trim()) {
      showAlert('Missing Message', 'Please write your review message.', undefined, 'warning');
      return;
    }

    if (String(formData.message || '').trim().length < 10) {
      showAlert('Review Too Short', 'Please write at least 10 characters in your review.', undefined, 'warning');
      return;
    }

    // Image is required for reviews
    if (!selectedImage) {
      showAlert('Missing Photo', 'Please attach a photo with your review. Photo is required.', undefined, 'warning');
      return;
    }

    setSubmitting(true);
    try {
      // Map mobile form keys to server-expected keys: orderId, stars, message
      const payload = {
        orderId: String(formData.order_id || '').trim(),
        stars: Number((formData && (formData as any).stars) || 1) || 1,
        message: String(formData.message || '').trim(),
      };

      // If an image was selected, send as multipart/form-data
      if (selectedImage) {
        const form = new FormData();
        // Append both variants to be compatible with web/server expectations
        form.append('orderId', payload.orderId);
        form.append('order_id', payload.orderId);
        form.append('stars', String(payload.stars));
        form.append('message', payload.message);

        // Extract filename and infer type
        const uriParts = selectedImage.split('/');
        const name = uriParts[uriParts.length - 1] || `photo_${Date.now()}.jpg`;
        const match = name.match(/\.([0-9a-zA-Z]+)(?:\?|$)/);
        const ext = match ? match[1].toLowerCase() : 'jpg';
        let mime = 'image/jpeg';
        if (ext === 'png') mime = 'image/png';
        else if (ext === 'webp') mime = 'image/webp';
        else if (ext === 'gif') mime = 'image/gif';

        try {
          // Convert file URI to blob for reliable multipart upload on Android/iOS
          const fileResp = await fetch(selectedImage);
          const blob = await fileResp.blob();
          // React Native FormData accepts a Blob with a filename third arg
          // @ts-ignore - append blob with filename
          form.append('image', blob, name);
        } catch (e) {
          // Fallback: append as RN file object (may work on many devices)
          // @ts-ignore
          form.append('image', { uri: selectedImage, name, type: mime });
        }

        await ApiService.createReview(form);
      } else {
        await ApiService.createReview(payload);
      }
      showAlert(
        'Review Submitted!',
        'Thank you for sharing your feedback! Your review helps others make informed decisions.',
        [{ text: 'OK' }],
        'success'
      );
      setFormData({ order_id: '', stars: 5, message: '' });
      setShowForm(false);
      setSelectedImage(null);
      loadReviews();
    } catch (error: any) {
      // Try to extract a helpful error message from the API (handle unknown shape)
      let msg = 'Unable to submit your review. Please check your internet connection and try again.';
      try {
        if (!error) {
          // keep default
        } else if (typeof error === 'string') {
          msg = error;
        } else if (error.message) {
          msg = String(error.message);
        } else if (error.response) {
          // axios-like
          try {
            const body = typeof error.response === 'string' ? error.response : (error.response.data || error.response);
            msg = typeof body === 'string' ? body : JSON.stringify(body);
          } catch (e) {}
        } else if (error.toString) {
          msg = String(error.toString());
        }
      } catch (e) {
        // fall back to default
      }
      showAlert('Submission Failed', msg, [{ text: 'OK' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async () => {
    try {
      // Avoid using deprecated/possibly missing MediaType enums — request library and validate result
      const result: any = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      // Support both older SDKs (result.cancelled/result.uri) and newer (result.canceled/result.assets)
      const cancelled = result && (result.cancelled === true || result.canceled === true);
      if (!cancelled) {
        const assetUri = result.uri || (result.assets && result.assets[0] && result.assets[0].uri) || null;
        const assetType = result.type || (result.assets && result.assets[0] && result.assets[0].type) || null;
        // If assetType is provided, ensure it's an image
        if (assetType && !String(assetType).toLowerCase().includes('image')) {
          showAlert('Invalid File', 'Please select an image file (photos only).', undefined, 'warning');
          return;
        }
        if (assetUri) {
          setSelectedImage(assetUri);
          // mark that picker provided the preview; show inline preview instead of auto-opening modal
          setPreviewFromPicker(true);
          setModalVisible(false);
        }
      }
    } catch (e) {
      console.warn('Image pick failed', e);
      showAlert('Image Error', 'Could not pick the image.');
    }
  };

  const handleClosePreview = () => {
    // Close preview modal and reset picker flag. Keep `selectedImage` so it stays in the form preview.
    setModalVisible(false);
    setPreviewFromPicker(false);
  };

  const renderStars = (stars: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= stars ? 'star' : 'star-outline'}
            size={20}
            color="#FFD700"
          />
        ))}
      </View>
    );
  };

  const renderRatingSelector = () => {
    return (
      <View style={styles.ratingSelectorContainer}>
        <Text style={styles.ratingLabel}>Your Rating:</Text>
        <View style={styles.ratingStars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setFormData({ ...formData, stars: star })}
            >
              <Ionicons
                name={star <= formData.stars ? 'star' : 'star-outline'}
                size={24}
                color="#FFD700"
                style={styles.starButton}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderReview = ({ item }: { item: Review }) => {
    // Defensive rendering in case some fields are missing
    const imageUrl = (item && (item as any).image_url) || null;
    const reviewerName = (item && (item as any).name) || 'Customer';
    const message = (item && (item as any).message) || '';
    const stars = Number((item && (item as any).stars) || 0);
    let createdAtText = '';
    try {
      const d = item && (item as any).created_at ? new Date(item.created_at) : null;
      createdAtText = d ? d.toLocaleDateString() : '';
    } catch (e) {
      createdAtText = '';
    }

    return (
      <View style={styles.reviewCard}>
        {imageUrl && (
          <TouchableOpacity
            style={styles.reviewImageWrapper}
            onPress={() => {
              setSelectedImage(imageUrl);
              setPreviewFromPicker(false);
            }}
          >
            <Image
              source={{ uri: imageUrl }}
              style={styles.reviewImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
        <View style={styles.reviewContent}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewerName}>{reviewerName}</Text>
            {renderStars(stars)}
          </View>
          <Text style={styles.reviewComment}>{message}</Text>
          <Text style={styles.reviewDate}>{createdAtText}</Text>
          {item && (item as any).order_id && (
            <Text style={styles.orderIdText}>Order: #{(item as any).order_id}</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff6f9b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
          style={styles.formWrapper}
        >
          <ScrollView
            style={styles.formCard}
            contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.formHeaderRow}>
              <Text style={styles.formTitle}>Write a Review</Text>
            </View>

            <View style={styles.fieldFull}>
              <Text style={styles.fieldLabel}>Order ID</Text>
              <TextInput
                style={styles.input}
                placeholder="A5DW7DW"
                placeholderTextColor="#9aa0a6"
                value={formData.order_id}
                onChangeText={(text) => setFormData({ ...formData, order_id: text })}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldFull}>
              <Text style={styles.fieldLabel}>Your Rating</Text>
              <View style={styles.ratingBox}>{renderRatingSelector()}</View>
            </View>

            <View style={styles.fieldFull}>
              <Text style={styles.fieldLabel}>Your Review</Text>
              <TextInput
                style={[styles.input, styles.textArea, { minHeight: 120 }]}
                placeholder="Share your experience..."
                placeholderTextColor="#9aa0a6"
                value={formData.message}
                onChangeText={(text) => setFormData({ ...formData, message: text })}
                multiline
                numberOfLines={6}
              />
            </View>

            <View style={styles.fieldFull}>
              <TouchableOpacity style={styles.addPhotoButtonFull} onPress={pickImage}>
                <Ionicons name="camera" size={18} color="#fff" />
                <Text style={styles.addPhotoText}>Add Photo</Text>
              </TouchableOpacity>

              <View style={styles.previewContainer}>
                {selectedImage ? (
                  <View style={styles.previewContainerInner}>
                    <Image source={{ uri: selectedImage }} style={styles.previewFullWidth} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={() => setSelectedImage(null)}
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="trash" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.previewPlaceholderFull}>
                    <Ionicons name="images" size={28} color="#e5a9be" />
                    <Text style={styles.previewPlaceholderText}>Image required</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButtonPrimary, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmitReview}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Review</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <FlatList
        data={reviews}
        renderItem={renderReview}
        keyExtractor={(item) => (item && (item as any).id ? String((item as any).id) : String((item as any).order_id || JSON.stringify(item)))}
        contentContainerStyle={styles.reviewsList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff6f9b" colors={["#ff6f9b"]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="star-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No reviews yet</Text>
            <Text style={styles.emptySubtext}>Be the first to leave a review!</Text>
          </View>
        }
      />

      {/* Image Modal */}
      <Modal
        visible={!!modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClosePreview}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleClosePreview}
        >
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClosePreview}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            {selectedImage && (
              <Image
                source={{ uri: selectedImage }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
      <CustomAlert
        visible={visible}
        title={alertConfig?.title || ''}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onDismiss={hideAlert}
        type={alertConfig?.type}
      />

      {/* Floating Add/Close FAB (inside container so absolute positioning works) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setShowForm(!showForm)}
        style={[styles.fab, showForm ? styles.fabClose : null]}
      >
        <Ionicons name={showForm ? 'close' : 'add'} size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff6f9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#ff6f9b',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    backgroundColor: '#f8f8f8',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2b2b2b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3d7df',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#ff2d77',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#ff2d77',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewsList: {
    padding: 15,
  },
  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewImageWrapper: {
    width: '100%',
    height: 200,
    backgroundColor: '#f5f5f5',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewContent: {
    padding: 15,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d2d2d',
  },
  starsContainer: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 10,
  },
  reviewDate: {
    fontSize: 12,
    color: '#999',
  },
  orderIdText: {
    fontSize: 11,
    color: '#ff6f9b',
    fontWeight: '600',
    marginTop: 5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 15,
    fontSize: 18,
    color: '#999',
  },
  emptySubtext: {
    marginTop: 5,
    fontSize: 14,
    color: '#bbb',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6f9b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
    shadowColor: '#ff6f9b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginLeft: 12,
  },
  previewImageLarge: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#fde6ee',
    backgroundColor: '#fff',
  },
  previewPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#fde6ee',
    backgroundColor: '#fff7f9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  previewPlaceholderText: {
    color: '#e5a9be',
    fontSize: 12,
    marginTop: 6,
  },
  fieldFull: {
    width: '100%',
    marginBottom: 10,
  },
  addPhotoButtonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6f9b',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    justifyContent: 'center',
    shadowColor: '#ff6f9b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  previewContainer: {
    marginTop: 12,
    width: '100%',
  },
  previewContainerInner: {
    position: 'relative',
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewFullWidth: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  previewPlaceholderFull: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#fde6ee',
    backgroundColor: '#fff7f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formWrapper: {
    // Constrain the form height so the inner ScrollView can scroll
    maxHeight: '78%',
    width: '100%',
  },
  formCard: {
    backgroundColor: '#ffffff',
    margin: 12,
    padding: 18,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#fff0f3',
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requiredHint: {
    color: '#ff2d77',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#444',
    marginBottom: 6,
    fontWeight: '600',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  ratingCol: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBox: {
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3e7ec',
    alignItems: 'center',
  },
  ratingSelectorContainer: {
    marginBottom: 8,
    alignItems: 'center',
  },
  ratingLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  ratingStars: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  starButton: {
    marginHorizontal: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  addPhotoText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  },
  submitButtonPrimary: {
    backgroundColor: '#ff2d77',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#ff2d77',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ff6f9b',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabClose: {
    backgroundColor: '#ef4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  previewWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    marginLeft: 12,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ff2d77',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#ff2d77',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  modalContent: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  closeButton: {
    position: 'absolute',
    top: -40,
    right: 10,
    zIndex: 10,
    padding: 10,
  },
});

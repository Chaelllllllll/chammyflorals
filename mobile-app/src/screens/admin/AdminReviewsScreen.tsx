import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService from '../../services/api';

interface Review {
  id: number;
  order_id?: string;
  name: string;
  stars: number;
  message: string;
  image_url?: string;
  created_at: string;
}

export default function AdminReviewsScreen({ navigation }: any) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getReviews();
      setReviews(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (review: Review) => {
    Alert.alert(
      'Delete Review',
      `Are you sure you want to delete this review from ${review.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteReview(review.id);
              Alert.alert('Success', 'Review deleted');
              loadReviews();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete review');
            }
          },
        },
      ]
    );
  };

  const renderStars = (stars: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= stars ? 'star' : 'star-outline'}
            size={16}
            color="#FFD700"
          />
        ))}
      </View>
    );
  };

  const renderReview = ({ item }: { item: Review }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewInfo}>
          <Text style={styles.reviewName}>{item.name}</Text>
          {renderStars(item.stars)}
          <Text style={styles.orderId}>Order: {item.order_id}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
          <Ionicons name="trash" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      {item.image_url && (
        <Image source={{ uri: item.image_url }} style={styles.reviewImage} />
      )}

      <Text style={styles.reviewMessage}>{item.message}</Text>

      <Text style={styles.reviewDate}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff6f9b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Customer Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={reviews}
        renderItem={renderReview}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  list: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  reviewInfo: {
    flex: 1,
  },
  reviewName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 2,
  },
  orderId: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
  },
  reviewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: '#F3F4F6',
  },
  reviewMessage: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 10,
  },
  reviewDate: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});

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

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Component mounted
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Currently Home has static content — keep visual refresh. If needed, hook real reload logic here.
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff6f9b" colors={["#ff6f9b"]} />}
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Welcome to Chammy Florals</Text>
          <Text style={styles.heroSubtitle}>
            Beautiful flowers for every occasion
          </Text>
          <TouchableOpacity
            style={styles.heroButton}
            onPress={() => {
              navigation.navigate('Products');
            }}
          >
            <Text style={styles.heroButtonText}>Shop Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Why Choose Us</Text>
        <View style={styles.featuresGrid}>
          <View style={styles.featureCard}>
            <Ionicons name="flower-outline" size={40} color="#ff6f9b" />
            <Text style={styles.featureTitle}>Fresh Flowers</Text>
            <Text style={styles.featureText}>
              Hand-picked fresh flowers daily
            </Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="car-outline" size={40} color="#ff6f9b" />
            <Text style={styles.featureTitle}>Fast Delivery</Text>
            <Text style={styles.featureText}>
              Same-day delivery available
            </Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="heart-outline" size={40} color="#ff6f9b" />
            <Text style={styles.featureTitle}>Made with Love</Text>
            <Text style={styles.featureText}>
              Each arrangement crafted with care
            </Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#ff6f9b" />
            <Text style={styles.featureTitle}>Quality Guarantee</Text>
            <Text style={styles.featureText}>
              100% satisfaction guaranteed
            </Text>
          </View>
        </View>
      </View>

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Ready to Order?</Text>
        <Text style={styles.ctaText}>
          Browse our beautiful collection of flowers and bouquets
        </Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => navigation.navigate('Products')}
        >
          <Text style={styles.ctaButtonText}>View Products</Text>
        </TouchableOpacity>
      </View>

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

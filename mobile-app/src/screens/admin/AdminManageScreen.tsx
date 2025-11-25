import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';

interface Admin {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminManageScreen({ navigation }: any) {
  const { token } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/admins', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAdmins(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAdmins();
    setRefreshing(false);
  };

  const handleAddAdmin = async () => {
    if (!newAdmin.name || !newAdmin.email || !newAdmin.password) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    try {
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newAdmin),
      });

      if (response.ok) {
        Alert.alert('Success', 'Admin added successfully');
        setModalVisible(false);
        setNewAdmin({ name: '', email: '', password: '' });
        loadAdmins();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to add admin');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add admin');
    }
  };

  const handleDeleteAdmin = (adminId: number) => {
    Alert.alert('Delete Admin', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(`https://chammyflorals.vercel.app/api/admin/admins/${adminId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
              Alert.alert('Success', 'Admin deleted');
              loadAdmins();
            } else {
              Alert.alert('Error', 'Failed to delete admin');
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to delete admin');
          }
        },
      },
    ]);
  };

  const renderAdmin = ({ item }: { item: Admin }) => (
    <View style={styles.adminCard}>
      <View style={styles.adminAvatar}>
        <Ionicons name="person" size={28} color="#FF6F9B" />
      </View>
      <View style={styles.adminInfo}>
        <Text style={styles.adminName}>{item.name}</Text>
        <Text style={styles.adminEmail}>{item.email}</Text>
        <Text style={styles.adminDate}>
          Added {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDeleteAdmin(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.title}>Manage Admins</Text>
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={admins}
        renderItem={renderAdmin}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6F9B']} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No admins found</Text>
          </View>
        }
      />

      {/* Add Admin Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Admin</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter admin name"
                value={newAdmin.name}
                onChangeText={(text) => setNewAdmin({ ...newAdmin, name: text })}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter admin email"
                value={newAdmin.email}
                onChangeText={(text) => setNewAdmin({ ...newAdmin, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                value={newAdmin.password}
                onChangeText={(text) => setNewAdmin({ ...newAdmin, password: text })}
                secureTextEntry
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleAddAdmin}>
                <Text style={styles.submitText}>Add Admin</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF5F8',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  addBtn: {
    backgroundColor: '#FF6F9B',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  adminAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  adminInfo: {
    flex: 1,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  adminEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  adminDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  deleteBtn: {
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  submitBtn: {
    backgroundColor: '#FF6F9B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import ApiService from '../../services/api';

export default function AdminLoginScreen({ navigation }: any) {
  const { login, isAuthenticated, user } = useAuth();
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTOTP, setRequiresTOTP] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');

  const validateInput = () => {
    const email = credentials.email.trim();
    const password = credentials.password.trim();

    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateInput()) return;

    setLoading(true);
    try {
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password.trim(),
          totp: totpCode || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Check if TOTP setup is required
        if (result.setupRequired) {
          setSetupRequired(true);
          setQrCodeUrl(result.qrCode);
          setTotpSecret(result.secret);
          Alert.alert('Setup Required', result.message || 'Scan QR code with Google Authenticator');
          return;
        }

        // Check if TOTP is required
        if (result.requiresTOTP) {
          setRequiresTOTP(true);
          Alert.alert('Authentication Required', result.message || 'Enter your Google Authenticator code');
          return;
        }

        // Normal login without TOTP or successful TOTP verification
        if (result.token) {
          await login(result.token, result.user);
          setCredentials({ email: '', password: '' });
          setTotpCode('');
          Alert.alert('Success', 'Logged in successfully!', [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]);
          return;
        }
      }

      Alert.alert('Login Failed', result.error || 'Invalid credentials');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTOTP = async () => {
    if (!totpCode || !/^[0-9]{6}$/.test(totpCode)) {
      Alert.alert('Error', 'Please enter the 6-digit code from Google Authenticator');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/login/enable-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password.trim(),
          totp: totpCode,
        }),
      });

      const result = await response.json();

      if (response.ok && result.token) {
        await login(result.token, result.user);
        setCredentials({ email: '', password: '' });
        setTotpCode('');
        setSetupRequired(false);
        Alert.alert('Success', 'Google Authenticator enabled successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        Alert.alert('Verification Failed', result.error || 'Invalid code');
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to enable Google Authenticator');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brandTitle}>Chammy Florals</Text>
        </View>

        {setupRequired ? (
          <View style={styles.setupContainer}>
            <Text style={styles.setupTitle}>Setup Google Authenticator</Text>
            <Text style={styles.setupText}>1. Download Google Authenticator app</Text>
            <Text style={styles.setupText}>2. Scan this QR code or enter secret manually</Text>
            
            {qrCodeUrl && (
              <View style={styles.qrContainer}>
                <Text style={styles.secretLabel}>QR Code:</Text>
                <Text style={styles.secretText}>(Display QR in web version)</Text>
                <Text style={styles.secretLabel}>Or enter manually:</Text>
                <Text style={styles.secretText}>{totpSecret}</Text>
              </View>
            )}

            <Text style={styles.label}>Enter code from app:</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#999"
              value={totpCode}
              onChangeText={setTotpCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleEnableTOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Enable Authenticator</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : requiresTOTP ? (
          <View style={styles.formContainer}>
            <Text style={styles.totpMessage}>Enter your Google Authenticator code</Text>

            <Text style={styles.label}>Authenticator Code</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#999"
              value={totpCode}
              onChangeText={setTotpCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={credentials.email}
              onChangeText={(text) => setCredentials({ ...credentials, email: text })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#999"
                value={credentials.password}
                onChangeText={(text) => setCredentials({ ...credentials, password: text })}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => {
                // Just stay on this tab, don't navigate away
                setCredentials({ email: '', password: '' });
                setTotpCode('');
              }} disabled={loading}>
                <Text style={styles.backLink}>← Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffafc',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 30,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 30,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#d63384',
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 20,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  eyeIcon: {
    padding: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  backLink: {
    color: '#d63384',
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#ff99bb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  setupContainer: {
    width: '100%',
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  setupText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secretLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 4,
  },
  secretText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  totpMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
});

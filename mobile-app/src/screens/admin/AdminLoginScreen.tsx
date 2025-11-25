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
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigation.replace('AdminDashboard');
    }
  }, [isAuthenticated, user]);

  // Handle countdown timer
  useEffect(() => {
    if (remainingSeconds > 0) {
      const timer = setTimeout(() => {
        setRemainingSeconds(remainingSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [remainingSeconds]);

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
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Check if 2FA is required
        if (result.twoFactorRequired) {
          setTwoFactorRequired(true);
          setRemainingSeconds(result.remainingSeconds || 60);
          Alert.alert('2FA Required', result.message || 'A 6-digit code was sent to your Messenger.');
          return;
        }

        // Normal login without 2FA
        if (result.token) {
          await login(result.token, result.user);
          setCredentials({ email: '', password: '' });
          navigation.replace('AdminDashboard');
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

  const handleVerify2FA = async () => {
    if (!twoFactorCode || !/^[0-9]{6}$/.test(twoFactorCode)) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email.trim(),
          code: twoFactorCode,
        }),
      });

      const result = await response.json();

      if (response.ok && result.token) {
        await login(result.token, result.user);
        setCredentials({ email: '', password: '' });
        setTwoFactorCode('');
        setTwoFactorRequired(false);
        navigation.replace('AdminDashboard');
      } else {
        Alert.alert('Verification Failed', result.error || 'Invalid code');
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend2FA = async () => {
    if (remainingSeconds > 0) {
      Alert.alert('Please Wait', `Wait ${remainingSeconds} seconds before requesting a new code.`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://chammyflorals.vercel.app/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password.trim(),
        }),
      });

      const result = await response.json();
      if (response.ok && result.twoFactorRequired) {
        setRemainingSeconds(result.remainingSeconds || 60);
        Alert.alert('Code Resent', result.message || 'A new code was sent to your Messenger.');
      } else {
        Alert.alert('Error', result.error || 'Failed to resend code');
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to resend code. Please try again.');
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

        {!twoFactorRequired ? (
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
              <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading}>
                <Text style={styles.backLink}>← Back to site</Text>
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
        ) : (
          <View style={styles.twoFactorContainer}>
            <Text style={styles.twoFactorMessage}>
              A 6-digit code was sent to your Messenger. Enter it below to complete login.
            </Text>

            <Text style={styles.label}>2FA Code</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#999"
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, (loading || remainingSeconds > 0) && styles.loginButtonDisabled]}
                onPress={handleResend2FA}
                disabled={loading || remainingSeconds > 0}
              >
                <Text style={styles.secondaryButtonText}>Resend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleVerify2FA}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Verify & Login</Text>
                )}
              </TouchableOpacity>
            </View>

            {remainingSeconds > 0 && (
              <Text style={styles.countdownText}>
                Please wait {remainingSeconds} second{remainingSeconds !== 1 ? 's' : ''} before requesting a new code.
              </Text>
            )}
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
  twoFactorContainer: {
    width: '100%',
  },
  twoFactorMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  secondaryButton: {
    backgroundColor: '#f8f8f8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 100,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  countdownText: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
});

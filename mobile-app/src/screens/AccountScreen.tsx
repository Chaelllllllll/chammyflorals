import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sentry from '../../sentry.config';
import Constants from 'expo-constants';
import CustomAlert from '../components/CustomAlert';
import { useCustomAlert } from '../hooks/useCustomAlert';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL || 'https://chammyflorals.vercel.app';

export default function AccountScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  
  // Login form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [code2FA, setCode2FA] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  const { alertConfig, visible, showAlert, hideAlert } = useCustomAlert();

  useEffect(() => {
    console.error('[AccountScreen] Component mounted');
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      console.error('[AccountScreen] Checking login status...');
      const [savedToken, savedUserName, savedUserEmail] = await Promise.all([
        AsyncStorage.getItem('adminToken'),
        AsyncStorage.getItem('adminUserName'),
        AsyncStorage.getItem('adminUserEmail')
      ]);

      console.error('[AccountScreen] Saved data:', { hasToken: !!savedToken, hasName: !!savedUserName, hasEmail: !!savedUserEmail });

      if (savedToken && savedUserName && savedUserEmail) {
        console.error('[AccountScreen] Admin already logged in - navigating to dashboard');
        // Use a slight delay to ensure navigator is ready
        setTimeout(() => {
          try {
            setUserName(savedUserName);
            setUserEmail(savedUserEmail);
            setIsLoggedIn(true);
            console.error('[AccountScreen] Navigating to dashboard');
            navigation.navigate('Dashboard');
          } catch (error) {
            console.error('Error navigating to dashboard:', error);
            if (Sentry && typeof Sentry.captureException === 'function') {
              Sentry.captureException(error, {
                tags: { screen: 'AccountScreen', action: 'restoreSessionNavigate' }
              });
            }
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { screen: 'AccountScreen', action: 'checkLoginStatus' }
        });
      }
    } finally {
      // Delay the loading state change too
      setTimeout(() => {
        setLoading(false);
      }, 150);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Error', 'Please enter both email and password');
      return;
    }

    if (!validateEmail(email.trim())) {
      showAlert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      // Check for rate limiting
      if (response.status === 429) {
        showAlert('Too Many Attempts', 'Too many login attempts. Please try again in 15 minutes.');
        return;
      }

      // Try to parse JSON response
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        console.error('[AccountScreen] JSON parse error:', jsonError);
        console.error('[AccountScreen] Response status:', response.status, 'Response headers:', response.headers);
        showAlert('Error', 'Server returned an invalid response. Please try again later.');
        return;
      }

      if (response.ok) {
        // Check if TOTP/2FA is required
        if (result.requiresTOTP) {
          setPendingEmail(email.trim());
          setPendingPassword(password.trim());
          setShow2FA(true);
          showAlert('2FA Required', result.message || 'Please enter your Google Authenticator code.', undefined, 'info');
          return;
        }

        // Check if TOTP setup is required
        if (result.setupRequired) {
          showAlert(
            'Setup Required',
            'This account requires Google Authenticator setup. Please use the web version to complete setup first.',
            [{ text: 'OK' }],
            'warning'
          );
          return;
        }

        // Login successful
        if (result.token) {
          const adminName = result.user?.name || 'Admin';
          const adminEmail = email.trim();
          
          // Save login state
          try {
            await AsyncStorage.multiSet([
              ['adminToken', result.token],
              ['adminUserName', adminName],
              ['adminUserEmail', adminEmail]
            ]);
          } catch (error) {
            console.error('Error saving login state:', error);
          }
          
          // Clear form first
          setEmail('');
          setPassword('');
          // Then update state
          setUserName(adminName);
          setUserEmail(adminEmail);
          // Navigate to dashboard after successful login
          console.error('[AccountScreen] Login successful, navigating to dashboard');
          setIsLoggedIn(true);
          setTimeout(() => {
            try {
              navigation.navigate('Dashboard');
            } catch (error) {
              console.error('Error navigating to dashboard:', error);
              if (Sentry && typeof Sentry.captureException === 'function') {
                Sentry.captureException(error, {
                  tags: { screen: 'AccountScreen', action: 'navigateDashboard' }
                });
              }
            }
          }, 150);
          return;
        }
      }

      showAlert('Error', result.error || 'Login failed');
    } catch (error: any) {
      console.error('Login error:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { screen: 'AccountScreen', action: 'login' }
        });
      }
      showAlert('Error', 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!code2FA || code2FA.length !== 6 || !/^\d{6}$/.test(code2FA)) {
      showAlert('Error', 'Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    try {
      // Re-submit login with TOTP code
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingEmail,
          password: pendingPassword,
          totp: code2FA,
        }),
      });

      // Check for rate limiting
      if (response.status === 429) {
        showAlert('Too Many Attempts', 'Too many login attempts. Please try again in 15 minutes.', undefined, 'warning');
        return;
      }

      // Try to parse JSON response
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        console.error('JSON parse error during 2FA verify:', jsonError);
        showAlert('Error', 'Server returned an invalid response. Please try again later.');
        return;
      }

      if (response.ok && result.token) {
        const adminName = result.user?.name || 'Admin';
        const adminEmail = pendingEmail;
        
        // Save login state
        try {
          await AsyncStorage.multiSet([
            ['adminToken', result.token],
            ['adminUserName', adminName],
            ['adminUserEmail', adminEmail]
          ]);
        } catch (error) {
          console.error('Error saving login state:', error);
        }
        
        // Clear form states
        setCode2FA('');
        setPendingPassword('');
        setEmail('');
        setPassword('');
        setPendingEmail('');
        // Set user info
        setUserName(adminName);
        setUserEmail(adminEmail);
        // Navigate to dashboard after successful 2FA verification
        console.error('[AccountScreen] 2FA verified, navigating to dashboard');
        setShow2FA(false);
        setIsLoggedIn(true);
        setTimeout(() => {
          try {
            navigation.navigate('Dashboard');
          } catch (error) {
            console.error('Error navigating to dashboard after 2FA:', error);
            if (Sentry && typeof Sentry.captureException === 'function') {
              Sentry.captureException(error, {
                tags: { screen: 'AccountScreen', action: 'navigate2FADashboard' }
              });
            }
          }
        }, 150);
        return;
      }

      showAlert('Error', result.error || 'Invalid code');
    } catch (error: any) {
      console.error('2FA verify error:', error);
      if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { screen: 'AccountScreen', action: 'verify2FA' }
        });
      }
      showAlert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6F9B" />
      </View>
    );
  }

  // Show login form
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.loginContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-circle-outline" size={64} color="#FF6F9B" />
          </View>
          <Text style={styles.loginTitle}>Chammy Florals</Text>

          {!show2FA ? (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6B7280"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
                <Text style={styles.loginBtnText}>Login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.twoFactorText}>
                Enter the 6-digit code from your Google Authenticator app to complete login.
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons name="key-outline" size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter 6-digit code"
                  value={code2FA}
                  onChangeText={setCode2FA}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify2FA}>
                <Text style={styles.verifyBtnText}>Verify & Login</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => {
                  setShow2FA(false);
                  setCode2FA('');
                  setPendingEmail('');
                  setPendingPassword('');
                }}
              >
                <Text style={styles.backLinkText}>← Back to login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
      <CustomAlert
        visible={visible}
        title={alertConfig?.title || ''}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onDismiss={hideAlert}
        type={alertConfig?.type}
      />
    </KeyboardAvoidingView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  loginSubtext: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  loginBtn: {
    backgroundColor: '#FF6F9B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6F9B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  twoFactorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  verifyBtn: {
    width: '100%',
    backgroundColor: '#FF6F9B',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6F9B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  verifyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  backLink: {
    marginTop: 24,
  },
  backLinkText: {
    fontSize: 16,
    color: '#FF6F9B',
    fontWeight: '600',
  },
});

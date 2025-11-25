import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get Supabase config from Constants.expoConfig for production or process.env for development
const getSupabaseUrl = () => {
  if (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL) {
    return Constants.expoConfig.extra.EXPO_PUBLIC_SUPABASE_URL;
  }
  if (process.env.EXPO_PUBLIC_SUPABASE_URL) {
    return process.env.EXPO_PUBLIC_SUPABASE_URL;
  }
  return '';
};

const getSupabaseAnonKey = () => {
  if (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    return Constants.expoConfig.extra.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }
  return '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

console.log('Supabase config:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlSource: Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ? 'Constants' : 'process.env'
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase: URL or ANON_KEY is not set. Some operations may fail.');
  console.error('URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('Key:', supabaseAnonKey ? 'SET' : 'MISSING');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

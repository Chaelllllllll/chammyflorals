import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import UpdateModal from './src/components/UpdateModal';
import SplashScreen from './src/components/SplashScreen';

// Import existing screens
import OrdersScreen from './src/screens/OrdersScreen';
import AccountScreen from './src/screens/AccountScreen';

const Stack = createNativeStackNavigator();

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6F9B',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('Admin Push token:', token);
    } catch (error) {
      console.error('Error getting push token:', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export default function AppAdmin() {
  const notificationListener = React.useRef<any>(null);
  const responseListener = React.useRef<any>(null);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync();

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      const data = response.notification.request.content.data;
      if (data?.orderId) {
        console.log('Navigate to order:', data.orderId);
      }
    });

    // Check for app updates
    async function onFetchUpdateAsync() {
      try {
        // Check if running in development mode
        const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
        
        // Only check for updates in production and if Updates is available
        if (!isDev && Updates && typeof Updates.checkForUpdateAsync === 'function') {
          console.log('Checking for updates in production...');
          const update = await Updates.checkForUpdateAsync();
          console.log('Update check result:', update);

          if (update.isAvailable) {
            console.log('Update available, fetching...');
            await Updates.fetchUpdateAsync();
            setUpdateAvailable(true);
          }
        } else {
          console.log('Skipping update check (dev mode or Updates unavailable)');
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
        // Don't crash the app if update check fails
      }
    }

    onFetchUpdateAsync();

    // Cleanup listeners
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  if (!isReady) {
    return <SplashScreen onFinish={() => setIsReady(true)} />;
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#fff6f9',
            },
            headerTintColor: '#333',
          }}
        >
          <Stack.Screen 
            name="Account" 
            component={AccountScreen}
            options={{ 
              title: 'Chammy Florals - Admin',
              headerShown: false
            }}
          />
          <Stack.Screen 
            name="Orders" 
            component={OrdersScreen}
            options={{ title: 'All Orders' }}
          />
        </Stack.Navigator>
      </NavigationContainer>

      <UpdateModal
        visible={updateAvailable}
        onRestart={async () => {
          await Updates.reloadAsync();
        }}
        onLater={() => setUpdateAvailable(false)}
      />
    </AuthProvider>
  );
}

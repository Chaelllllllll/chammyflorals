import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import UpdateModal from './src/components/UpdateModal';

// Import admin screens
import AdminLoginScreen from './src/screens/admin/AdminLoginScreen';
import AdminDashboardScreen from './src/screens/admin/AdminDashboardScreen';
import AdminProductsScreen from './src/screens/admin/AdminProductsScreen';
import AdminReviewsScreen from './src/screens/admin/AdminReviewsScreen';
import AdminToDeliverScreen from './src/screens/admin/AdminToDeliverScreen';
import AdminTodoScreen from './src/screens/admin/AdminTodoScreen';
import AdminReportsScreen from './src/screens/admin/AdminReportsScreen';
import OrdersScreen from './src/screens/OrdersScreen';

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
        if (!__DEV__) {
          const update = await Updates.checkForUpdateAsync();

          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            setUpdateAvailable(true);
          }
        }
      } catch (error) {
        console.log('Error checking for updates:', error);
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
            name="AdminLogin" 
            component={AdminLoginScreen}
            options={{ 
              title: 'Chammy Florals - Admin',
              headerShown: false
            }}
          />
          <Stack.Screen 
            name="AdminDashboard" 
            component={AdminDashboardScreen}
            options={{ 
              title: 'Admin Dashboard',
              headerLeft: () => null // Prevent back navigation
            }}
          />
          <Stack.Screen 
            name="AdminTodo" 
            component={AdminTodoScreen}
            options={{ title: 'To Do' }}
          />
          <Stack.Screen 
            name="AdminToDeliver" 
            component={AdminToDeliverScreen}
            options={{ title: 'To Deliver' }}
          />
          <Stack.Screen 
            name="AdminOrders" 
            component={OrdersScreen}
            options={{ title: 'All Orders' }}
          />
          <Stack.Screen 
            name="AdminProducts" 
            component={AdminProductsScreen}
            options={{ title: 'Products' }}
          />
          <Stack.Screen 
            name="AdminReviews" 
            component={AdminReviewsScreen}
            options={{ title: 'Reviews' }}
          />
          <Stack.Screen 
            name="AdminReports" 
            component={AdminReportsScreen}
            options={{ title: 'Reports' }}
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

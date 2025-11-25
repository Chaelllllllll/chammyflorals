import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from './src/contexts/AuthContext';
import { CartProvider } from './src/contexts/CartContext';
import UpdateModal from './src/components/UpdateModal';
import SplashScreen from './src/components/SplashScreen';

// Import screens
import HomeScreen from './src/screens/HomeScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderSuccessScreen from './src/screens/OrderSuccessScreen';
import TrackOrderScreen from './src/screens/TrackOrderScreen';
import ReviewsScreen from './src/screens/ReviewsScreen';
import InquiryScreen from './src/screens/InquiryScreen';
import AccountScreen from './src/screens/AccountScreen';
import Sentry from './sentry.config';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Products') {
            iconName = focused ? 'flower' : 'flower-outline';
          } else if (route.name === 'Reviews') {
            iconName = focused ? 'star' : 'star-outline';
          } else if (route.name === 'Track') {
            iconName = focused ? 'location' : 'location-outline';
          } else if (route.name === 'Account') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#ff6f9b',
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: '#fff6f9',
        },
        headerTintColor: '#333',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Chammy Florals' }} />
      <Tab.Screen name="Products" component={ProductsScreen} />
      <Tab.Screen name="Reviews" component={ReviewsScreen} />
      <Tab.Screen name="Track" component={TrackOrderScreen} options={{ title: 'Track Order' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}

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
      console.log('Push token:', token);
      
      // Save token to AsyncStorage
      await AsyncStorage.setItem('expoPushToken', token);
    } catch (error) {
      console.error('Error getting push token:', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export default Sentry.wrap(function App() {
  const notificationListener = React.useRef<any>(null);
  const responseListener = React.useRef<any>(null);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'app',
      message: 'App started',
      level: 'info',
      data: {
        platform: Platform.OS,
        version: Constants.expoConfig?.version
      }
    });
    
    // Set up global error handler
    const errorHandler = (error: Error, isFatal?: boolean) => {
      Sentry.captureException(error, {
        tags: { isFatal: isFatal || false },
        extra: { errorType: 'globalError' }
      });
    };
    
    // Register for push notifications
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        Sentry.addBreadcrumb({
          category: 'push',
          message: 'Push notification token registered',
          level: 'info'
        });
      }
    }).catch(error => {
      Sentry.captureException(error, {
        tags: { action: 'pushTokenError' }
      });
    });

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      Sentry.addBreadcrumb({
        category: 'notification',
        message: 'Notification received',
        level: 'info',
        data: {
          title: notification.request.content.title,
          body: notification.request.content.body
        }
      });
      console.log('Notification received:', notification);
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      Sentry.addBreadcrumb({
        category: 'notification',
        message: 'Notification tapped',
        level: 'info',
        data: {
          title: response.notification.request.content.title
        }
      });
      console.log('Notification tapped:', response);
      // You can navigate to specific screens based on notification data
      const data = response.notification.request.content.data;
      if (data?.orderId) {
        // Navigate to order details
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
            if (Sentry && typeof Sentry.addBreadcrumb === 'function') {
              Sentry.addBreadcrumb({
                category: 'update',
                message: 'Update available, fetching',
                level: 'info'
              });
            }
            await Updates.fetchUpdateAsync();
            // Show custom update modal
            setUpdateAvailable(true);
          }
        } else {
          console.log('Skipping update check (dev mode or Updates unavailable)');
        }
      } catch (error: any) {
        console.error('Error checking for updates:', error);
        // Handle error silently - don't disrupt user experience
        if (Sentry && typeof Sentry.captureException === 'function') {
          Sentry.captureException(error, {
            tags: { action: 'updateError' }
          });
        }
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
      <CartProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#fff6f9" />
        <NavigationContainer
          onStateChange={(state) => {
            if (state) {
              const currentRoute = state.routes[state.index];
              Sentry.addBreadcrumb({
                category: 'navigation',
                message: 'Navigation changed',
                level: 'info',
                data: {
                  routeName: currentRoute?.name,
                  params: currentRoute?.params
                }
              });
            }
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: '#fff6f9',
              },
              headerTintColor: '#333',
              contentStyle: { backgroundColor: '#fff' },
            }}
          >
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabs} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="ProductDetail" 
              component={ProductDetailScreen} 
              options={{ title: 'Product Details' }}
            />
            <Stack.Screen 
              name="Inquiry" 
              component={InquiryScreen}
              options={{ title: 'Place Order' }}
            />
            <Stack.Screen 
              name="Checkout" 
              component={CheckoutScreen}
              options={{ title: 'Checkout' }}
            />
            <Stack.Screen 
              name="OrderSuccess" 
              component={OrderSuccessScreen}
              options={{ title: 'Order Success', headerLeft: () => null }}
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
      </CartProvider>
    </AuthProvider>
  );
});
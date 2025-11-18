# Chammy Florals - React Native Mobile App

A beautiful flower shop mobile application built with React Native and Expo, mirroring the functionality of the Chammy Florals website.

## Features

- 🌸 **Product Catalog**: Browse and search beautiful flower arrangements
- 🛒 **Shopping Cart**: Add items, adjust quantities, and manage cart
- 📦 **Order Placement**: Easy checkout process with delivery details
- 📍 **Order Tracking**: Track order status in real-time
- ⭐ **Reviews**: Read and write customer reviews
- 👨‍💼 **Admin Panel**: Manage orders, products, and view analytics
- 🔐 **Authentication**: Secure admin login with session management

## Tech Stack

- **React Native** - Mobile framework
- **Expo** - Development platform
- **TypeScript** - Type safety
- **React Navigation** - Navigation library
- **Supabase** - Backend and database
- **AsyncStorage** - Local data persistence

## Prerequisites

- Node.js (v20.14.0 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Android Studio (for Android development) or Xcode (for iOS)
- Expo Go app on your phone (for testing)

## Installation

1. **Clone the repository**
   ```bash
   cd mobile-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   EXPO_PUBLIC_API_URL=http://your-server-url:3000
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

## Running the App

### Development Build

- **Android**: `npm run android`
- **iOS**: `npm run ios` (macOS only)
- **Web**: `npm run web`

### Using Expo Go

1. Start the development server: `npm start`
2. Scan the QR code with:
   - Android: Expo Go app
   - iOS: Camera app (will open in Expo Go)

## Building for Production

### EAS Build (Recommended)

1. **Login to EAS**
   ```bash
   eas login
   ```

2. **Configure the project**
   ```bash
   eas init
   ```

3. **Build for Android (APK)**
   ```bash
   eas build --platform android --profile preview
   ```

4. **Build for Production**
   ```bash
   eas build --platform android --profile production
   ```

5. **Submit to Google Play Store**
   ```bash
   eas submit --platform android
   ```

## Project Structure

```
mobile-app/
├── src/
│   ├── config/           # Configuration files
│   │   └── supabase.ts   # Supabase client setup
│   ├── contexts/         # React contexts
│   │   ├── AuthContext.tsx
│   │   └── CartContext.tsx
│   ├── screens/          # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── ProductsScreen.tsx
│   │   ├── ProductDetailScreen.tsx
│   │   ├── CartScreen.tsx
│   │   ├── CheckoutScreen.tsx
│   │   ├── OrderSuccessScreen.tsx
│   │   ├── TrackOrderScreen.tsx
│   │   ├── ReviewsScreen.tsx
│   │   └── admin/
│   │       ├── AdminLoginScreen.tsx
│   │       └── AdminDashboardScreen.tsx
│   └── services/         # API services
│       └── api.ts
├── App.tsx               # Main app component
├── app.json              # Expo configuration
├── eas.json              # EAS Build configuration
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript configuration
```

## Key Features Implementation

### Navigation
The app uses React Navigation with:
- Bottom Tab Navigator for main screens (Home, Products, Cart, Reviews, Track)
- Stack Navigator for detailed views and admin screens

### State Management
- **AuthContext**: Manages authentication state and user session
- **CartContext**: Handles shopping cart operations

### API Integration
All API calls are centralized in `src/services/api.ts` and communicate with the backend server.

## Screens Overview

### Customer Screens
- **Home**: Welcome screen with features and quick links
- **Products**: Browse and search products with category filters
- **Product Detail**: View product details, select variants, add to cart
- **Cart**: Manage cart items and quantities
- **Checkout**: Enter delivery details and place order
- **Order Success**: Confirmation screen with order ID
- **Track Order**: Track order status by order ID
- **Reviews**: View and submit customer reviews

### Admin Screens
- **Admin Login**: Secure login for administrators
- **Admin Dashboard**: Overview with statistics and quick actions

## Configuration

### App.json
Update `app.json` with your app details:
- `name`: Your app name
- `slug`: URL-friendly app identifier
- `version`: App version
- `android.package`: Android package name (com.yourcompany.appname)

### EAS.json
Configure build profiles:
- `development`: Development builds
- `preview`: Test builds (APK)
- `production`: Production builds (AAB for Play Store)

## Environment Variables

Required environment variables:
- `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `EXPO_PUBLIC_API_URL`: Backend API URL

## Troubleshooting

### Common Issues

1. **Metro bundler issues**
   ```bash
   npx expo start -c
   ```

2. **Dependency conflicts**
   ```bash
   rm -rf node_modules
   npm install
   ```

3. **Android build issues**
   ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and questions:
- Create an issue on GitHub
- Contact support at support@chammyflorals.com

## License

This project is proprietary software. All rights reserved.

## Author

Chammy Florals Team

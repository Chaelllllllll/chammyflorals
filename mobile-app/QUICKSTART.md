# Quick Start Guide - Chammy Florals Mobile App

## 🚀 Getting Started

### Step 1: Configure Environment Variables

1. Open the `.env` file in the `mobile-app` folder
2. Update with your actual values:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_actual_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
   EXPO_PUBLIC_API_URL=http://your-server-ip:3000
   ```

### Step 2: Install Dependencies (Already Done)

The dependencies are already installed. If you need to reinstall:
```bash
cd mobile-app
npm install
```

### Step 3: Start Development Server

```bash
cd mobile-app
npm start
```

This will open Expo Dev Tools in your browser.

### Step 4: Run on Your Device

#### Option A: Using Expo Go (Easiest)

1. Install **Expo Go** app on your phone:
   - Android: [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)

2. Scan the QR code from the terminal with:
   - **Android**: Expo Go app
   - **iOS**: Camera app (will open in Expo Go)

#### Option B: Using Android Emulator

1. Make sure Android Studio is installed
2. Create and start an Android emulator
3. Press `a` in the terminal to open on Android

#### Option C: Using iOS Simulator (macOS only)

1. Make sure Xcode is installed
2. Press `i` in the terminal to open on iOS

### Step 5: Testing the App

1. **Browse Products**: Navigate through the Products tab
2. **Add to Cart**: Select a product, choose variant, add to cart
3. **Checkout**: Go to cart, proceed to checkout
4. **Track Orders**: Use the Track tab to check order status
5. **Leave Reviews**: Write reviews in the Reviews tab
6. **Admin Access**: Use the admin login screen to access dashboard

## 🏗️ Building for Production

### Build APK for Testing

```bash
cd mobile-app
eas build --platform android --profile preview
```

### Build for Play Store

```bash
cd mobile-app
eas build --platform android --profile production
```

## 📱 App Structure

```
mobile-app/
├── src/
│   ├── config/           # Supabase configuration
│   ├── contexts/         # Auth & Cart state management
│   ├── screens/          # All app screens
│   │   ├── HomeScreen
│   │   ├── ProductsScreen
│   │   ├── CartScreen
│   │   ├── CheckoutScreen
│   │   ├── ReviewsScreen
│   │   └── admin/        # Admin screens
│   └── services/         # API calls
├── App.tsx               # Navigation setup
└── .env                  # Environment variables
```

## 🎨 Features

✅ Product browsing with search & filters
✅ Shopping cart management
✅ Order placement & checkout
✅ Order tracking
✅ Customer reviews
✅ Admin dashboard
✅ Responsive design
✅ Offline cart storage

## 🔧 Troubleshooting

### Clear Cache
```bash
npx expo start -c
```

### Reset Dependencies
```bash
rm -rf node_modules
npm install
```

### Port Already in Use
```bash
npx expo start --port 8082
```

## 📞 Need Help?

- Check the full README.md for detailed documentation
- Review the API service in `src/services/api.ts`
- Ensure your backend server is running
- Verify environment variables are correct

## 🎯 Next Steps

1. Update the `.env` file with your actual credentials
2. Start the development server
3. Test on your phone with Expo Go
4. Build APK for distribution
5. Submit to Google Play Store

Happy coding! 🌸

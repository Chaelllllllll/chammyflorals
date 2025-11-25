# Building Separate Customer and Admin Apps

This mobile app project supports building **two separate applications**:

1. **Customer App** - For customers to browse products, place orders, and track deliveries
2. **Admin App** - For administrators to manage orders, products, reviews, and view reports

## 📱 App Differences

### Customer App
- **Name**: Chammy Florals
- **Package ID**: `com.chammyflorals.app`
- **Features**: Browse products, place orders, track orders, view reviews
- **Entry Point**: `App.tsx`
- **Config**: `app.json`

### Admin App
- **Name**: Chammy Florals Admin
- **Package ID**: `com.chammyflorals.admin`
- **Features**: Login required, manage orders/products/reviews, view reports
- **Entry Point**: `AppAdmin.tsx`
- **Config**: `app.admin.json`

## 🛠️ Building the Apps

### Build Customer App

```bash
# Development build (for testing)
npx expo start

# Preview build
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production build
eas build --profile production --platform android
eas build --profile production --platform ios
```

### Build Admin App

To build the admin app, you need to temporarily swap the entry point and config:

```bash
# Step 1: Backup and swap files
# Windows (PowerShell)
Copy-Item App.tsx App.customer.tsx
Copy-Item AppAdmin.tsx App.tsx
Copy-Item app.json app.customer.json
Copy-Item app.admin.json app.json

# Step 2: Update index.ts to use App.tsx
# The index.ts already imports from App.tsx, so no change needed

# Step 3: Build the admin app
eas build --profile production --platform android
eas build --profile production --platform ios

# Step 4: Restore customer app files
Copy-Item App.customer.tsx App.tsx
Copy-Item app.customer.json app.json
```

### Automated Build Script

Create a PowerShell script `build-admin.ps1`:

```powershell
# Build Admin App Script
Write-Host "Building Admin App..." -ForegroundColor Green

# Backup customer files
Copy-Item App.tsx App.customer.backup.tsx -Force
Copy-Item app.json app.customer.backup.json -Force

# Swap to admin files
Copy-Item AppAdmin.tsx App.tsx -Force
Copy-Item app.admin.json app.json -Force

# Build
Write-Host "Starting EAS build..." -ForegroundColor Yellow
eas build --profile production --platform all

# Restore customer files
Write-Host "Restoring customer files..." -ForegroundColor Yellow
Copy-Item App.customer.backup.tsx App.tsx -Force
Copy-Item App.customer.backup.json app.json -Force

Write-Host "Build complete! Customer files restored." -ForegroundColor Green
```

Run it with:
```bash
powershell -ExecutionPolicy Bypass -File build-admin.ps1
```

## 📦 Alternative: Use App Variants (Recommended)

Update `eas.json` to support multiple app variants:

```json
{
  "build": {
    "customer": {
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_VARIANT": "customer"
      }
    },
    "admin": {
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_VARIANT": "admin"
      }
    }
  }
}
```

Then modify `index.ts`:

```typescript
import { registerRootComponent } from 'expo';
import AppCustomer from './App';
import AppAdmin from './AppAdmin';

const APP_VARIANT = process.env.APP_VARIANT || 'customer';

const App = APP_VARIANT === 'admin' ? AppAdmin : AppCustomer;

registerRootComponent(App);
```

Build with:
```bash
# Customer app
eas build --profile customer --platform android

# Admin app
eas build --profile admin --platform android
```

## 🚀 Quick Start

### Running Customer App Locally
```bash
cd mobile-app
npm install
npx expo start
```

### Running Admin App Locally
```bash
cd mobile-app
npm install

# Temporarily use admin entry point
# Edit index.ts to import AppAdmin instead of App
npx expo start
```

## 📱 Testing

### Customer App
- Scan QR code with Expo Go
- Browse products and place test orders
- Track orders with test order IDs

### Admin App
- Login with admin credentials
- View and manage orders
- Update product catalog
- Monitor reviews and reports

## 🔐 Admin Credentials

The admin app requires login. Default credentials should be configured in your backend:
- Email: Set in your `.env` file
- Password: Set in your `.env` file

## 📝 Notes

- Both apps use the same API backend (`EXPO_PUBLIC_API_URL`)
- Both apps share the same codebase but have different entry points
- Admin app has additional screens not available in customer app
- Customer app has shopping cart features not needed in admin app
- Both apps support push notifications for order updates

## 🎨 Customization

To customize app icons and splash screens:

1. **Customer App**: Update `assets/logo.png`
2. **Admin App**: Create `assets/admin-logo.png` (use different color/design)
3. Run `npx expo prebuild` to regenerate native projects

## 📤 Publishing Updates

After building, publish OTA updates:

```bash
# Customer app
eas update --branch production --message "Customer app update"

# Admin app (with config swapped)
eas update --branch production --message "Admin app update"
```

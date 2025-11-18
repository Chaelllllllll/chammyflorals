# Chammy Florals Mobile App - Deployment & Installation Guide

## 📦 Deployment to Vercel

Your mobile app is now configured to deploy alongside your web app on Vercel!

### What's Been Set Up:

1. **Integrated Deployment**: Mobile app builds and deploys with your main project
2. **Access URL**: `https://yourdomain.vercel.app/mobile/`
3. **API Integration**: Automatically connects to your existing backend

### Deploy Steps:

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Add mobile app deployment"
   git push
   ```

2. **Vercel will automatically:**
   - Build your mobile React app
   - Deploy it to `/mobile/` route
   - Connect it to your existing backend API

3. **Access your apps:**
   - Web version: `https://yourdomain.vercel.app/`
   - Mobile version: `https://yourdomain.vercel.app/mobile/`

---

## 💻 Install as Desktop App (3 Ways)

### Method 1: Install via Browser (Easiest)

**Using Chrome or Edge on Windows:**

1. Open your mobile app: `https://yourdomain.vercel.app/mobile/`
2. Look for the **install icon** (⊕ or 🖥️) in the address bar
3. Click it and select **"Install"**
4. The app will:
   - Create a desktop shortcut
   - Open in its own window (no browser UI)
   - Appear in Start Menu
   - Work offline once cached!

**Using Firefox:**
1. Click the **⋮** menu → **"Install site as app"**

**Using Safari (Mac):**
1. File → Add to Dock

---

### Method 2: Manual Desktop Shortcut

**Windows:**

1. Right-click on Desktop → New → Shortcut
2. Enter location:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=https://yourdomain.vercel.app/mobile/
   ```
3. Name it "Chammy Florals"
4. Right-click the shortcut → Properties → Change Icon
5. Browse to a custom icon or use the default

**Mac:**

1. Open Automator
2. New → Application
3. Add "Run Shell Script" action:
   ```bash
   open -a "Google Chrome" --args --app=https://yourdomain.vercel.app/mobile/
   ```
4. Save as "Chammy Florals.app" in Applications

---

### Method 3: Create Native Windows App with WebView2

**Using WebView2 (Most Native Experience):**

I can create a simple Windows executable that wraps your web app. This gives you:
- A real `.exe` file
- Windows integration
- System tray icon
- No browser chrome at all

Would you like me to create this for you? It requires:
- Visual Studio or .NET SDK
- About 5 minutes to set up

---

## 🔧 Build Configuration

The following files have been updated for deployment:

1. **`package.json`** - Added build scripts
2. **`vercel.json`** - Routes mobile app to `/mobile/`
3. **`mobile/vite.config.js`** - Set base path to `/mobile/`
4. **`mobile/index.html`** - Added PWA manifest
5. **`mobile/public/manifest.json`** - PWA configuration

---

## 📱 Features After Installation

Once installed, your app will have:

✅ **Standalone Window** - No browser UI, looks like native app
✅ **Desktop Icon** - Launch from desktop or Start Menu
✅ **Fast Loading** - Cached for instant startup
✅ **Offline Support** - Works even without internet (cached pages)
✅ **Push Notifications** - Can be enabled if needed
✅ **Auto Updates** - Always gets latest version from server

---

## 🚀 Test Before Deploying

**Local Testing:**

1. Build the mobile app:
   ```bash
   cd mobile
   npm run build
   ```

2. Preview the production build:
   ```bash
   npm run preview
   ```

3. Open: `http://localhost:4173/`

---

## 🔍 Troubleshooting

**Issue: Mobile app shows blank page after deployment**
- Check browser console for errors
- Verify `/mobile/` route is accessible
- Ensure `base: '/mobile/'` is in vite.config.js

**Issue: API calls fail**
- Update `mobile/src/services/api.js` to use absolute URLs
- Check CORS settings on backend

**Issue: Images not loading**
- Verify image paths start with `/flowers/` (absolute paths)
- Check that public folder is deployed correctly

---

## 📞 Need Help?

If you encounter any issues:
1. Check browser console for errors
2. Verify Vercel deployment logs
3. Test locally first with `npm run build` and `npm run preview`

Enjoy your new mobile app! 🌸

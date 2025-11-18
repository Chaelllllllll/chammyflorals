# Quick Start Guide - Chammy Florals Mobile

## 🚀 Getting Started in 3 Steps

### 1. Install Dependencies (Already Done! ✓)
```bash
cd mobile
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

The app will open at **http://localhost:3000**

### 3. Start Backend Server (Required)
In a separate terminal, start your backend server:
```bash
cd ..
npm start
```

Backend should be running on **http://localhost:5000**

---

## 📱 What You Get

### Mobile-Optimized Features
- ✅ Home page with featured products
- ✅ Product browsing and ordering
- ✅ Order tracking system
- ✅ Customer reviews
- ✅ Bottom navigation bar
- ✅ Responsive mobile-first design

### Pages
1. **Home** (`/`) - Landing page with quick actions
2. **Products** (`/products`) - Browse and order flowers
3. **Reviews** (`/reviews`) - Read and write reviews
4. **Track Order** (`/track`) - Track order status
5. **Order Success** (`/order-success`) - Order confirmation

---

## 🔧 Configuration

### API Connection
The mobile app connects to your existing backend. Configure in `.env`:

```env
# Leave empty for same-domain deployment
VITE_API_URL=

# Or set for local development
VITE_API_URL=http://localhost:5000
```

---

## 📦 Build for Production

```bash
npm run build
```

Output will be in `dist/` folder. Deploy this folder to any static hosting:
- Vercel
- Netlify
- GitHub Pages
- Your own server

---

## 🎨 Customization

### Colors
Edit CSS variables in `src/index.css`:
```css
:root {
  --primary-color: #ff6f9b;
  --primary-light: #ffe9f0;
  --primary-dark: #e55b87;
}
```

### Logo
Replace the emoji in `src/components/MobileNav.jsx` with your logo image.

---

## 🐛 Troubleshooting

### Port Already in Use
If port 3000 is busy, Vite will automatically try 3001, 3002, etc.

### API Connection Issues
- Make sure backend is running on port 5000
- Check CORS settings in backend
- Verify VITE_API_URL in .env

### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📱 Testing on Mobile Device

### Option 1: Same Network
1. Find your computer's IP address
2. Start dev server: `npm run dev`
3. On mobile, visit: `http://YOUR_IP:3000`

### Option 2: Deploy to Vercel (Free)
```bash
npm i -g vercel
vercel
```

---

## 🎯 Next Steps

- [ ] Customize colors and branding
- [ ] Add your flower images to `/public/flowers/`
- [ ] Test on real mobile devices
- [ ] Deploy to production
- [ ] Configure environment variables on hosting platform

---

## 💡 Tips

- The app uses proxy in development (vite.config.js)
- For production, set VITE_API_URL to your backend URL
- All API calls go through `src/services/api.js`
- Mobile-first styling is in `src/App.css` and page-specific CSS files

---

## Need Help?

Check the full README.md for detailed documentation.

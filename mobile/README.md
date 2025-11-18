# Chammy Florals - Mobile Version

A mobile-optimized React application for the Chammy Florals flower shop.

## Features

- 🌸 Browse flower products with mobile-friendly interface
- 📱 Place orders with easy-to-use forms
- 🔍 Track orders in real-time
- ⭐ Read and write customer reviews
- 📲 Bottom navigation for easy mobile access
- 🎨 Mobile-first responsive design

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Axios** - HTTP client for API calls
- **CSS3** - Custom styling with mobile-first approach

## Prerequisites

- Node.js 16+ installed
- Backend server running (see main project)

## Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Copy the example env file
copy .env.example .env

# Edit .env and set your API URL if needed
# For local development with backend on port 5000:
VITE_API_URL=http://localhost:5000
```

## Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Building for Production

Build the app for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

The build output will be in the `dist` folder.

## Project Structure

```
mobile/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── MobileNav.jsx
│   │   ├── BottomNav.jsx
│   │   └── Loading.jsx
│   ├── pages/            # Page components
│   │   ├── Home.jsx
│   │   ├── Products.jsx
│   │   ├── Reviews.jsx
│   │   ├── TrackOrder.jsx
│   │   └── OrderSuccess.jsx
│   ├── services/         # API service layer
│   │   └── api.js
│   ├── App.jsx          # Main app component
│   ├── App.css          # Global app styles
│   ├── main.jsx         # Entry point
│   └── index.css        # Base styles
├── index.html           # HTML template
├── vite.config.js       # Vite configuration
└── package.json         # Dependencies and scripts
```

## API Integration

The mobile app connects to the existing backend API:

- `GET /api/products` - Fetch all products
- `POST /api/inquiries` - Create new order
- `GET /api/track/:orderId` - Track order status
- `GET /api/reviews` - Fetch all reviews
- `POST /api/reviews` - Submit a review
- `GET /api/orders/delivered` - Get delivered orders

## Mobile Features

### Bottom Navigation
Fixed bottom navigation bar with quick access to:
- Home
- Products
- Reviews
- Track Order

### Responsive Design
- Touch-friendly UI elements
- Optimized for small screens
- Mobile-first CSS approach
- Smooth transitions and animations

### Optimized Forms
- Large, easy-to-tap buttons
- Clear form validation
- Mobile keyboard optimizations
- Modal dialogs for better UX

## Deployment

### Deploy with Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

### Deploy with Netlify

1. Build the app:
```bash
npm run build
```

2. Deploy the `dist` folder to Netlify

### Environment Variables
Make sure to set `VITE_API_URL` in your deployment platform's environment variables.

## Browser Support

- Chrome (Android & Desktop)
- Safari (iOS & Desktop)
- Firefox (Android & Desktop)
- Edge (Desktop)

## License

Same as main project

## Support

For issues or questions, please contact the development team.

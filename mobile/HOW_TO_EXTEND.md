# How to Add New Pages/Features

## Adding a New Page

### Step 1: Create Page Component

Create `src/pages/NewPage.jsx`:

```jsx
import MobileNav from '../components/MobileNav';
import BottomNav from '../components/BottomNav';
import './NewPage.css';

const NewPage = () => {
  return (
    <div>
      <MobileNav />
      
      <div className="page-container">
        <h1 className="page-title">New Page</h1>
        
        {/* Your content here */}
        
      </div>

      <BottomNav />
    </div>
  );
};

export default NewPage;
```

### Step 2: Create Page Styles

Create `src/pages/NewPage.css`:

```css
/* Your page-specific styles */
.custom-class {
  /* styles */
}
```

### Step 3: Add Route

Edit `src/App.jsx`:

```jsx
import NewPage from './pages/NewPage'

// Inside <Routes>:
<Route path="/new-page" element={<NewPage />} />
```

### Step 4: Add Navigation Link (Optional)

Edit `src/components/BottomNav.jsx` to add to bottom nav:

```jsx
<Link to="/new-page" className="nav-item">
  <i className="fas fa-icon-name"></i>
  <span>New</span>
</Link>
```

---

## Adding a New API Endpoint

### Step 1: Add to API Service

Edit `src/services/api.js`:

```javascript
export const getNewData = async () => {
  const response = await api.get('/api/new-endpoint');
  return response.data;
};

export const createNewItem = async (data) => {
  const response = await api.post('/api/new-endpoint', data);
  return response.data;
};
```

### Step 2: Use in Component

```jsx
import { getNewData } from '../services/api';
import { useState, useEffect } from 'react';

const YourComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getNewData();
        setData(result);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) return <Loading />;

  return (
    <div>
      {/* Render your data */}
    </div>
  );
};
```

---

## Adding a New Component

### Step 1: Create Component File

Create `src/components/NewComponent.jsx`:

```jsx
const NewComponent = ({ prop1, prop2 }) => {
  return (
    <div className="new-component">
      {/* Component JSX */}
    </div>
  );
};

export default NewComponent;
```

### Step 2: Create Component Styles (Optional)

Create `src/components/NewComponent.css`:

```css
.new-component {
  /* styles */
}
```

Import in component:
```jsx
import './NewComponent.css';
```

### Step 3: Use Component

```jsx
import NewComponent from '../components/NewComponent';

<NewComponent prop1="value" prop2="value" />
```

---

## Adding a Form

### Example: Contact Form

```jsx
import { useState } from 'react';
import { submitContact } from '../services/api';

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: '', message: '' });

    try {
      await submitContact(formData);
      setStatus({ 
        type: 'success', 
        message: 'Message sent successfully!' 
      });
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: 'Failed to send message.' 
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {status.message && (
        <div className={`alert alert-${status.type}`}>
          {status.message}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Name *</label>
        <input 
          type="text"
          name="name"
          className="form-control"
          value={formData.name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Email *</label>
        <input 
          type="email"
          name="email"
          className="form-control"
          value={formData.email}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Message *</label>
        <textarea 
          name="message"
          className="form-control"
          value={formData.message}
          onChange={handleChange}
          required
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block">
        Send Message
      </button>
    </form>
  );
};
```

---

## Adding a Modal

```jsx
import { useState } from 'react';

const ComponentWithModal = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button 
        className="btn btn-primary"
        onClick={() => setShowModal(true)}
      >
        Open Modal
      </button>

      {showModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowModal(false)}
        >
          <div 
            className="modal" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Modal Title</h2>
              <button 
                className="modal-close" 
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {/* Modal content */}
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

---

## Adding Global State (Optional)

If you need shared state across components, use React Context:

### Step 1: Create Context

Create `src/context/AppContext.jsx`:

```jsx
import { createContext, useContext, useState } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);

  return (
    <AppContext.Provider value={{ 
      user, 
      setUser, 
      cart, 
      setCart 
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
```

### Step 2: Wrap App

Edit `src/main.jsx`:

```jsx
import { AppProvider } from './context/AppContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
)
```

### Step 3: Use Context

```jsx
import { useApp } from '../context/AppContext';

const YourComponent = () => {
  const { cart, setCart } = useApp();

  const addToCart = (item) => {
    setCart([...cart, item]);
  };

  return (
    <div>
      <p>Cart items: {cart.length}</p>
      <button onClick={() => addToCart(newItem)}>
        Add to Cart
      </button>
    </div>
  );
};
```

---

## Adding Authentication (Example)

### Step 1: Create Auth Service

Add to `src/services/api.js`:

```javascript
export const login = async (credentials) => {
  const response = await api.post('/api/auth/login', credentials);
  // Store token
  localStorage.setItem('token', response.data.token);
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('token');
};

export const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Add token to requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Step 2: Create Protected Route

```jsx
import { Navigate } from 'react-router-dom';
import { getAuthToken } from '../services/api';

const ProtectedRoute = ({ children }) => {
  const token = getAuthToken();
  
  if (!token) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

// Usage in App.jsx:
<Route 
  path="/admin" 
  element={
    <ProtectedRoute>
      <AdminPage />
    </ProtectedRoute>
  } 
/>
```

---

## Tips for Development

1. **Hot Reload**: Changes automatically reflect in browser
2. **Console**: Use browser DevTools to debug
3. **React DevTools**: Install browser extension for component inspection
4. **API Testing**: Use browser Network tab to see API calls
5. **Mobile Testing**: Use browser DevTools device emulation

---

## Common Patterns

### Loading State
```jsx
const [loading, setLoading] = useState(true);
// ... fetch data ...
if (loading) return <Loading />;
```

### Error Handling
```jsx
try {
  await apiCall();
} catch (error) {
  setError(error.response?.data?.message || 'An error occurred');
}
```

### Conditional Rendering
```jsx
{items.length > 0 ? (
  items.map(item => <Item key={item.id} {...item} />)
) : (
  <p>No items found</p>
)}
```

### List Rendering
```jsx
{items.map((item, index) => (
  <div key={item.id || index}>
    {item.name}
  </div>
))}
```

---

## Need More Help?

- Check existing components in `src/pages/` for examples
- See `COMPONENT_GUIDE.jsx` for component patterns
- React docs: https://react.dev
- Vite docs: https://vitejs.dev

import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * MOBILE NAVIGATION COMPONENT
 * 
 * A sticky top navigation bar that displays the brand logo/name.
 * Stays at the top when scrolling for easy access.
 * 
 * Usage:
 * <MobileNav />
 * 
 * Customization:
 * - Change the emoji to your logo: <img src="/logo.png" alt="Logo" />
 * - Update colors in App.css (.mobile-nav class)
 */

const MobileNav = () => {
  return (
    <div className="mobile-nav">
      <Link to="/" className="logo">
        {/* Replace this emoji with your logo */}
        🌸 Chammy Florals
      </Link>
    </div>
  );
};

/**
 * BOTTOM NAVIGATION COMPONENT
 * 
 * Fixed bottom navigation bar with 4 main sections.
 * Highlights active page automatically using React Router.
 * 
 * Features:
 * - Auto-highlights current page
 * - Font Awesome icons
 * - Touch-friendly spacing
 * 
 * Customization:
 * - Add more nav items by adding Link elements
 * - Change icons using Font Awesome classes
 */

export const BottomNavExample = () => {
  // The actual component uses useLocation() from react-router-dom
  // to automatically detect the active page
  
  return (
    <nav className="mobile-nav-bottom">
      <Link to="/" className="nav-item active">
        <i className="fas fa-home"></i>
        <span>Home</span>
      </Link>
      <Link to="/products" className="nav-item">
        <i className="fas fa-flower"></i>
        <span>Products</span>
      </Link>
      <Link to="/reviews" className="nav-item">
        <i className="fas fa-star"></i>
        <span>Reviews</span>
      </Link>
      <Link to="/track" className="nav-item">
        <i className="fas fa-search"></i>
        <span>Track</span>
      </Link>
    </nav>
  );
};

/**
 * LOADING COMPONENT
 * 
 * Simple loading spinner shown while data is being fetched.
 * 
 * Usage:
 * {loading ? <Loading /> : <YourContent />}
 */

export const LoadingExample = () => {
  return (
    <div className="loading">
      <div className="spinner"></div>
    </div>
  );
};

/**
 * MODAL PATTERN
 * 
 * Used for forms and detailed views. Clicking overlay closes modal.
 * 
 * Features:
 * - Click outside to close
 * - Header with title and close button
 * - Scrollable body
 * - Footer for actions
 */

export const ModalExample = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Open Modal
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Modal Title</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>Your content here...</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
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

/**
 * BUTTON STYLES
 * 
 * Available button classes:
 * - .btn btn-primary - Pink filled button
 * - .btn btn-secondary - Pink outlined button
 * - .btn-block - Full width button
 */

export const ButtonExamples = () => {
  return (
    <div style={{ padding: '1rem' }}>
      <button className="btn btn-primary">
        Primary Button
      </button>
      <br /><br />
      <button className="btn btn-secondary">
        Secondary Button
      </button>
      <br /><br />
      <button className="btn btn-primary btn-block">
        Block Button (Full Width)
      </button>
    </div>
  );
};

/**
 * CARD COMPONENT PATTERN
 * 
 * Used for products, reviews, and other content cards.
 * 
 * Features:
 * - Shadow on hover
 * - Rounded corners
 * - Image support
 */

export const CardExample = () => {
  return (
    <div className="card">
      <img 
        src="/flowers/placeholder.jpg" 
        alt="Product"
        style={{ width: '100%', height: '200px', objectFit: 'cover' }}
      />
      <div className="card-body">
        <h3 className="card-title">Card Title</h3>
        <p className="card-text">Card description goes here...</p>
        <button className="btn btn-primary btn-block">
          Action Button
        </button>
      </div>
    </div>
  );
};

/**
 * FORM PATTERN
 * 
 * Standard form with validation and error handling.
 * 
 * Features:
 * - Labeled inputs
 * - Validation
 * - Error/success messages
 */

export const FormExample = () => {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Your API call here
    setStatus({ type: 'success', message: 'Form submitted!' });
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
          className="form-control" 
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Email *</label>
        <input 
          type="email" 
          className="form-control" 
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block">
        Submit
      </button>
    </form>
  );
};

/**
 * ALERT/MESSAGE PATTERN
 * 
 * Used for success, error, and info messages.
 * 
 * Types:
 * - alert-success - Green (success messages)
 * - alert-error - Red (error messages)
 * - alert-info - Blue (info messages)
 */

export const AlertExamples = () => {
  return (
    <div style={{ padding: '1rem' }}>
      <div className="alert alert-success">
        Success! Your action was completed.
      </div>
      <div className="alert alert-error">
        Error! Something went wrong.
      </div>
      <div className="alert alert-info">
        Info: Here's some helpful information.
      </div>
    </div>
  );
};

/**
 * GRID LAYOUT
 * 
 * Responsive grid for products or other items.
 * Automatically adjusts columns based on screen size.
 */

export const GridExample = () => {
  return (
    <div className="grid">
      <div className="card">Item 1</div>
      <div className="card">Item 2</div>
      <div className="card">Item 3</div>
      <div className="card">Item 4</div>
    </div>
  );
};

/**
 * API SERVICE USAGE
 * 
 * How to use the API service in your components:
 */

export const APIUsageExample = () => {
  /*
  import { getProducts, createOrder, trackOrder } from '../services/api';

  // Fetch products
  const products = await getProducts();

  // Create order
  const order = await createOrder({
    customer_name: 'John Doe',
    customer_contact: '09123456789',
    flower_type: 'Roses',
    quantity: 1,
    // ... other fields
  });

  // Track order
  const orderStatus = await trackOrder('ABC12345');

  // Error handling
  try {
    const data = await getProducts();
  } catch (error) {
    console.error('Error:', error);
    // Show error message to user
  }
  */
};

export default MobileNav;

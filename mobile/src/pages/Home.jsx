import { useState, useEffect } from 'react';
import { getProducts, createOrder, trackOrder, getReviews } from '../services/api';

const Home = () => {
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [trackOrderId, setTrackOrderId] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [orderForm, setOrderForm] = useState({
    user_name: '',
    user_email: '',
    fb_link: '',
    items: [{ flower_type: '', color: '', quantity: 1 }],
    message: '',
    rush: 'No'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsData, reviewsData] = await Promise.all([
        getProducts(),
        getReviews().catch(() => [])
      ]);
      setProducts(productsData);
      setReviews(reviewsData.slice(0, 3));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => 
    searchQuery === '' || 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    try {
      const orderData = {
        customer_name: orderForm.user_name,
        customer_contact: orderForm.fb_link,
        flower_type: orderForm.items[0].flower_type,
        quantity: orderForm.items[0].quantity,
        special_instructions: orderForm.message,
        customer_address: 'N/A',
        delivery_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash'
      };
      
      await createOrder(orderData);
      alert('Order placed successfully!');
      setShowOrderModal(false);
      setOrderForm({
        user_name: '',
        user_email: '',
        fb_link: '',
        items: [{ flower_type: '', color: '', quantity: 1 }],
        message: '',
        rush: 'No'
      });
    } catch (error) {
      alert('Failed to place order: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await trackOrder(trackOrderId);
      setTrackResult(data);
    } catch (error) {
      setTrackResult({ error: 'Order not found' });
    }
  };

  const addItem = () => {
    setOrderForm({
      ...orderForm,
      items: [...orderForm.items, { flower_type: '', color: '', quantity: 1 }]
    });
  };

  const removeItem = (index) => {
    const newItems = orderForm.items.filter((_, i) => i !== index);
    setOrderForm({ ...orderForm, items: newItems });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...orderForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setOrderForm({ ...orderForm, items: newItems });
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{minHeight: '100vh'}}>
        <div className="spinner-border text-pink" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
        <div className="container">
          <a className="navbar-brand" href="/">Chammy Florals</a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav">
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse" id="mainNav">
            <ul className="navbar-nav ms-md-auto align-items-lg-center">
              <li className="nav-item me-2 my-2 my-lg-0">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowTrackModal(true)}>
                  <i className="fa fa-map-marker-alt me-1"></i>Track Order
                </button>
              </li>
              <li className="nav-item me-2 my-2 my-lg-0">
                <a className="btn btn-sm btn-outline-pink" href="/reviews">
                  <i className="fa fa-star me-1"></i>Reviews
                </a>
              </li>
              <li className="nav-item my-2 my-lg-0">
                <button className="btn btn-pink" onClick={() => setShowOrderModal(true)}>
                  <i className="fa fa-shopping-bag me-1"></i>Order Now
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="text-center py-4 py-md-5">
        <div className="hero">
          <div className="container" style={{padding: '1rem'}}>
            <div className="hero-card rounded-4 shadow-sm text-center position-relative overflow-hidden">
              <div className="position-absolute top-0 start-0 opacity-25" style={{fontSize: '120px', color: '#ff99bb', transform: 'rotate(-15deg)', margin: '-30px 0 0 -30px'}}>🌸</div>
              <div className="position-absolute bottom-0 end-0 opacity-25" style={{fontSize: '120px', color: '#ff99bb', transform: 'rotate(15deg)', margin: '0 -30px -30px 0'}}>💐</div>

              <div className="position-relative" style={{zIndex: 1}}>
                <h1 className="fw-bold display-5 text-pink mb-3">Beautiful Bouquets & Keychains</h1>
                <p className="lead text-muted mb-4 mx-auto" style={{maxWidth: '600px'}}>
                  Bloom with love — Chammy Florals crafts delicate, handcrafted bouquets and keepsakes for every occasion.
                </p>
                <div className="d-flex justify-content-center gap-2 gap-md-3 flex-wrap mb-3">
                  <button className="btn btn-pink btn-lg px-4" onClick={() => setShowOrderModal(true)}>
                    <i className="fa fa-shopping-bag me-2"></i>Order Now
                  </button>
                  <button className="btn btn-outline-pink btn-lg px-4" onClick={() => setShowTrackModal(true)}>
                    <i className="fa fa-map-marker-alt me-2"></i>Track Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section className="container my-5">
        <div className="mb-3">
          <div className="text-center">
            <h2 className="fw-bold mb-0">Our Collections</h2>
            <div className="small text-muted">Handpicked & handcrafted — find the perfect arrangement</div>
          </div>
          <div className="mt-3 d-flex justify-content-center">
            <form className="d-flex mx-auto" style={{maxWidth:'560px', width:'100%'}} onSubmit={(e) => e.preventDefault()}>
              <input 
                className="form-control form-control-sm flex-fill" 
                placeholder="Search products"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="btn btn-pink btn-sm ms-2" type="button">Search</button>
            </form>
          </div>
        </div>

        <div className="row g-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="col-6 col-md-4 col-lg-3">
              <div className="card product-card h-100" style={{cursor: 'pointer'}} onClick={() => { setSelectedProduct(product); setShowProductModal(true); }}>
                <img 
                  src={product.image_url || '/flowers/bouquetwithglitter.jfif'} 
                  className="card-img-top"
                  alt={product.name}
                  onError={(e) => { e.target.src = '/flowers/bouquetwithglitter.jfif'; }}
                />
                <div className="card-body">
                  <h5 className="card-title">{product.name}</h5>
                  <p className="text-muted small mb-2">{product.category}</p>
                  {product.pricing && product.pricing.length > 0 && (
                    <p className="text-pink fw-bold mb-2">₱{product.pricing[0].price}</p>
                  )}
                  <div className="d-flex gap-2">
                    <button className="btn btn-pink btn-sm flex-fill" onClick={(e) => { e.stopPropagation(); setShowOrderModal(true); }}>
                      <i className="fa fa-shopping-bag me-1"></i>Order
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews Preview */}
      {reviews.length > 0 && (
        <section className="container my-5">
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center gap-2 mb-2">
              <h3 className="fw-bold mb-0">Customer Reviews</h3>
            </div>
          </div>
          <div className="row g-4 justify-content-center">
            {reviews.slice(0, 3).map((review, idx) => (
              <div key={idx} className="col-12 col-md-4">
                <div className="card h-100" style={{border: '1px solid rgba(0,0,0,0.06)', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'}}>
                  {review.image_url && (
                    <div style={{position: 'relative', width: '100%', height: '180px', overflow: 'hidden', background: '#f5f5f5'}}>
                      <img 
                        src={review.image_url} 
                        alt="Review image"
                        style={{width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', transition: 'transform 0.2s ease'}}
                        onError={(e) => e.target.closest('div').style.display = 'none'}
                        onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                        onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                      />
                    </div>
                  )}
                  <div className="card-body p-3">
                    <div className="mb-2">
                      <div className="fw-semibold mb-1" style={{color: '#2d2d2d'}}>{review.name}</div>
                      <div style={{color: '#ffc107', fontSize: '0.9rem'}}>{'★'.repeat(review.stars)}{'☆'.repeat(5-review.stars)}</div>
                    </div>
                    <p className="mb-0 small" style={{color: '#666', lineHeight: '1.5'}}>{review.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4">
            <a className="btn btn-pink btn-lg px-5" href="/reviews">
              <i className="fa fa-comments me-2"></i>View All Reviews
            </a>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="text-center py-4">
        <p>Follow us on:</p>
        <p className="mb-0">
          <a href="https://www.facebook.com/chammyfloralss/" target="_blank" rel="noreferrer" className="text-decoration-none me-3">
            <i className="fab fa-facebook-f" style={{color: '#3b5998', fontSize: '24px'}}></i>
          </a>
          <a href="https://www.messenger.com/t/847673415097754" target="_blank" rel="noreferrer" className="text-decoration-none me-3">
            <i className="fa-brands fa-facebook-messenger" style={{color: '#79a4ff', fontSize: '24px'}}></i>
          </a>
          <a href="https://www.instagram.com/chammyflorals/" target="_blank" rel="noreferrer" className="text-decoration-none me-3">
            <i className="fa-brands fa-instagram" style={{color: '#ff6b57', fontSize: '24px'}}></i>
          </a>
        </p>
        <p className="mt-3 mb-0">© 2025 Chammy Florals. All rights reserved.</p>
      </footer>

      {/* Order Modal */}
      {showOrderModal && (
        <div className="modal fade show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}} onClick={() => setShowOrderModal(false)}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header border-0 position-relative" style={{background: 'linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%)', padding: '2rem'}}>
                <div className="w-100">
                  <div className="d-flex align-items-center gap-3 mb-2">
                    <div className="bg-white rounded-circle p-2 shadow-sm" style={{width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <i className="fa fa-shopping-bag text-pink" style={{fontSize: '1.5rem'}}></i>
                    </div>
                    <div>
                      <h5 className="modal-title text-white mb-0 fw-bold" style={{fontSize: '1.5rem'}}>Place Your Order</h5>
                      <p className="text-white mb-0 opacity-75 small">Fill in the details below to create your custom bouquet</p>
                    </div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white position-absolute top-0 end-0 m-3" onClick={() => setShowOrderModal(false)}></button>
              </div>

              <div className="modal-body p-3 p-md-4">
                <form onSubmit={handleOrderSubmit}>
                  <div className="mb-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <div className="bg-pink text-white rounded-circle d-flex align-items-center justify-content-center" style={{width: '30px', height: '30px', fontSize: '0.9rem', fontWeight: 'bold'}}>1</div>
                      <h6 className="mb-0 fw-bold">Personal Information</h6>
                    </div>
                    <div className="row g-3">
                      <div className="col-lg-4 col-md-6">
                        <label className="form-label fw-semibold">
                          <i className="fa fa-user text-pink me-2"></i>Full Name
                        </label>
                        <input type="text" className="form-control" placeholder="Enter your name" value={orderForm.user_name} onChange={(e) => setOrderForm({...orderForm, user_name: e.target.value})} required />
                      </div>
                      <div className="col-lg-4 col-md-6">
                        <label className="form-label fw-semibold">
                          <i className="fa fa-envelope text-pink me-2"></i>Email Address
                        </label>
                        <input type="email" className="form-control" placeholder="your@email.com" value={orderForm.user_email} onChange={(e) => setOrderForm({...orderForm, user_email: e.target.value})} required />
                      </div>
                      <div className="col-lg-4 col-12">
                        <label className="form-label fw-semibold">
                          <i className="fa-brands fa-facebook text-pink me-2"></i>Facebook Link
                        </label>
                        <input type="url" className="form-control" placeholder="https://facebook.com/yourprofile" value={orderForm.fb_link} onChange={(e) => setOrderForm({...orderForm, fb_link: e.target.value})} required />
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <div className="bg-pink text-white rounded-circle d-flex align-items-center justify-content-center" style={{width: '30px', height: '30px', fontSize: '0.9rem', fontWeight: 'bold'}}>2</div>
                      <h6 className="mb-0 fw-bold">Select Your Items</h6>
                    </div>
                    {orderForm.items.map((item, idx) => (
                      <div key={idx} className="mb-2">
                        <div className="d-flex align-items-center gap-2 p-2 bg-light rounded border">
                          <span className="badge bg-pink text-white" style={{width: '65px'}}>Item {idx + 1}</span>
                          <select className="form-select form-select-sm flex-grow-1" value={item.flower_type} onChange={(e) => updateItem(idx, 'flower_type', e.target.value)} required>
                            <option value="">Flower Type</option>
                            {products.map(p => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <input type="number" className="form-control form-control-sm" style={{width: '65px'}} min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} required />
                          {orderForm.items.length > 1 && (
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeItem(idx)}>
                              <i className="fa fa-times"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn btn-outline-pink w-100" onClick={addItem}>
                      <i className="fa fa-plus me-2"></i>Add Another Item
                    </button>
                  </div>

                  <div className="mb-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <div className="bg-pink text-white rounded-circle d-flex align-items-center justify-content-center" style={{width: '30px', height: '30px', fontSize: '0.9rem', fontWeight: 'bold'}}>3</div>
                      <h6 className="mb-0 fw-bold">Additional Details</h6>
                    </div>
                    <div className="row g-3">
                      <div className="col-lg-8">
                        <label className="form-label fw-semibold">
                          <i className="fa fa-comment text-pink me-2"></i>Special Message
                        </label>
                        <textarea className="form-control" rows="3" placeholder="Add special requests..." value={orderForm.message} onChange={(e) => setOrderForm({...orderForm, message: e.target.value})}></textarea>
                      </div>
                      <div className="col-lg-4">
                        <label className="form-label fw-semibold">
                          <i className="fa fa-bolt text-pink me-2"></i>Rush Order?
                        </label>
                        <select className="form-select" value={orderForm.rush} onChange={(e) => setOrderForm({...orderForm, rush: e.target.value})}>
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="d-grid">
                    <button type="submit" className="btn btn-pink btn-lg py-3">
                      <i className="fa fa-shopping-bag me-2"></i>Place Order Now
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Track Modal */}
      {showTrackModal && (
        <div className="modal fade show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}} onClick={() => setShowTrackModal(false)}>
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4 border-0 shadow">
              <div className="modal-header border-0" style={{background: 'linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%)'}}>
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-white rounded-circle p-2" style={{width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <i className="fa fa-map-marker-alt text-pink"></i>
                  </div>
                  <h5 className="modal-title text-white mb-0">Track Your Order</h5>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowTrackModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-light border-0 mb-4">
                  <div className="d-flex align-items-start gap-3">
                    <i className="fa fa-info-circle text-pink mt-1" style={{fontSize: '1.2rem'}}></i>
                    <div>
                      <div className="fw-semibold mb-1">How to track your order</div>
                      <div className="small text-muted">Enter your Order ID to see real-time status updates.</div>
                      <div className="small text-muted mt-1">
                        <strong>Example:</strong> <code className="bg-white px-2 py-1 rounded">A5DW7DW</code>
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleTrackSubmit}>
                  <div className="row g-3 align-items-end">
                    <div className="col-12 col-md-8">
                      <label className="form-label fw-semibold">Order ID</label>
                      <div className="input-group input-group-lg">
                        <span className="input-group-text bg-light border-end-0">
                          <i className="fa fa-search text-muted"></i>
                        </span>
                        <input type="text" className="form-control border-start-0 ps-0" placeholder="e.g., A5DW7DW" value={trackOrderId} onChange={(e) => setTrackOrderId(e.target.value)} required />
                      </div>
                    </div>
                    <div className="col-12 col-md-4 d-grid">
                      <button type="submit" className="btn btn-pink btn-lg">
                        <i className="fa fa-search me-2"></i>Track Now
                      </button>
                    </div>
                  </div>
                </form>

                {trackResult && (
                  <div className="mt-4">
                    {trackResult.error ? (
                      <div className="alert alert-danger">{trackResult.error}</div>
                    ) : (
                      <div className="card">
                        <div className="card-body">
                          <h6 className="fw-bold mb-3">Order Details</h6>
                          <p className="mb-2"><strong>Order ID:</strong> {trackResult.order_id}</p>
                          <p className="mb-2"><strong>Status:</strong> <span className="badge bg-pink">{trackResult.status || 'Pending'}</span></p>
                          <p className="mb-2"><strong>Customer:</strong> {trackResult.customer_name}</p>
                          <p className="mb-2"><strong>Item:</strong> {trackResult.flower_type}</p>
                          <p className="mb-0"><strong>Quantity:</strong> {trackResult.quantity}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {showProductModal && selectedProduct && (
        <div className="modal fade show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}} onClick={() => setShowProductModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4">
              <div className="modal-header">
                <h5 className="modal-title">{selectedProduct.name}</h5>
                <button type="button" className="btn-close" onClick={() => setShowProductModal(false)}></button>
              </div>
              <div className="modal-body">
                <img 
                  src={selectedProduct.image_url || '/flowers/bouquetwithglitter.jfif'} 
                  alt={selectedProduct.name} 
                  className="w-100 rounded mb-3" 
                  onError={(e) => { e.target.src = '/flowers/bouquetwithglitter.jfif'; }} 
                />
                <p><strong>Category:</strong> {selectedProduct.category}</p>
                {selectedProduct.description && <p>{selectedProduct.description}</p>}
                {selectedProduct.pricing && selectedProduct.pricing.length > 0 && (
                  <div>
                    <h6 className="fw-bold">Pricing Options:</h6>
                    <ul className="list-unstyled">
                      {selectedProduct.pricing.map((p, i) => (
                        <li key={i} className="mb-1">
                          {p.label || p.set}: <span className="text-pink fw-bold">₱{p.price}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-pink" onClick={() => { setShowProductModal(false); setShowOrderModal(true); }}>
                  <i className="fa fa-shopping-bag me-2"></i>Order Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
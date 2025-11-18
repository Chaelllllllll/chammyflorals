import { useState, useEffect } from 'react';
import { getReviews, createReview, getDeliveredOrders } from '../services/api';

const Reviews = () => {
  const [reviews, setReviews] = useState([]);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    order_id: '',
    customer_name: '',
    rating: 5,
    review_text: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reviewsData, ordersData] = await Promise.all([
        getReviews(),
        getDeliveredOrders().catch(() => [])
      ]);
      setReviews(reviewsData);
      setDeliveredOrders(ordersData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createReview(reviewForm);
      alert('Thank you for your review!');
      setShowReviewModal(false);
      setReviewForm({ order_id: '', customer_name: '', rating: 5, review_text: '' });
      fetchData();
    } catch (error) {
      alert('Failed to submit review: ' + (error.response?.data?.message || error.message));
    }
  };

  const avgRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + (r.stars || 5), 0) / reviews.length).toFixed(1)
    : '5.0';

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
                <a className="btn btn-sm btn-outline-secondary" href="/">
                  <i className="fa fa-home me-1"></i>Home
                </a>
              </li>
              <li className="nav-item my-2 my-lg-0">
                <button className="btn btn-pink" onClick={() => setShowReviewModal(true)}>
                  <i className="fa fa-pen me-1"></i>Write a Review
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
              <div className="position-absolute top-0 start-0 opacity-25" style={{fontSize: '120px', color: '#ff99bb', transform: 'rotate(-15deg)', margin: '-30px 0 0 -30px'}}>⭐</div>
              <div className="position-absolute bottom-0 end-0 opacity-25" style={{fontSize: '120px', color: '#ff99bb', transform: 'rotate(15deg)', margin: '0 -30px -30px 0'}}>💬</div>

              <div className="position-relative" style={{zIndex: 1}}>
                <h1 className="fw-bold display-5 text-pink mb-3">Customer Reviews</h1>
                <p className="lead text-muted mb-4 mx-auto" style={{maxWidth: '600px'}}>
                  See what our happy customers have to say about their experience with Chammy Florals
                </p>
                <button className="btn btn-pink btn-lg px-4" onClick={() => setShowReviewModal(true)}>
                  <i className="fa fa-pen me-2"></i>Write a Review
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container my-5">
        <div className="card shadow-sm border-0" style={{background: 'white', borderRadius: '16px', padding: '2rem'}}>
          <div className="row text-center">
            <div className="col-md-6 mb-3 mb-md-0">
              <div style={{padding: '1.5rem', background: 'linear-gradient(135deg, #fff0f6 0%, #ffe9f0 100%)', borderRadius: '12px'}}>
                <div style={{fontSize: '4rem', fontWeight: '700', color: '#ff6f9b', lineHeight: 1, marginBottom: '0.5rem'}}>
                  {avgRating}
                </div>
                <div className="text-warning mb-2" style={{fontSize: '1.5rem'}}>
                  {'⭐'.repeat(Math.round(parseFloat(avgRating)))}
                </div>
                <div style={{color: '#666', fontSize: '0.9rem', fontWeight: '500'}}>Average Rating</div>
              </div>
            </div>
            <div className="col-md-6">
              <div style={{padding: '1.5rem'}}>
                <div style={{fontSize: '1.5rem', fontWeight: '700', color: '#2d2d2d', marginBottom: '0.25rem'}}>
                  {reviews.length}
                </div>
                <div style={{color: '#666', fontSize: '0.9rem'}}>Verified Reviews</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews List */}
      <section className="container my-5">
        <div className="row">
          {reviews.length === 0 ? (
            <div className="col-12 text-center py-5">
              <i className="fa fa-star text-muted" style={{fontSize: '3rem', opacity: 0.3}}></i>
              <p className="text-muted mt-3">No reviews yet. Be the first to leave a review!</p>
            </div>
          ) : (
            reviews.map((review, idx) => (
              <div key={idx} className="col-12 mb-3">
                <div className="card review-card" style={{border: '1px solid rgba(0,0,0,0.06)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'}}>
                  <div className="card-body d-flex p-3" style={{gap: '12px', flexWrap: 'wrap'}}>
                    {review.image_url && (
                      <div className="review-thumb-wrap" style={{flex: '0 0 auto', marginRight: '12px'}}>
                        <img 
                          src={review.image_url} 
                          className="review-thumb"
                          alt="Review image"
                          style={{
                            width: '80px',
                            height: '80px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                          onError={(e) => e.target.closest('.review-thumb-wrap').style.display = 'none'}
                        />
                      </div>
                    )}
                    <div className="flex-grow-1" style={{minWidth: 0}}>
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <strong style={{color: '#2d2d2d'}}>{review.name || 'Customer'}</strong>
                        <div className="text-warning">{'★'.repeat(review.stars || 5)}{'☆'.repeat(5-(review.stars || 5))}</div>
                      </div>
                      <div className="small text-muted mb-1">
                        {review.order_id && `Order: ${review.order_id} • `}
                        {review.created_at && new Date(review.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div style={{color: '#666', lineHeight: '1.5'}}>{review.message}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

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

      {/* Review Modal */}
      {showReviewModal && (
        <div className="modal fade show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}} onClick={() => setShowReviewModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4">
              <div className="modal-header border-0" style={{background: 'linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%)'}}>
                <h5 className="modal-title text-white fw-bold">Write a Review</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowReviewModal(false)}></button>
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Order ID (Optional)</label>
                    {deliveredOrders.length > 0 ? (
                      <select 
                        className="form-select" 
                        value={reviewForm.order_id}
                        onChange={(e) => setReviewForm({...reviewForm, order_id: e.target.value})}
                      >
                        <option value="">Select an order</option>
                        {deliveredOrders.map((order) => (
                          <option key={order.id} value={order.order_id}>
                            {order.order_id} - {order.flower_type}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Enter your order ID"
                        value={reviewForm.order_id}
                        onChange={(e) => setReviewForm({...reviewForm, order_id: e.target.value})}
                      />
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Your Name *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Enter your name"
                      value={reviewForm.customer_name}
                      onChange={(e) => setReviewForm({...reviewForm, customer_name: e.target.value})}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Rating *</label>
                    <div className="d-flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className="btn btn-link p-0"
                          style={{fontSize: '2rem', textDecoration: 'none', color: star <= reviewForm.rating ? '#ffc107' : '#ddd'}}
                          onClick={() => setReviewForm({...reviewForm, rating: star})}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                    <small className="text-muted">Selected: {reviewForm.rating} star{reviewForm.rating > 1 ? 's' : ''}</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">Your Review *</label>
                    <textarea 
                      className="form-control" 
                      rows="4"
                      placeholder="Share your experience with us..."
                      value={reviewForm.review_text}
                      onChange={(e) => setReviewForm({...reviewForm, review_text: e.target.value})}
                      required
                    ></textarea>
                  </div>

                  <div className="d-grid gap-2">
                    <button type="submit" className="btn btn-pink btn-lg">
                      <i className="fa fa-paper-plane me-2"></i>Submit Review
                    </button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setShowReviewModal(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reviews;
(function() {
    emailjs.init("qqJjLgR4UzMvwH-Ll");
  })();

  document.getElementById('inquiryForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var recaptchaResponse = document.querySelector('#g-recaptcha-response').value;
    if (!recaptchaResponse) {
      alert("Please verify that you are not a robot before submitting.");
      return;
    }

    emailjs.sendForm('service_yg6h87n', 'template_x15flic', this)
      .then((response) => {
        if (response.status === 200) {
          const formData = new FormData(this);
          const name = formData.get('user_name');
          const email = formData.get('user_email');
          const fbLink = formData.get('fb_link') || 'Not provided';
          const flowerType = formData.get('flower_type');
          const quantity = parseInt(formData.get('quantity')) || 1;
          const addons = Array.from(formData.getAll('addons[]')) || [];
          const message = formData.get('message') || 'Not provided';
          const rush = formData.get('rush');

          const flowerPrices = {
            'FWG1': 80, 'FWG2': 225, 'FWG3': 310, 'FWG4': 400,
            'FWG5': 480, 'FWG6': 850, 'FWG7': 1500,
            'FWTG1': 75, 'FWTG2': 220, 'FWTG3': 300, 'FWTG4': 380,
            'FWTG5': 460, 'FWTG6': 800, 'FWTG7': 1400
          };

          const addonPrices = {
            'Fairy Lights - ₱20': 20,
            'Pearl - ₱5–15': 10,
            'Butterfly - ₱10': 10,
            'Letter - ₱15': 15,
            'Picture - ₱20': 20,
            'Artificial Leaves - ₱20/stem': 20
          };

          let totalFee = 0;
          if (flowerType && flowerPrices[flowerType]) {
            totalFee += flowerPrices[flowerType] * quantity;
          }
          addons.forEach(addon => {
            if (addonPrices[addon]) {
              totalFee += addonPrices[addon];
            }
          });

          const webhookUrl = 'https://discord.com/api/webhooks/1436036542412886170/e95zoWRkd7Di185COw5zxiKclNccg99B84azqTKhBfWQLagezc-X0wH__9DL60OgSa5X';

          const embed = {
            embeds: [{
              title: 'New Inquiry Received! 💐',
              color: 0xff69b4,
              fields: [
                { name: 'Name', value: name, inline: true },
                { name: 'Email', value: email, inline: true },
                { name: 'Facebook Link', value: fbLink, inline: true },
                { name: 'Flower Type', value: flowerType, inline: true },
                { name: 'Quantity', value: quantity.toString(), inline: true },
                { name: 'Add-ons', value: addons.length ? addons.join(', ') : 'None', inline: false },
                { name: 'Additional Message', value: message, inline: false },
                { name: 'Rush Order', value: rush, inline: true },
                { name: 'Total Fee (₱)', value: totalFee.toString(), inline: true }
              ]
            }]
          };

          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(embed)
          })
          .then(response => {
            if (!response.ok) throw new Error('Failed to send to Discord');
            console.log('Discord notification sent successfully');
          })
          .catch(error => console.error('Discord Webhook Error:', error));

          alert("Your inquiry has been sent successfully! 💐");
          e.target.reset();
          grecaptcha.reset();
          var modal = bootstrap.Modal.getInstance(document.getElementById('inquiryModal'));
          modal.hide();
        }
      }, (error) => {
        alert("Oops! Something went wrong. Please try again.");
        console.error("EmailJS Error:", error);
      });
  });

  document.addEventListener('DOMContentLoaded', () => {
  const reviewsList = document.getElementById('reviewsList');
  const reviewFormContainer = document.getElementById('reviewFormContainer');
  const reviewForm = document.getElementById('reviewForm');
  const addReviewBtn = document.getElementById('addReviewBtn');
  const apiUrl = 'https://chammyflorals.vercel.app/api/reviews';

  // Load reviews into modal
  function loadReviews() {
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(reviews => {
        reviewsList.innerHTML = ''; // Clear existing reviews
        reviews.forEach(review => {
          const colDiv = document.createElement('div');
          colDiv.className = 'col-md-4 col-sm-6';

          const cardDiv = document.createElement('div');
          cardDiv.className = 'card shadow-sm h-100';

          const cardBody = document.createElement('div');
          cardBody.className = 'card-body text-center';

          const name = document.createElement('h5');
          name.className = 'card-title';
          name.textContent = review.name;

          const date = document.createElement('p');
          date.className = 'text-muted mb-2';
          date.textContent = new Date(review.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          const starsDiv = document.createElement('div');
          starsDiv.className = 'mb-3';
          const fullStars = Math.floor(review.rating);
          const hasHalfStar = review.rating % 1 !== 0;
          for (let i = 0; i < 5; i++) {
            const star = document.createElement('i');
            if (i < fullStars) {
              star.className = 'fas fa-star text-warning';
            } else if (i === fullStars && hasHalfStar) {
              star.className = 'fas fa-star-half-alt text-warning';
            } else {
              star.className = 'far fa-star text-warning';
            }
            starsDiv.appendChild(star);
          }

          const comment = document.createElement('p');
          comment.className = 'card-text';
          comment.textContent = review.comment;

          cardBody.appendChild(name);
          cardBody.appendChild(date);
          cardBody.appendChild(starsDiv);
          cardBody.appendChild(comment);
          cardDiv.appendChild(cardBody);
          colDiv.appendChild(cardDiv);
          reviewsList.appendChild(colDiv);
        });
      })
      .catch(error => {
        console.error('Error fetching reviews:', error);
        reviewsList.innerHTML = '<div class="col-12 text-center">Failed to load reviews. Please try again later.</div>';
      });
  }

  // Toggle review form visibility
  addReviewBtn.addEventListener('click', () => {
    reviewFormContainer.style.display = 'block';
    reviewsList.style.display = 'none';
    addReviewBtn.style.display = 'none';
  });

  // Handle form submission
  reviewForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const form = e.target;
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const newReview = {
      name: document.getElementById('reviewName').value,
      rating: parseFloat(document.getElementById('reviewRating').value),
      comment: document.getElementById('reviewComment').value
    };

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReview)
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to submit review');
        return response.json();
      })
      .then(() => {
        form.reset();
        form.classList.remove('was-validated');
        reviewFormContainer.style.display = 'none';
        reviewsList.style.display = 'block';
        addReviewBtn.style.display = 'block';
        loadReviews(); // Refresh reviews
        alert('Thank you for your review!');
      })
      .catch(error => {
        console.error('Error submitting review:', error);
        alert('Failed to submit review. Please try again.');
      });
  });

  // Initial load when modal opens
  const reviewsModal = document.getElementById('reviewsModal');
  reviewsModal.addEventListener('show.bs.modal', loadReviews);
});
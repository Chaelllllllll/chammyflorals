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
const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('deliveryAddressInput') || line.includes('customDeliveryAddressInput')) {
    console.log(`L${index + 1}: ${line.trim()}`);
  }
});

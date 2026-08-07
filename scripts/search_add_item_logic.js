const fs = require('fs');
const content = fs.readFileSync('public/function.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('addItemBtn') || line.includes('order-item') || line.includes('itemsContainer')) {
    if (line.includes('html') || line.includes('append') || line.includes('createElement') || line.includes('innerHTML') || line.includes('cloneNode')) {
      console.log(`L${index + 1}: ${line.trim()}`);
    }
  }
});

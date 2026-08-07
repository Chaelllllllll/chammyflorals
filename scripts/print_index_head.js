const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const lines = content.split('\n');
for (let i = 1; i <= 60; i++) {
  console.log(`L${i}: ${lines[i - 1]}`);
}

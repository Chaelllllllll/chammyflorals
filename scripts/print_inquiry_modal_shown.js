const fs = require('fs');
const content = fs.readFileSync('public/function.js', 'utf8');

const lines = content.split('\n');
for (let i = 650; i <= 695; i++) {
  console.log(`L${i}: ${lines[i - 1]}`);
}

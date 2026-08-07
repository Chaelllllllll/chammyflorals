const fs = require('fs');
const content = fs.readFileSync('public/function.js', 'utf8');

const lines = content.split('\n');
let inside = false;
let start = 0;
lines.forEach((line, index) => {
  if (line.includes('function createItemRow')) {
    inside = true;
    start = index;
  }
  if (inside && index - start < 100) {
    console.log(`L${index + 1}: ${line}`);
  } else {
    inside = false;
  }
});

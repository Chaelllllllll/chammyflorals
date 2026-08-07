const fs = require('fs');
const content = fs.readFileSync('public/function.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('modalMap') || line.includes('mapPickerModal') || line.includes('shown.bs.modal')) {
    console.log(`L${index + 1}: ${line.trim()}`);
  }
});

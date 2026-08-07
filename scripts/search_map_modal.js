const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const lines = content.split('\n');
let inside = false;
let start = 0;
lines.forEach((line, index) => {
  if (line.includes('id="mapPickerModal"') || line.includes('map-picker-container')) {
    inside = true;
    start = index;
  }
  if (inside && index - start < 60) {
    console.log(`L${index + 1}: ${line}`);
  } else {
    inside = false;
  }
});

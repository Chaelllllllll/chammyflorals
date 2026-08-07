const fs = require('fs');
const content = fs.readFileSync('public/admin/to-deliver.html', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('leaflet') || line.includes('Leaflet')) {
    console.log(`L${index + 1}: ${line.trim()}`);
  }
});

const fs = require('fs');

['api/index.js', 'src/app.js'].forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('helmet') || line.includes('contentSecurityPolicy') || line.includes('CSP') || line.includes('Content-Security-Policy')) {
        console.log(`${file} L${index + 1}: ${line.trim()}`);
      }
    });
  }
});

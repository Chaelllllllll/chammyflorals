const fs = require('fs');

const js = fs.readFileSync('public/js/admin-dashboard.js', 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync('public/admin/dashboard.html', 'utf8').replace(/\r\n/g, '\n');

const checks = [
  ['buildReceiptHtml defined', js.includes('async function buildReceiptHtml(order) {')],
  ['openReceiptPreview defined', js.includes('async function openReceiptPreview(order) {')],
  ['fallback to direct download', js.includes('return generateReceiptImage(order);')],
  ['actions column wired', js.includes('if (order) openReceiptPreview(order);')],
  ['details modal wired', js.includes("generateReceiptBtn.addEventListener('click', () => {\n      openReceiptPreview(order);\n    });")],
  ['download btn wired', js.includes('downloadBtn.onclick = () => generateReceiptImage(order);')],
  ['scoped capture element', js.includes("container.querySelector('#receiptImageCapture')")],
  ['details label updated', js.includes('Preview Receipt')],
  ['modal markup in html', html.includes('id="receiptPreviewModal"')],
  ['content container in html', html.includes('id="receiptPreviewContent"')],
  ['download button in html', html.includes('id="downloadReceiptBtn"')],
  ['white preview body', html.includes('#receiptPreviewContent {\n      overflow-x: auto;\n      background: #ffffff;')],
  ['receipt fills width CSS', html.includes('#receiptPreviewContent #receiptImageCapture {\n      width: 100%;\n      max-width: 450px;')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail = 1;
}
process.exit(fail);

const app = require('./api/index');
const { startOrderBot } = require('./src/lib/orderBot');
const PORT = 3000;
app.listen(PORT, () => console.log(`Local server running on port ${PORT}`));
startOrderBot();

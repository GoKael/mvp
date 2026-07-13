const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 4174);
const root = path.resolve(__dirname, '..');

app.disable('x-powered-by');
app.get('/api/health', (_request, response) => {
  response.json({ ok: true, app: 'lexa', version: 2 });
});
app.use(express.static(root, { extensions: ['html'] }));

app.listen(port, '127.0.0.1', () => {
  console.log(`Lexa is ready at http://127.0.0.1:${port}/index.html#/today`);
});

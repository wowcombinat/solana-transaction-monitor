const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Solana Transaction Monitor is running');
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

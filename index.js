const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

app.get('/', (req, res) => {
  res.send(`Solana Transaction Monitor is running. Monitoring wallet: ${WALLET_ADDRESS}`);
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`Мониторинг кошелька: ${WALLET_ADDRESS}`);
});

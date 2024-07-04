const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

// Пока закомментируем подключение к базе данных
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function monitorWallet() {
  const publicKey = new PublicKey(WALLET_ADDRESS);
  console.log(`Мониторинг транзакций для кошелька: ${WALLET_ADDRESS}`);
  
  // Пока просто логируем, не сохраняем в базу
  connection.onLogs(
    publicKey,
    (logs, context) => {
      console.log('Новая транзакция:', context.signature);
    },
    'confirmed'
  );
}

app.get('/', (req, res) => {
  res.send('Solana Transaction Monitor is running');
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  monitorWallet().catch(console.error);
});

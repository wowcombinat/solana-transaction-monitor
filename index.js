const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function monitorWallet() {
  const publicKey = new PublicKey(WALLET_ADDRESS);

  console.log(`Мониторинг транзакций для кошелька: ${WALLET_ADDRESS}`);

  connection.onLogs(
    publicKey,
    async (logs, context) => {
      console.log('Новая транзакция:', context.signature);
      
      try {
        const client = await pool.connect();
        await client.query('INSERT INTO transactions(signature, logs) VALUES($1, $2)', [context.signature, JSON.stringify(logs)]);
        client.release();
      } catch (err) {
        console.error('Ошибка при сохранении в базу данных:', err);
      }
    },
    'confirmed'
  );
}

app.get('/', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10');
    const transactions = result.rows;
    client.release();

    let html = '<h1>Последние транзакции</h1>';
    html += '<ul>';
    transactions.forEach(tx => {
      html += `<li>Signature: ${tx.signature}, Time: ${tx.created_at}</li>`;
    });
    html += '</ul>';

    res.send(html);
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  monitorWallet().catch(console.error);
});

const express = require('express');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('Attempting to create transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT,
        logs JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Transactions table created or already exists');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

app.use(express.static('public'));
app.use(express.json());

async function monitorWallet() {
  const publicKey = new PublicKey(WALLET_ADDRESS);
  console.log(`Мониторинг транзакций для кошелька: ${WALLET_ADDRESS}`);
  
  connection.onLogs(
    publicKey,
    async (logs, context) => {
      console.log('Новая транзакция:', context.signature);
      try {
        const client = await pool.connect();
        await client.query('INSERT INTO transactions(signature, logs) VALUES($1, $2)', [context.signature || 'unknown', JSON.stringify(logs)]);
        client.release();
      } catch (err) {
        console.error('Ошибка при сохранении в базу данных:', err);
      }
    },
    'confirmed'
  );
}

app.get('/api/transactions', async (req, res) => {
  try {
    const client = await pool.connect();
    console.log('Attempting to fetch transactions...');
    const result = await client.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10');
    const transactions = result.rows;
    client.release();
    console.log(`Fetched ${transactions.length} transactions`);
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: "Error fetching transactions", details: err.message });
  }
});

app.get('/api/balance', async (req, res) => {
  try {
    const publicKey = new PublicKey(WALLET_ADDRESS);
    const balance = await connection.getBalance(publicKey);
    res.json({ balance: balance / LAMPORTS_PER_SOL });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching balance" });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, async () => {
  console.log(`Сервер запущен на порту ${port}`);
  await initDatabase();
  monitorWallet().catch(console.error);
});

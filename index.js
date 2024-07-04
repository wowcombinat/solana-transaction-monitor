const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const WebSocket = require('ws');
require('dotenv').config();

console.log('Starting application...');

const app = express();
const port = process.env.PORT || 3000;

console.log('Configuring environment variables...');
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_ADDRESS = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';

console.log('Initializing Solana connection...');
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

console.log('Initializing database pool...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDatabase() {
  console.log('Initializing database...');
  const client = await pool.connect();
  try {
    console.log('Attempting to create or update transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC)`);
    console.log('Transactions table and index created or updated successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

app.use(express.static('public'));
app.use(express.json());

async function processTransaction(signature) {
  console.log('Processing transaction:', signature);
  const client = await pool.connect();
  try {
    const existingTx = await client.query('SELECT * FROM transactions WHERE signature = $1', [signature]);
    
    if (existingTx.rows.length === 0) {
      const txInfo = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
      
      if (txInfo) {
        await client.query('INSERT INTO transactions(signature, data) VALUES($1, $2)', 
          [signature, JSON.stringify(txInfo)]);
        console.log(`Saved transaction: ${signature}`);
      } else {
        console.log(`No transaction info found for signature: ${signature}`);
      }
    } else {
      console.log('Transaction already exists:', signature);
    }
  } catch (err) {
    console.error('Error processing transaction:', err);
  } finally {
    client.release();
  }
}

function setupWebSocket() {
  console.log('Setting up WebSocket...');
  const ws = new WebSocket(SOLANA_RPC_URL.replace('https', 'wss'));

  ws.on('open', () => {
    console.log('WebSocket connection opened');
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [ WALLET_ADDRESS ]
        },
        {
          commitment: 'confirmed'
        }
      ]
    };
    ws.send(JSON.stringify(subscribeMessage));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.method === 'logsNotification') {
      const signature = message.params.result.value.signature;
      processTransaction(signature);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed. Reconnecting...');
    setTimeout(setupWebSocket, 5000);
  });
}

app.get('/api/transactions', async (req, res) => {
  console.time('fetchTransactions');
  const client = await pool.connect();
  try {
    console.log('Attempting to fetch transactions...');
    const result = await client.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10');
    const transactions = result.rows.map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
    console.log(`Fetched ${transactions.length} transactions`);
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: "Error fetching transactions", details: err.message });
  } finally {
    client.release();
    console.timeEnd('fetchTransactions');
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, async () => {
  console.log(`Server starting on port ${port}`);
  try {
    await initDatabase();
    console.log('Database initialized, starting WebSocket connection...');
    setupWebSocket();
    console.log(`Server is running on port ${port}`);
  } catch (error) {
    console.error('Error during server startup:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

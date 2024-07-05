const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_ADDRESS = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 10000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Error occurred: ${error.message}`);
      if (error.message.includes('429 Too Many Requests') || error.message.includes('503 Service Unavailable')) {
        const waitTime = initialDelay * Math.pow(2, retries);
        console.log(`Retrying after ${waitTime}ms delay...`);
        await delay(waitTime);
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached');
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        tx_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS token_history (
        id SERIAL PRIMARY KEY,
        mint TEXT,
        holders NUMERIC,
        sales INT,
        purchases INT,
        price NUMERIC,
        relationships JSON,
        symbol TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mint_transactions (
        id SERIAL PRIMARY KEY,
        mint TEXT,
        signature TEXT UNIQUE,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tables created or already exist');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

app.use(express.static('public'));
app.use(express.json());

const transactionQueue = [];
let isProcessing = false;

async function processTransaction(signature) {
  const client = await pool.connect();
  try {
    const existingTx = await client.query('SELECT * FROM transactions WHERE signature = $1', [signature]);
    if (existingTx.rows.length === 0) {
      const txInfo = await retryWithBackoff(() => connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 }));
      if (txInfo) {
        await client.query('INSERT INTO transactions(signature, tx_data) VALUES($1, $2)', [signature, JSON.stringify(txInfo)]);
      }
    }
  } catch (err) {
    console.error('Error processing transaction:', err);
  } finally {
    client.release();
  }
}

async function processQueue() {
  if (isProcessing || transactionQueue.length === 0) return;
  isProcessing = true;
  while (transactionQueue.length > 0) {
    const signature = transactionQueue.shift();
    await processTransaction(signature);
    await delay(5000);
  }
  isProcessing = false;
}

function setupWebSocket() {
  const ws = new WebSocket(SOLANA_RPC_URL.replace('https', 'wss'));
  ws.on('open', () => {
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [{ mentions: [WALLET_ADDRESS] }, { commitment: 'confirmed' }]
    };
    ws.send(JSON.stringify(subscribeMessage));
  });
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.method === 'logsNotification') {
      const signature = message.params.result.value.signature;
      transactionQueue.push(signature);
      processQueue();
    }
  });
  ws.on('error', (error) => console.error('WebSocket error:', error));
  ws.on('close', () => setTimeout(setupWebSocket, 5000));
}

app.get('/api/transactions', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: "Error fetching transactions", details: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/tokens', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT mint, holders, sales, purchases, price, relationships, symbol, timestamp
      FROM token_history
      WHERE timestamp IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const totalResult = await client.query('SELECT COUNT(*) FROM token_history WHERE timestamp IS NOT NULL');
    const total = parseInt(totalResult.rows[0].count, 10);

    const tokens = result.rows;
    const response = {
      tokens,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page, 10)
    };

    res.json(response);
  } catch (err) {
    console.error('Error fetching token history:', err);
    res.status(500).json({ error: "Error fetching token history", details: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/token-transactions/:mint', async (req, res) => {
  const { mint } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT signature, details
      FROM mint_transactions
      WHERE mint = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [mint, limit, offset]);

    const totalResult = await client.query('SELECT COUNT(*) FROM mint_transactions WHERE mint = $1', [mint]);
    const total = parseInt(totalResult.rows[0].count, 10);

    const transactions = result.rows;
    res.json({ transactions, total, totalPages: Math.ceil(total / limit), currentPage: parseInt(page, 10) });
  } catch (err) {
    console.error('Error fetching transactions for mint:', err);
    res.status(500).json({ error: "Error fetching transactions for mint", details: err.message });
  } finally {
    client.release();
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/history', (req, res) => {
  res.sendFile(__dirname + '/public/history.html');
});

app.get('/token', (req, res) => {
  res.sendFile(__dirname + '/public/token.html');
});

const server = app.listen(port, async () => {
  try {
    await initDatabase();
    setupWebSocket();
    console.log(`Server running on port ${port}`);
  } catch (error) {
    console.error('Error during server startup:', error);
    process.exit(1);
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  ws.on('message', (message) => {
    console.log('Received message:', message);
  });
});

function broadcastUpdate() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update' }));
    }
  });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;

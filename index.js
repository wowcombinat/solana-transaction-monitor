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
  console.log('Initializing database...');
  const client = await pool.connect();
  try {
    console.log('Attempting to create or update transactions and token_history tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        tx_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS token_history (
        id SERIAL PRIMARY KEY,
        mint TEXT UNIQUE,
        holders NUMERIC,
        sales INTEGER,
        purchases INTEGER,
        price NUMERIC,
        relationships JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        symbol TEXT,
        timestamp TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mint_transactions (
        id SERIAL PRIMARY KEY,
        mint TEXT,
        signature TEXT UNIQUE,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_token_history_created_at ON token_history (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mint_transactions_created_at ON mint_transactions (created_at DESC)`);

    console.log('Tables and indexes created or updated successfully');
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
  console.log('Processing transaction:', signature);
  const client = await pool.connect();
  try {
    const existingTx = await client.query('SELECT * FROM transactions WHERE signature = $1', [signature]);

    if (existingTx.rows.length === 0) {
      const txInfo = await retryWithBackoff(() => connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 }));

      if (txInfo) {
        await client.query('INSERT INTO transactions(signature, tx_data) VALUES($1, $2)', 
          [signature, JSON.stringify(txInfo)]);
        console.log(`Saved transaction: ${signature}`);

        const mintInstructions = txInfo.transaction.message.instructions.filter(
          inst => inst.programId.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        );

        for (const inst of mintInstructions) {
          if (inst.parsed?.type === 'mintTo' && inst.parsed.info.mint) {
            const mint = inst.parsed.info.mint;
            const symbol = inst.parsed.info.symbol; // example of how to capture the symbol, update accordingly
            const timestamp = txInfo.blockTime ? new Date(txInfo.blockTime * 1000).toISOString() : new Date().toISOString();
            await client.query(
              'INSERT INTO mint_transactions(mint, signature, details) VALUES($1, $2, $3) ON CONFLICT (signature) DO NOTHING', 
              [mint, signature, JSON.stringify(inst)]
            );
            await client.query(
              'INSERT INTO token_history(mint, symbol, timestamp) VALUES($1, $2, $3) ON CONFLICT (mint) DO NOTHING', 
              [mint, symbol, timestamp]
            );
            console.log(`Saved mint transaction: ${signature}`);
          }
        }
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

async function processQueue() {
  if (isProcessing || transactionQueue.length === 0) return;

  isProcessing = true;
  while (transactionQueue.length > 0) {
    const signature = transactionQueue.shift();
    await processTransaction(signature);
    await delay(5000); // Wait 5 seconds between processing transactions
  }
  isProcessing = false;
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
      transactionQueue.push(signature);
      processQueue();
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
      tx_data: row.tx_data
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

app.get('/api/tokens', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const client = await pool.connect();
  try {
    console.log(`Fetching token history for page ${page} with limit ${limit}`);
    const result = await client.query(`
      SELECT mint, holders, sales, purchases, price, relationships, symbol, timestamp
      FROM token_history
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const totalResult = await client.query('SELECT COUNT(*) FROM token_history');
    const total = parseInt(totalResult.rows[0].count, 10);

    const tokens = result.rows;
    console.log(`Fetched ${tokens.length} tokens`);
    res.json({ tokens, total, totalPages: Math.ceil(total / limit), currentPage: parseInt(page, 10) });
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
    console.log(`Fetching transactions for mint ${mint} on page ${page} with limit ${limit}`);
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
    console.log(`Fetched ${transactions.length} transactions for mint ${mint}`);
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

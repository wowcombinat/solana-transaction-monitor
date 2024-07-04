const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // увеличиваем максимальное количество соединений
  idleTimeoutMillis: 30000, // уменьшаем время ожидания неактивного соединения
  connectionTimeoutMillis: 2000, // уменьшаем время ожидания соединения
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('Attempting to create or update transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        instruction TEXT,
        mint_address TEXT,
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
      const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
      
      let instruction = 'Unknown';
      let mintAddress = 'Not found';
      
      if (txInfo && txInfo.transaction && txInfo.transaction.message && 
          txInfo.transaction.message.instructions && 
          txInfo.transaction.message.instructions.length > 0) {
        const ix = txInfo.transaction.message.instructions[0];
        if (ix && ix.programId && ix.programId.toBase58) {
          if (ix.programId.toBase58() === 'PUMP1SoLNVs2WaPz7TnLbkoYoRiKbxWQspYdRPdJszDr') {
            instruction = 'Pump.Fun: Create';
            // Поиск mint адреса в инструкциях
            for (let i = 1; i < txInfo.transaction.message.instructions.length; i++) {
              const subIx = txInfo.transaction.message.instructions[i];
              if (subIx && subIx.programId && subIx.programId.toBase58 && 
                  subIx.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
                  subIx.accounts && subIx.accounts.length > 0) {
                mintAddress = subIx.accounts[0].toBase58();
                break;
              }
            }
          } else {
            instruction = `Program: ${ix.programId.toBase58()}`;
          }
        }
      }
      
      await client.query('INSERT INTO transactions(signature, instruction, mint_address) VALUES($1, $2, $3)', 
        [signature, instruction, mintAddress]);
      console.log(`Saved transaction: ${signature}, Instruction: ${instruction}, Mint: ${mintAddress}`);
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
    const transactions = result.rows;
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
  console.log(`Сервер запущен на порту ${port}`);
  await initDatabase();
  console.log('Database initialized, starting WebSocket connection...');
  setupWebSocket();
});

// Добавляем обработчик необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 5000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('429 Too Many Requests')) {
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
    console.log('Attempting to create transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        instruction TEXT,
        mint_address TEXT,
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

async function getNewTransactions() {
  const publicKey = new PublicKey(WALLET_ADDRESS);
  console.log(`Checking for new transactions for wallet: ${WALLET_ADDRESS}`);
  
  try {
    const signatures = await retryWithBackoff(() => 
      connection.getSignaturesForAddress(publicKey, { limit: 5 })
    );
    
    for (const signatureInfo of signatures) {
      try {
        const client = await pool.connect();
        const existingTx = await client.query('SELECT * FROM transactions WHERE signature = $1', [signatureInfo.signature]);
        
        if (existingTx.rows.length === 0) {
          console.log('New transaction found:', signatureInfo.signature);
          const txInfo = await retryWithBackoff(() => 
            connection.getTransaction(signatureInfo.signature, { maxSupportedTransactionVersion: 0 })
          );
          
          let instruction = 'Unknown';
          let mintAddress = 'Not found';
          
          if (txInfo && txInfo.transaction && txInfo.transaction.message && txInfo.transaction.message.instructions.length > 0) {
            const ix = txInfo.transaction.message.instructions[0];
            if (ix.programId.toBase58() === 'PUMP1SoLNVs2WaPz7TnLbkoYoRiKbxWQspYdRPdJszDr') {
              instruction = 'Pump.Fun: Create';
              // Поиск mint адреса в инструкциях
              for (let i = 1; i < txInfo.transaction.message.instructions.length; i++) {
                const subIx = txInfo.transaction.message.instructions[i];
                if (subIx.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                  mintAddress = subIx.accounts[0].toBase58();
                  break;
                }
              }
            }
          }
          
          await client.query('INSERT INTO transactions(signature, instruction, mint_address) VALUES($1, $2, $3)', 
            [signatureInfo.signature, instruction, mintAddress]);
          console.log(`Saved transaction: ${signatureInfo.signature}, Instruction: ${instruction}, Mint: ${mintAddress}`);
        }
        
        client.release();
      } catch (err) {
        console.error('Error processing transaction:', err);
      }
      
      // Увеличиваем задержку между обработкой транзакций
      await delay(5000);
    }
  } catch (err) {
    console.error('Error fetching signatures:', err);
  }
}

// Увеличиваем интервал проверки новых транзакций до 5 минут
setInterval(getNewTransactions, 300000);

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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, async () => {
  console.log(`Сервер запущен на порту ${port}`);
  await initDatabase();
  getNewTransactions().catch(console.error);
});

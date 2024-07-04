const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
require('dotenv').config();

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

monitorWallet().catch(console.error);

const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

console.log('Environment variables:');
console.log(`SOLANA_RPC_URL: ${SOLANA_RPC_URL || 'not set'}`);
console.log(`WALLET_ADDRESS: ${WALLET_ADDRESS || 'not set'}`);

if (!WALLET_ADDRESS) {
    console.error('WALLET_ADDRESS is not set. Please set this environment variable.');
}

if (!SOLANA_RPC_URL) {
    console.error('SOLANA_RPC_URL is not set. Please set this environment variable.');
}

app.get('/', (req, res) => {
    if (WALLET_ADDRESS) {
        res.send(`Solana Transaction Monitor is running. Monitoring wallet: ${WALLET_ADDRESS}`);
    } else {
        res.send('Error: WALLET_ADDRESS is not set. Please configure the environment variable.');
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});

const express = require('express');
console.log('Express loaded');

const { Connection, PublicKey } = require('@solana/web3.js');
console.log('Solana web3 loaded');

require('dotenv').config();
console.log('Dotenv configured');

const app = express();
const port = process.env.PORT || 3000;

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

console.log(`SOLANA_RPC_URL: ${SOLANA_RPC_URL}`);
console.log(`WALLET_ADDRESS: ${WALLET_ADDRESS}`);

let connection;
try {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log('Solana connection created');
} catch (error) {
    console.error('Error creating Solana connection:', error);
}

async function monitorWallet() {
    console.log('Starting wallet monitoring');
    try {
        const publicKey = new PublicKey(WALLET_ADDRESS);
        console.log(`Мониторинг транзакций для кошелька: ${WALLET_ADDRESS}`);
        
        connection.onLogs(
            publicKey,
            (logs, context) => {
                console.log('Новая транзакция:', context.signature);
            },
            'confirmed'
        );
        console.log('Wallet monitoring set up successfully');
    } catch (error) {
        console.error('Error in monitorWallet:', error);
    }
}

app.get('/', (req, res) => {
    res.send(`Solana Transaction Monitor is running. Monitoring wallet: ${WALLET_ADDRESS}`);
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    monitorWallet().catch(error => console.error('Error in monitorWallet:', error));
});

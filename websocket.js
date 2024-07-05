const WebSocket = require('ws');
const { processTransactionQueue } = require('./utils/transactionProcessor');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_ADDRESS = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';

const setupWebSocket = (server) => {
    const wss = new WebSocket.Server({ server });
    const transactionQueue = [];

    wss.on('connection', (ws) => {
        console.log('New WebSocket connection');
        ws.on('message', (message) => {
            console.log('Received message:', message);
        });
    });

    const ws = new WebSocket(SOLANA_RPC_URL.replace('https', 'wss'));

    ws.on('open', () => {
        const subscribeMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'logsSubscribe',
            params: [{ mentions: [WALLET_ADDRESS] }, { commitment: 'confirmed' }],
        };
        ws.send(JSON.stringify(subscribeMessage));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.method === 'logsNotification') {
            const signature = message.params.result.value.signature;
            transactionQueue.push(signature);
            processTransactionQueue(transactionQueue);
        }
    });

    ws.on('error', (error) => console.error('WebSocket error:', error));
    ws.on('close', () => setTimeout(() => setupWebSocket(server), 5000));
};

module.exports = {
    setupWebSocket,
};

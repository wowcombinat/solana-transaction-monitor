const { pool } = require('../db');
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

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

async function processTransactionQueue(transactionQueue) {
    while (transactionQueue.length > 0) {
        const signature = transactionQueue.shift();
        await processTransaction(signature);
        await delay(5000); // Wait 5 seconds between processing transactions
    }
}

module.exports = {
    processTransactionQueue,
};

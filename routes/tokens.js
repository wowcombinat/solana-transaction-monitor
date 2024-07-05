const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
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
            currentPage: parseInt(page, 10),
        };

        res.json(response);
    } catch (err) {
        console.error('Error fetching token history:', err);
        res.status(500).json({ error: "Error fetching token history", details: err.message });
    } finally {
        client.release();
    }
});

router.get('/:mint', async (req, res) => {
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

module.exports = router;

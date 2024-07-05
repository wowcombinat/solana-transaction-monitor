const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
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

module.exports = router;

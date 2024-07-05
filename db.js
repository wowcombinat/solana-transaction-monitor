const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const initDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                signature TEXT UNIQUE,
                tx_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_history (
                id SERIAL PRIMARY KEY,
                mint TEXT,
                holders NUMERIC,
                sales INT,
                purchases INT,
                price NUMERIC,
                relationships JSON,
                symbol TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS mint_transactions (
                id SERIAL PRIMARY KEY,
                mint TEXT,
                signature TEXT UNIQUE,
                details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Tables created or already exist');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        client.release();
    }
};

module.exports = {
    pool,
    initDatabase,
};

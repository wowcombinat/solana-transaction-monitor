const express = require('express');
const { initDatabase } = require('./db');
const { setupWebSocket } = require('./websocket');
const transactionsRoutes = require('./routes/transactions');
const tokensRoutes = require('./routes/tokens');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

app.use('/api/transactions', transactionsRoutes);
app.use('/api/tokens', tokensRoutes);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/history', (req, res) => {
    res.sendFile(__dirname + '/public/history.html');
});

app.get('/token', (req, res) => {
    res.sendFile(__dirname + '/public/token.html');
});

const server = app.listen(port, async () => {
    try {
        await initDatabase();
        setupWebSocket(server);
        console.log(`Server running on port ${port}`);
    } catch (error) {
        console.error('Error during server startup:', error);
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

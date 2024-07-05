-- Создание таблицы transactions
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    signature TEXT UNIQUE,
    tx_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы token_history
CREATE TABLE IF NOT EXISTS token_history (
    id SERIAL PRIMARY KEY,
    mint TEXT UNIQUE,
    holders NUMERIC,
    sales INTEGER,
    purchases INTEGER,
    price NUMERIC,
    relationships JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT,
    timestamp TIMESTAMP
);

-- Создание таблицы mint_transactions
CREATE TABLE IF NOT EXISTS mint_transactions (
    id SERIAL PRIMARY KEY,
    mint TEXT,
    signature TEXT UNIQUE,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_history_created_at ON token_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mint_transactions_created_at ON mint_transactions (created_at DESC);

-- Вставка тестовых данных в token_history
INSERT INTO token_history (mint, holders, sales, purchases, price, relationships, symbol, timestamp)
VALUES
    ('mint1', 100, 50, 30, 1.5, '{"related_mints": ["mint2", "mint3"]}', 'TKN1', NOW()),
    ('mint2', 200, 80, 60, 2.5, '{"related_mints": ["mint1", "mint3"]}', 'TKN2', NOW()),
    ('mint3', 150, 70, 40, 1.8, '{"related_mints": ["mint1", "mint2"]}', 'TKN3', NOW())
ON CONFLICT (mint) DO NOTHING;

-- Вставка тестовых данных в transactions
INSERT INTO transactions (signature, tx_data)
VALUES
    ('sig1', '{"blockTime": 1625097600, "transaction": {"message": {"instructions": []}}}'),
    ('sig2', '{"blockTime": 1625184000, "transaction": {"message": {"instructions": []}}}'),
    ('sig3', '{"blockTime": 1625270400, "transaction": {"message": {"instructions": []}}}')
ON CONFLICT (signature) DO NOTHING;

-- Вставка тестовых данных в mint_transactions
INSERT INTO mint_transactions (mint, signature, details)
VALUES
    ('mint1', 'sig1', '{"type": "mintTo", "info": {"mint": "mint1", "amount": "100"}}'),
    ('mint2', 'sig2', '{"type": "mintTo", "info": {"mint": "mint2", "amount": "200"}}'),
    ('mint3', 'sig3', '{"type": "mintTo", "info": {"mint": "mint3", "amount": "150"}}')
ON CONFLICT (signature) DO NOTHING;

CREATE TABLE token_history (
  id SERIAL PRIMARY KEY,
  mint TEXT UNIQUE,
  holders NUMERIC,
  sales INTEGER,
  purchases INTEGER,
  price NUMERIC,
  relationships JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  symbol TEXT,
  timestamp TIMESTAMP
);

CREATE TABLE mint_transactions (
  id SERIAL PRIMARY KEY,
  mint TEXT,
  signature TEXT UNIQUE,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

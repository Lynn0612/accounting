-- Add description and type columns to transactions table if they don't exist
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('income', 'expense'));


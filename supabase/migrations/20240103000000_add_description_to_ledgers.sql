-- Add description column to ledgers table
-- This migration adds a description field to ledgers for better organization

-- Add description column to ledgers table (if not exists)
ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS description TEXT;


-- Database CASCADE Setup for Account Book Management
-- This file contains SQL statements to ensure proper CASCADE behavior

-- 1. Ensure book_members table has ON DELETE CASCADE for book_id
-- This ensures that when an account_book is deleted, all related book_members are automatically deleted
-- But individual profiles are NOT deleted (they are referenced by user_id, not book_id)

-- Check current foreign key constraints
-- ALTER TABLE book_members 
-- DROP CONSTRAINT IF EXISTS book_members_book_id_fkey;

-- Add CASCADE constraint for book_id
-- ALTER TABLE book_members
-- ADD CONSTRAINT book_members_book_id_fkey 
-- FOREIGN KEY (book_id) 
-- REFERENCES account_books(id) 
-- ON DELETE CASCADE;

-- 2. Ensure transaction_splits has CASCADE for book_id
-- When a book is deleted, all transaction splits should be deleted
-- ALTER TABLE transaction_splits
-- DROP CONSTRAINT IF EXISTS transaction_splits_book_id_fkey;

-- ALTER TABLE transaction_splits
-- ADD CONSTRAINT transaction_splits_book_id_fkey
-- FOREIGN KEY (book_id)
-- REFERENCES account_books(id)
-- ON DELETE CASCADE;

-- 3. Ensure transactions has CASCADE for book_id
-- ALTER TABLE transactions
-- DROP CONSTRAINT IF EXISTS transactions_book_id_fkey;

-- ALTER TABLE transactions
-- ADD CONSTRAINT transactions_book_id_fkey
-- FOREIGN KEY (book_id)
-- REFERENCES account_books(id)
-- ON DELETE CASCADE;

-- 4. Ensure categories has CASCADE for book_id
-- ALTER TABLE categories
-- DROP CONSTRAINT IF EXISTS categories_book_id_fkey;

-- ALTER TABLE categories
-- ADD CONSTRAINT categories_book_id_fkey
-- FOREIGN KEY (book_id)
-- REFERENCES account_books(id)
-- ON DELETE CASCADE;

-- 5. Ensure settlements has CASCADE for book_id (if exists)
-- ALTER TABLE settlements
-- DROP CONSTRAINT IF EXISTS settlements_book_id_fkey;

-- ALTER TABLE settlements
-- ADD CONSTRAINT settlements_book_id_fkey
-- FOREIGN KEY (book_id)
-- REFERENCES account_books(id)
-- ON DELETE CASCADE;

-- IMPORTANT NOTES:
-- 1. Profiles table should NEVER have CASCADE on user_id references
--    - Profiles are independent entities and should persist even if a user leaves a book
--    - Only book-related data should be deleted when a book is deleted
--
-- 2. When a user leaves a book (not owner):
--    - Only the book_members row is deleted
--    - All transaction_splits, transactions, categories remain (they belong to the book)
--    - The user's profile remains intact
--
-- 3. When an owner deletes a book:
--    - All book_members are deleted (CASCADE)
--    - All transactions are deleted (CASCADE)
--    - All transaction_splits are deleted (CASCADE)
--    - All categories are deleted (CASCADE)
--    - All profiles remain intact (no CASCADE on user_id)


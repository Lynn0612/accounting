-- Enable Realtime for ledger_members and book_members tables
-- This allows clients to receive real-time updates when members are added/removed

-- Enable Realtime for ledger_members
ALTER PUBLICATION supabase_realtime ADD TABLE ledger_members;

-- Enable Realtime for book_members
ALTER PUBLICATION supabase_realtime ADD TABLE book_members;

-- Set REPLICA IDENTITY to FULL for better change tracking
ALTER TABLE ledger_members REPLICA IDENTITY FULL;
ALTER TABLE book_members REPLICA IDENTITY FULL;


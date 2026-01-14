-- Add is_notify_enabled column to book_members table
ALTER TABLE book_members 
ADD COLUMN IF NOT EXISTS is_notify_enabled BOOLEAN DEFAULT FALSE;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_book_members_notifications 
ON book_members(book_id, is_notify_enabled) 
WHERE is_notify_enabled = true;

-- Reset schema cache
NOTIFY pgrst, 'reload schema';


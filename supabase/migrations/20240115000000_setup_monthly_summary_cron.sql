-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on schema cron to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the monthly summary bot to run on the 1st day of each month at 9:00 AM
-- This will call the Supabase Edge Function via HTTP
SELECT cron.schedule(
  'monthly-summary-bot',
  '0 9 1 * *', -- Run at 9:00 AM on the 1st day of every month
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/monthly-summary-bot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Note: You need to set these settings in your Supabase project:
-- 1. Go to Project Settings > API
-- 2. Set the following via SQL:
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
--    ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'your-anon-key';
--
-- Or use environment variables in the Edge Function and call it directly via HTTP


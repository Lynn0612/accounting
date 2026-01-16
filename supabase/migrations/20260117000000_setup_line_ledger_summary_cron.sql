-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage on schema cron to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the LINE ledger summary to run on the 1st day of each month at 12:00 PM Taipei time (04:00 UTC)
-- Replace YOUR_ANON_KEY with your actual anon key from Settings > API
SELECT cron.schedule(
  'line-ledger-summary-monthly',
  '0 4 1 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://lsfyokhoxaqpzgslopcs.supabase.co/functions/v1/line-ledger-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- To check if the cron job is scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'line-ledger-summary-monthly';

-- To manually trigger the function for testing:
-- SELECT net.http_post(
--   url := 'https://lsfyokhoxaqpzgslopcs.supabase.co/functions/v1/line-ledger-summary',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer YOUR_ANON_KEY'
--   ),
--   body := '{}'::jsonb
-- );


import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createClient as createServerClient } from '@/lib/supabase/server';

export { createBrowserClient, createServerClient };

export type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;


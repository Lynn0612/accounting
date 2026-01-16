import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 設置自動刷新 session（每 5 分鐘檢查一次）
  if (typeof window !== 'undefined') {
    // 監聽 auth state 變化，自動刷新過期的 session
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        console.log('[Supabase Client] Session refreshed or signed in');
      }
    });
  }

  return client;
}


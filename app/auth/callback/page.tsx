"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Loading from "@/components/Loading";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const processCallback = async () => {
      try {
        // 檢查是否是 magic link 重定向（URL 包含 hash fragment）
        if (window.location.hash) {
          console.log('[Callback] Detected hash fragment, processing magic link redirect');
          const supabase = createClient();
          
          // 從 hash fragment 中提取 token
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          if (accessToken) {
            console.log('[Callback] Found access_token in hash, setting session...');
            
            // 設置 session（確保 await）
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || accessToken,
            });
            
            if (sessionError) {
              console.error('[Callback] Failed to set session from hash:', sessionError);
              setError(`Failed to set session: ${sessionError.message}`);
              setLoading(false);
              return;
            }
            
            if (!sessionData?.session) {
              console.error('[Callback] Session data is missing after setSession');
              setError('Session was not set correctly');
              setLoading(false);
              return;
            }
            
            console.log('[Callback] Session set successfully from magic link');
            
            // 驗證 cookie 是否已設置
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';
            const authCookieName = `sb-${projectRef}-auth-token`;
            
            // 檢查 cookie 是否存在
            const cookies = document.cookie.split(';');
            const authCookie = cookies.find(cookie => cookie.trim().startsWith(authCookieName));
            
            console.log('[Callback] Cookie check:', {
              cookieName: authCookieName,
              cookieExists: !!authCookie,
              cookieValue: authCookie ? authCookie.substring(authCookieName.length + 1).substring(0, 50) + '...' : 'N/A',
              allCookies: cookies.map(c => c.trim().split('=')[0])
            });
            
            if (!authCookie) {
              console.warn('[Callback] Auth cookie not found after setSession, waiting...');
              // 等待一下，讓 cookie 有時間設置
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // 再次檢查
              const cookiesAfterWait = document.cookie.split(';');
              const authCookieAfterWait = cookiesAfterWait.find(cookie => cookie.trim().startsWith(authCookieName));
              
              if (!authCookieAfterWait) {
                console.error('[Callback] Auth cookie still not found after wait');
                setError('Failed to set authentication cookie');
                setLoading(false);
                return;
              }
              console.log('[Callback] Auth cookie found after wait');
            }
            
            // 驗證用戶是否真的存在
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            console.log('[Callback] User verification:', { 
              hasUser: !!user, 
              userId: user?.id,
              userEmail: user?.email,
              error: userError?.message 
            });
            
            if (!user) {
              console.error('[Callback] User verification failed after setting session');
              setError('Session was set but user verification failed');
              setLoading(false);
              return;
            }
            
            console.log('[Callback] User verified, preparing redirect');
            // 清除 hash，避免在 URL 中顯示
            window.history.replaceState(null, '', window.location.pathname);
            
            // 等待確保 cookie 已保存並同步
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 使用 replace 確保不會留下一堆 callback 歷史紀錄
            console.log("Login successful, redirecting...");
            // 等待額外時間確保 cookie 完全同步
            await new Promise(resolve => setTimeout(resolve, 300));
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
            window.location.replace(siteUrl + '/');
            return;
          } else {
            console.warn('[Callback] Hash fragment found but no access_token');
          }
        }

        // 處理 LINE OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");
        const error = urlParams.get("error");

        // 檢查 LINE 返回的錯誤
        if (error) {
          setError(`LINE authentication error: ${error}`);
          setLoading(false);
          return;
        }

        // 如果沒有 code 也沒有 hash，可能是直接訪問或錯誤
        if (!code && !window.location.hash) {
          setError("No authorization code or hash fragment received");
          setLoading(false);
          return;
        }

        // 如果沒有 code，可能是 magic link 重定向但沒有 hash（不應該發生）
        if (!code) {
          console.warn('[Callback] No code received, but also no hash fragment');
          setError("No authorization code received");
          setLoading(false);
          return;
        }

        // 驗證 state（防止 CSRF 攻擊）
        const storedState = sessionStorage.getItem("auth_state");
        if (storedState) {
          // 如果我們存儲了 state，LINE 必須返回相同的 state
          if (!state) {
            setError("Missing state parameter. Possible CSRF attack.");
            setLoading(false);
            return;
          }
          if (state !== storedState) {
            setError("Invalid state parameter. Possible CSRF attack.");
            setLoading(false);
            return;
          }
          // 驗證成功，清除已使用的 state
          sessionStorage.removeItem("auth_state");
        } else if (state) {
          // 如果 LINE 返回了 state 但我們沒有存儲，可能是直接訪問 URL
          console.warn('[Callback] State received but not found in sessionStorage');
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const redirectUri = `${siteUrl}/auth/callback`;

        // 1️⃣ 呼叫 Edge Function 並傳入 code 和 redirect_uri
        // Edge Function 會使用 LINE_CHANNEL_SECRET 交換 id_token
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/line-auth`;

        const res = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        });

        const data = await res.json();

        console.log('[Callback] Edge Function response:', data);

        if (!res.ok) {
          console.error('[Callback] Edge Function error:', res.status, data);
          setError(data.error || `Server error: ${res.status}`);
          setLoading(false);
          return;
        }

        // 處理舊版本的 action_link（向後兼容）
        if (data.action_link) {
          console.log('[Callback] Received action_link (old version), redirecting...');
          window.location.href = data.action_link;
          return;
        }

        // 處理新版本的 access_token
        if (data.access_token) {
          console.log('[Callback] Received access_token from Edge Function');
          const supabase = createClient();
          
          // 使用 access_token 設置 session，確保完全完成後才 redirect
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.access_token, // 使用相同的 token 作為 refresh_token
          });
          
          if (sessionError) {
            console.error('[Callback] Session set failed:', sessionError);
            setError(`Failed to set session: ${sessionError.message}`);
            setLoading(false);
            return;
          }
          
          if (!sessionData?.session) {
            console.error('[Callback] Session data is missing after setSession');
            setError('Session was not set correctly');
            setLoading(false);
            return;
          }
          
          console.log('[Callback] Session set successfully:', {
            hasSession: !!sessionData.session,
            userId: sessionData.session.user?.id,
            expiresAt: sessionData.session.expires_at
          });
          
          // 檢查 Cookie 是否已設置
          const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
          const projectRef = supabaseUrlEnv.split('//')[1]?.split('.')[0] || ''
          const expectedCookieName = `sb-${projectRef}-auth-token`
          const hasCookie = document.cookie.includes(expectedCookieName)
          
          console.log('[Callback] Cookie check:', {
            cookieName: expectedCookieName,
            cookieExists: hasCookie,
            allCookies: document.cookie
          });
          
          // 確保 session 完全設置後再進行後續操作
          // 等待一下確保 cookie 已設置並同步到服務器
          await new Promise(resolve => setTimeout(resolve, 500));
          
          console.log('[Callback] Session and cookie set, redirecting to home page...');
          // Session 設置完成才跳轉
          // 使用 replace 確保不會留下一堆 callback 歷史紀錄
          // middleware 會檢查 Cookie，所以即使 getUser() 失敗也能通過
          // 等待額外時間確保 cookie 完全同步
          await new Promise(resolve => setTimeout(resolve, 300));
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          window.location.replace(siteUrl + '/');
          return;
        } else {
          console.error('[Callback] No access_token:', data);
          setError(data.error || "Authentication failed: No access_token received");
          setLoading(false);
        }
      } catch (e: any) {
        console.error('[Callback] Error:', e);
        setError(e.message || "An error occurred during authentication");
        setLoading(false);
      }
    };

    processCallback();
  }, []);

  if (loading && !error) {
    return <Loading fullScreen message="Logging in..." size="lg" />;
  }

  if (error) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-background-light flex items-center justify-center px-6 z-[9999]">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-lg text-center">
          <div className="mb-6">
            <span className="material-symbols-outlined text-red-500 text-5xl">error</span>
          </div>
          <h2 className="text-2xl font-bold text-text-main mb-3">Authentication Failed</h2>
          <p className="text-text-muted mb-6 break-words">{error}</p>
          <button
            onClick={() => {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
              window.location.href = siteUrl + '/login';
            }}
            className="inline-block px-6 py-3 bg-primary text-white rounded-full font-semibold hover:bg-primary/90 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return <Loading fullScreen message="Logging in..." size="lg" />;
}

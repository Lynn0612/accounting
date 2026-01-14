import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isInvitePage = pathname.startsWith('/invite')
  const isPublicRoute = isLoginPage || isAuthCallback || isInvitePage

  // 公開路由直接放行，不做任何檢查
  if (isPublicRoute) {
    return NextResponse.next({
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 如果環境變數缺失，重定向到登入頁
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          const cookies = request.cookies.getAll()
          return cookies
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Debug: 記錄所有 cookies
  const allCookies = request.cookies.getAll()
  const cookieNames = allCookies.map(c => c.name)
  const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const projectRef = supabaseUrlEnv.split('//')[1]?.split('.')[0] || ''
  const expectedCookieName = `sb-${projectRef}-auth-token`
  const authCookie = allCookies.find(c => c.name === expectedCookieName)
  
  console.log('Middleware Debug:', {
    path: pathname,
    expectedCookie: expectedCookieName,
    hasAuthCookie: !!authCookie,
    authCookieValue: authCookie ? authCookie.value.substring(0, 50) + '...' : 'N/A',
    allCookies: cookieNames
  })

  // 只要有 Cookie，我們就暫時相信他是登入的 (因為你的 page.tsx 已經驗證過了)
  const hasValidCookie = !!authCookie

  // 獲取 session (用於同步，但不強制要求)
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()
  
  // 如果 session 錯誤，記錄詳細信息（但不立即失敗，因為可能是自定義 JWT）
  if (sessionError) {
    console.error('Middleware Session Error:', {
      message: sessionError.message,
      status: sessionError.status,
      name: sessionError.name
    })
  }

  // Debug: 記錄 Supabase session
  console.log('Middleware Supabase session:', {
    hasSession: !!session,
    sessionError: sessionError?.message,
    sessionUserId: session?.user?.id,
    sessionUserEmail: session?.user?.email
  })
  
  if (session) {
    console.log('Middleware Session Details:', {
      access_token: session.access_token ? session.access_token.substring(0, 20) + '...' : 'N/A',
      expires_at: session.expires_at,
      user_id: session.user?.id,
      user_email: session.user?.email
    })
  }

  // 修改登入判斷邏輯
  // 只要有 Session 或 有 Cookie 就視為登入
  const isLoggedIn = !!session || hasValidCookie

  console.log('Middleware Security Bypass:', {
    isLoggedIn,
    hasAuthCookie: hasValidCookie,
    hasSession: !!session,
    path: pathname
  })
  
  // 如果用戶已登入，確保不重定向到 /login
  if (isLoggedIn) {
    console.log('Middleware: User is logged in (session or cookie exists), allowing access')
    // 如果用戶已登入但訪問登入頁，重定向到首頁
    if (isLoginPage) {
      console.log('Middleware: Logged in user accessing login page, redirecting to home')
      return NextResponse.redirect(new URL('/', request.url))
    }
    console.log('Middleware: Allowing access to protected route')
    return response
  }

  // 只有當用戶未登入時，才重定向到登入頁
  console.log('Middleware: User is NOT logged in (no session and no cookie), redirecting to /login')
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = '/login'
  if (pathname !== '/') {
    redirectUrl.searchParams.set('redirect', pathname)
  }
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


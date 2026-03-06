import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isInvitePage = pathname.startsWith('/invite')
  const isPublicRoute = isLoginPage || isAuthCallback || isInvitePage

  // 檢查是否來自 LIFF (LINE Front-end Framework)
  const userAgent = request.headers.get('user-agent') || ''
  const referer = request.headers.get('referer') || ''
  const isFromLIFF = userAgent.includes('Line') || referer.includes('liff.line.me') || request.headers.get('x-liff-id')

  // 公開路由直接放行，不做任何檢查
  if (isPublicRoute) {
    return NextResponse.next({
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  }

  // 如果來自 LIFF，給予更多時間讓認證狀態同步
  if (isFromLIFF) {
    console.log('Middleware: Request from LIFF detected, allowing access with relaxed auth check')
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
          cookiesToSet.forEach(({ name, value, options }) => {
            // 確保 auth cookie 設置為持久化（30天）
            // 在 LIFF 環境中，使用 'none' 以確保跨域 cookie 正常工作
            if (name.includes('auth-token')) {
              response.cookies.set(name, value, {
                ...options,
                maxAge: 60 * 60 * 24 * 30, // 30 days
                sameSite: isFromLIFF ? 'none' as const : 'lax' as const, // LIFF 需要 'none'
                secure: true, // 'none' 需要 secure，且 HTTPS 環境必須使用
                httpOnly: false, // 需要讓客戶端也能訪問
                path: '/',
              })
            } else {
            response.cookies.set(name, value, options)
            }
          })
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

  // 獲取 user (使用 getUser 而不是 getSession，更可靠)
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()
  
  // 如果 user 錯誤，記錄詳細信息（但不立即失敗，因為可能是自定義 JWT）
  if (userError) {
    console.error('Middleware User Error:', {
      message: userError.message,
      status: userError.status,
      name: userError.name
    })
  }

  // 也嘗試獲取 session 作為備用檢查
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()
  
  // Debug: 記錄 Supabase user 和 session
  console.log('Middleware Supabase auth:', {
    hasUser: !!user,
    hasSession: !!session,
    userError: userError?.message,
    sessionError: sessionError?.message,
    userId: user?.id,
    userEmail: user?.email
  })
  
  if (user) {
    console.log('Middleware User Details:', {
      user_id: user.id,
      user_email: user.email
    })
  }

  // 修改登入判斷邏輯
  // 只要有 User 或 Session 或 Cookie 就視為登入
  // 如果來自 LIFF，即使沒有認證也暫時允許（讓前端處理認證，避免無限重定向）
  const isLoggedIn = !!user || !!session || hasValidCookie

  console.log('Middleware Security Check:', {
    isLoggedIn,
    hasUser: !!user,
    hasAuthCookie: hasValidCookie,
    hasSession: !!session,
    isFromLIFF,
    path: pathname
  })
  
  // 如果用戶已登入，確保不重定向到 /login
  if (isLoggedIn) {
    console.log('Middleware: User is logged in (user/session/cookie exists), allowing access')
    // 如果用戶已登入但訪問登入頁，重定向到首頁
    if (isLoginPage) {
      console.log('Middleware: Logged in user accessing login page, redirecting to home')
      // 本機開發時用目前請求的 origin，避免導向錯誤 port
      const siteUrl = request.nextUrl.origin.startsWith('http://localhost')
        ? request.nextUrl.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin)
      return NextResponse.redirect(new URL('/', siteUrl))
    }
    console.log('Middleware: Allowing access to protected route')
    return response
  }

  // 如果來自 LIFF 但沒有認證，允許訪問但讓前端處理（避免無限重定向循環）
  // 這樣 LIFF 可以初始化並處理認證，而不會被 middleware 重定向
  if (isFromLIFF) {
    console.log('Middleware: Request from LIFF without auth, allowing access for LIFF to handle auth')
    return response
  }

  // 只有當用戶未登入且不是來自 LIFF 時，才重定向到登入頁
  console.log('Middleware: User is NOT logged in (no user/session/cookie), redirecting to /login')
  // 本機開發時用目前請求的 origin，避免導向錯誤 port
  const siteUrl = request.nextUrl.origin.startsWith('http://localhost')
    ? request.nextUrl.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin)
  const redirectUrl = new URL('/login', siteUrl)
  
  // 保留原始路徑作為重定向參數（支援多種參數名稱）
  if (pathname !== '/') {
    // 優先使用 returnTo，如果沒有則使用 redirect
    const existingReturnTo = request.nextUrl.searchParams.get('returnTo')
    const existingDestination = request.nextUrl.searchParams.get('destination')
    
    if (existingReturnTo) {
      redirectUrl.searchParams.set('returnTo', existingReturnTo)
    } else if (existingDestination) {
      redirectUrl.searchParams.set('destination', existingDestination)
    } else {
    redirectUrl.searchParams.set('redirect', pathname)
    }
  }
  
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - /auth/callback and /login are explicitly included to ensure they are processed
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


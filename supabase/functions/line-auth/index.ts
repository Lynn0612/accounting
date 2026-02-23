import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 接收 code 或 id_token（優先使用 id_token）
    const { code, redirect_uri, id_token } = await req.json()

    let lineUser;

    if (id_token) {
      // 如果直接提供了 id_token，直接驗證
      const verifyRes = await fetch(
        'https://api.line.me/oauth2/v2.1/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id_token,
            client_id: Deno.env.get('LINE_CHANNEL_ID')!,
          }),
        }
      )

      lineUser = await verifyRes.json()

      if (!verifyRes.ok) {
        return new Response(JSON.stringify(lineUser), { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (code && redirect_uri) {
      // 如果提供了 code，先交換 token
      const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri,
          client_id: Deno.env.get('LINE_CHANNEL_ID')!,
          client_secret: Deno.env.get('LINE_CHANNEL_SECRET')!,
        }),
      })

      const tokenData = await tokenResponse.json()
      if (!tokenData.id_token) {
        console.error('LINE token exchange failed:', tokenData)
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to get LINE id_token')
      }

      // 驗證 id_token
      const verifyRes = await fetch(
        'https://api.line.me/oauth2/v2.1/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id_token: tokenData.id_token,
            client_id: Deno.env.get('LINE_CHANNEL_ID')!,
          }),
        }
      )

      lineUser = await verifyRes.json()

      if (!verifyRes.ok) {
        return new Response(JSON.stringify(lineUser), { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing code or id_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const lineUserId = lineUser.sub
    // 處理缺失的 email：如果 LINE 沒有提供 email，使用占位符格式
    const hasEmail = lineUser.email && lineUser.email.trim() !== ''
    const email = hasEmail ? lineUser.email : `${lineUserId}@no-email.line.app`

    // 2️⃣ 用 service_role 建立 Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3️⃣ 先嘗試通過 LINE User ID 查找現有用戶（優先策略）
    // 這樣即使 email 改變或缺失，也能找到正確的用戶
    let userId: string | null = null
    let existingUserEmail: string | null = null
    
    const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      console.error('Error listing users:', listError)
      // 不拋出錯誤，繼續嘗試創建用戶
    } else {
      // 通過 line_sub 在 user_metadata 中查找現有用戶
      const existingUser = allUsers?.users?.find((u: any) => {
        return u.user_metadata?.line_sub === lineUserId
      })
      
      if (existingUser) {
        userId = existingUser.id
        existingUserEmail = existingUser.email
        console.log('Found existing user by line_sub:', {
          userId,
          email: existingUserEmail,
          line_sub: lineUserId
        })
      }
    }

    // 4️⃣ 如果沒有找到現有用戶，嘗試創建新用戶
    if (!userId) {
      const { data: createData, error: createError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            provider: 'line',
            full_name: lineUser.name,
            avatar_url: lineUser.picture,
            line_sub: lineUserId,
          },
        })

      // ✅ 如果是 email 已存在 → 再次查找現有用戶（可能是通過 email）
      if (createError && (createError as any).code === 'email_exists') {
        console.log('Email already exists, searching for user by email:', email)
        
        // 如果之前沒有找到，現在通過 email 查找
        if (!allUsers) {
          const { data: usersData, error: listError2 } = await supabase.auth.admin.listUsers()
          if (listError2) throw listError2
          
          const userByEmail = usersData.users.find((u: any) => u.email === email)
          if (userByEmail) {
            userId = userByEmail.id
            existingUserEmail = userByEmail.email
            console.log('Found existing user by email:', { userId, email: existingUserEmail })
          }
        } else {
          const userByEmail = allUsers.users.find((u: any) => u.email === email)
          if (userByEmail) {
            userId = userByEmail.id
            existingUserEmail = userByEmail.email
            console.log('Found existing user by email:', { userId, email: existingUserEmail })
          }
        }
        
        // 如果還是找不到，嘗試通過 line_sub 查找（可能是 email 改變的情況）
        if (!userId) {
          const userByLineSub = allUsers?.users?.find((u: any) => {
            return u.user_metadata?.line_sub === lineUserId
          })
          
          if (userByLineSub) {
            userId = userByLineSub.id
            existingUserEmail = userByLineSub.email
            console.log('Found existing user by line_sub (after email conflict):', {
              userId,
              email: existingUserEmail,
              line_sub: lineUserId
            })
          }
        }
        
        if (!userId) {
          throw new Error(`User exists but could not be found. Email: ${email}, LINE User ID: ${lineUserId}`)
        }
      } else if (createError) {
        throw createError
      } else {
        // 新創建的用戶
        if (!createData?.user?.id) {
          throw new Error('User created but ID is missing')
        }
        userId = createData.user.id
        existingUserEmail = email
        console.log('Created new user:', { userId, email: existingUserEmail })
      }
    }

    console.log('User ID:', userId)

    // 3.5️⃣ Upsert profile with LINE data
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: lineUser.name,
        avatar_url: lineUser.picture,
        line_user_id: lineUserId, // Save LINE user ID for push notifications
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })

    if (profileError) {
      console.error('Profile upsert error:', profileError)
      // 不阻止登入，只記錄錯誤
    } else {
      console.log('Profile synced successfully')
    }

    // 4️⃣ 創建自定義 JWT payload
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      aud: "authenticated",
      iat: now,
      nbf: now, // 不早於現在
      exp: now + (60 * 60 * 24 * 30), // 30 天後過期，與 cookie 持久化一致，減少重新登入
      sub: userId,
      role: "authenticated",
    }

    // 5️⃣ 使用 Web Crypto API 簽名 JWT
    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not set')
    }

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    }

    const base64UrlEncode = (str: string) => {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
    }

    const encodedHeader = base64UrlEncode(JSON.stringify(header))
    const encodedPayload = base64UrlEncode(JSON.stringify(payload))
    const signatureInput = `${encodedHeader}.${encodedPayload}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signatureInput)
    )

    const encodedSignature = base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    )

    const accessToken = `${signatureInput}.${encodedSignature}`

    console.log('JWT generated successfully')
    return new Response(
      JSON.stringify({
        access_token: accessToken,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (err: any) {
    console.error('LINE Auth Error:', err)
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    // 在 Deno 環境中，使用 Deno.env 檢查環境
    const isDevelopment = Deno.env.get('ENVIRONMENT') === 'development' || !Deno.env.get('ENVIRONMENT')
    return new Response(JSON.stringify({ 
      error: errorMessage,
      ...(isDevelopment && { details: String(err) })
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

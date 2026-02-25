import { createClient } from './supabase/client'

interface LineAuthResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  error?: string
}

export async function exchangeLineToken(idToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/line-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ id_token: idToken }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Line auth error:', errorData)
      return { success: false, error: errorData.error || 'Failed to exchange token' }
    }

    const data: LineAuthResponse = await response.json()

    if (data.error) {
      return { success: false, error: data.error }
    }

    const supabase = createClient()
    // 自訂 JWT 無 refresh_token 時需傳入 access_token 以通過 Supabase 客戶端檢查
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || data.access_token,
    })

    if (sessionError) {
      console.error('Session error:', sessionError)
      return { success: false, error: sessionError.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Exchange token error:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}


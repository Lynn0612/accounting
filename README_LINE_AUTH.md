# LINE JWT Exchange Setup Guide

## 1. Environment Variables

在 Supabase Dashboard 的 Edge Functions 環境變數中設置：

- `LINE_CHANNEL_ID`: 你的 LINE Channel ID
- `SUPABASE_JWT_SECRET`: Supabase Legacy HS256 JWT Secret

## 2. Deploy Edge Function

```bash
# 安裝 Supabase CLI (如果還沒安裝)
npm install -g supabase

# 登入 Supabase
supabase login

# 連結到你的項目
supabase link --project-ref your-project-ref

# 部署 Edge Function
supabase functions deploy line-auth
```

## 3. 設置環境變數

在 Supabase Dashboard:
1. 前往 Project Settings > Edge Functions
2. 找到 `line-auth` function
3. 添加環境變數：
   - `LINE_CHANNEL_ID`: 你的 LINE Channel ID
   - `SUPABASE_JWT_SECRET`: 你的 Supabase JWT Secret (Legacy HS256)

## 4. 客戶端使用

### 方法 1: 使用提供的函數

```typescript
import { exchangeLineToken } from '@/lib/line-auth'

// 從 LINE SDK 獲取 id_token 後
const result = await exchangeLineToken(idToken)
if (result.success) {
  // 登入成功，重定向到首頁
  router.push('/')
} else {
  // 處理錯誤
  console.error(result.error)
}
```

### 方法 2: 直接調用 Edge Function

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const response = await fetch(`${supabaseUrl}/functions/v1/line-auth`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ id_token: lineIdToken }),
})

const { access_token } = await response.json()

const supabase = createClient()
await supabase.auth.setSession({
  access_token,
  refresh_token: '',
})
```

## 5. LINE SDK 集成示例

如果你使用 LINE Login SDK，可以這樣獲取 id_token：

```typescript
// 在 LINE Login 回調中
const idToken = liff.getIDToken()
if (idToken) {
  const result = await exchangeLineToken(idToken)
  if (result.success) {
    router.push('/')
  }
}
```

## 注意事項

1. **JWT Secret**: 確保使用正確的 Legacy HS256 Secret，不是新的 JWT Secret
2. **CORS**: Edge Function 已經設置了 CORS headers
3. **錯誤處理**: 確保在客戶端處理所有可能的錯誤情況
4. **安全性**: `id_token` 應該從安全的 LINE 登入流程中獲取，不要從不信任的來源獲取


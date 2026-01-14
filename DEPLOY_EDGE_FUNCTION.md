# 部署 monthly-summary-bot Edge Function

## 方法 1: 使用 Supabase CLI

### 1. 安裝 Supabase CLI（如果還沒安裝）
```bash
npm install -g supabase
```

### 2. 登入 Supabase
```bash
supabase login
```

### 3. 連結到你的專案
```bash
supabase link --project-ref your-project-ref
```

### 4. 部署 Edge Function
```bash
supabase functions deploy monthly-summary-bot
```

## 方法 2: 直接在 Supabase Dashboard 創建

### 1. 前往 Supabase Dashboard
- 打開 https://supabase.com/dashboard
- 選擇你的專案

### 2. 創建 Edge Function
- 點擊左側選單的 "Edge Functions"
- 點擊 "Create a new function"
- Function name: `monthly-summary-bot`
- 複製 `supabase/functions/monthly-summary-bot/index.ts` 的內容到編輯器
- 點擊 "Deploy"

### 3. 設置環境變數
- 在 Edge Function 頁面，點擊 "Settings"
- 添加以下環境變數：
  - `SUPABASE_URL`: 你的 Supabase 項目 URL（可在 Project Settings > API 找到）
  - `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key（可在 Project Settings > API 找到，注意保密）
  - `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API 的 Channel Access Token

### 4. 設置定時任務（Cron Job）

#### 選項 A: 使用 Supabase Cron Jobs（推薦）
1. 前往 Database > Cron Jobs
2. 點擊 "Create a new cron job"
3. 設置：
   - Name: `monthly-summary-bot`
   - Schedule: `0 9 1 * *` (每月 1 號上午 9 點)
   - SQL:
   ```sql
   SELECT
     net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-summary-bot',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer YOUR_ANON_KEY'
       ),
       body := '{}'::jsonb
     ) AS request_id;
   ```
   - 替換 `YOUR_PROJECT_REF` 和 `YOUR_ANON_KEY`

#### 選項 B: 使用 pg_cron（需要啟用擴展）
```sql
-- 啟用 pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 創建定時任務
SELECT cron.schedule(
  'monthly-summary-bot',
  '0 9 1 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-summary-bot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

## 測試 Edge Function

### 手動觸發測試
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-summary-bot \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

或在 Supabase Dashboard 的 Edge Functions 頁面點擊 "Invoke" 按鈕。

## 注意事項

1. **環境變數**: 確保所有環境變數都已正確設置
2. **LINE Token**: 確保 LINE_CHANNEL_ACCESS_TOKEN 有效
3. **權限**: 確保 Service Role Key 有權限訪問所有需要的表
4. **測試**: 部署後先手動觸發測試，確認功能正常


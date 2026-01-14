# Invite Link Auto-Join Implementation

## 概述

實現了邀請連結自動加入功能，當用戶點擊邀請連結並登入後，會自動加入對應的帳本。

## 實現的三個部分

### Part 1: 數據庫 RPC 函數

**文件**: `supabase/migrations/join_book_via_invite.sql`

**功能**:
- 創建了 `join_book_via_invite(target_book_id UUID)` 函數
- 使用 `SECURITY DEFINER` 以繞過 RLS 策略
- 自動獲取當前認證用戶 ID (`auth.uid()`)
- 檢查帳本是否存在
- 檢查用戶是否已經是成員
- 使用 `ON CONFLICT DO NOTHING` 處理重複加入的情況
- 返回 JSON 格式的成功/失敗信息

**部署方式**:
```sql
-- 在 Supabase SQL Editor 中執行
-- 或使用 Supabase CLI:
supabase db push
```

### Part 2: 登入頁面 - 捕獲邀請 ID

**文件**: `app/login/page.tsx`

**功能**:
- 使用 `useEffect` 監聽 URL 參數 `invite_book_id`
- 如果找到，存儲到 `sessionStorage` 中（key: `'pending_invite_book_id'`）
- 這樣即使重定向到 LINE 登入，邀請 ID 也不會丟失

**使用方式**:
```
https://app.com/login?invite_book_id=UUID
```

### Part 3: Dashboard - 處理邀請

**文件**: `components/HomePageClient.tsx`

**功能**:
- 在組件掛載時檢查用戶是否已認證
- 檢查 `sessionStorage` 中是否有 `'pending_invite_book_id'`
- 如果有，調用 RPC 函數 `join_book_via_invite`
- 顯示 Toast 通知：
  - 成功：顯示 "Successfully joined the account book!"
  - 已存在：顯示 "You are already a member of this book."
  - 失敗：顯示錯誤訊息
- **重要**：處理完成後立即清除 `sessionStorage` 中的值，防止重複加入
- 成功後刷新頁面以更新帳本列表

## 流程圖

```
用戶點擊邀請連結
    ↓
/login?invite_book_id=UUID
    ↓
存儲到 sessionStorage
    ↓
用戶登入 (LINE OAuth)
    ↓
重定向到首頁 (/)
    ↓
HomePageClient 檢查 sessionStorage
    ↓
調用 RPC 函數 join_book_via_invite
    ↓
顯示 Toast 通知
    ↓
清除 sessionStorage
    ↓
刷新頁面
```

## 安全考慮

1. **RPC 函數使用 SECURITY DEFINER**: 確保有權限插入到 `book_members` 表
2. **自動獲取用戶 ID**: 使用 `auth.uid()` 防止用戶偽造身份
3. **帳本存在性檢查**: 確保帳本存在才允許加入
4. **重複加入處理**: 使用 `ON CONFLICT DO NOTHING` 安全處理

## 測試步驟

1. 生成邀請連結：`/login?invite_book_id=<book-uuid>`
2. 在未登入狀態下訪問該連結
3. 點擊 LINE 登入
4. 完成登入後，應該看到 Toast 通知
5. 檢查 Settings 頁面，確認已加入帳本
6. 刷新頁面，確認不會重複加入

## 注意事項

- 確保 `book_members` 表有 `(book_id, user_id)` 的唯一約束
- Toast 通知會在 2-3 秒後自動消失
- 如果用戶已經是成員，會顯示相應的提示訊息
- 所有錯誤都會被記錄到控制台


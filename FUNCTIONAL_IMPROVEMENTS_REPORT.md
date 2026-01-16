# 功能與邏輯改善報告

## 執行摘要
本報告詳細分析了專案的功能邏輯、錯誤處理、數據一致性等問題，並提供了具體的改善建議。

---

## 🔴 嚴重問題（必須修復）

### 1. 事務一致性問題 - Transaction 和 Splits 創建不同步 ⚠️⚠️⚠️

**問題描述：**
在 `app/add/page.tsx` 中，如果 transaction 創建成功但 splits 創建失敗，會留下孤立的 transaction 記錄，導致數據不一致。

**當前代碼：**
```typescript
// app/add/page.tsx:1077-1117
const { data: transaction, error: txError } = await supabase
  .from("transactions")
  .insert(transactionData)
  .select()
  .single();

if (txError || !transaction) {
  handleError(txError, `保存失敗: ${txError?.message || 'Unknown error'}`);
  setSaving(false);
  return;
}

// 如果這裡失敗，transaction 已經創建但 splits 沒有創建
const { error: splitError } = await supabase
  .from("transaction_splits")
  .insert(splitRecords);

if (splitError) {
  handleError(splitError, '保存分攤失敗');
  setSaving(false);
  return; // ❌ 問題：transaction 已經創建，但 splits 沒有創建
}
```

**影響：**
- 數據不一致：transaction 存在但沒有對應的 splits
- 餘額計算錯誤：可能導致餘額計算不準確
- 用戶體驗差：用戶看到錯誤但不知道數據已經部分保存

**解決方案：**

**方案 1：使用數據庫事務（推薦）**
```typescript
// 使用 Supabase 的 RPC 函數來確保原子性
const { data, error } = await supabase.rpc('create_transaction_with_splits', {
  transaction_data: transactionData,
  split_records: splitRecords
})

if (error) {
  handleError(error, '保存失敗');
  setSaving(false);
  return;
}
```

**方案 2：失敗時清理（臨時方案）**
```typescript
const { data: transaction, error: txError } = await supabase
  .from("transactions")
  .insert(transactionData)
  .select()
  .single();

if (txError || !transaction) {
  handleError(txError, `保存失敗: ${txError?.message || 'Unknown error'}`);
  setSaving(false);
  return;
}

const { error: splitError } = await supabase
  .from("transaction_splits")
  .insert(splitRecords);

if (splitError) {
  // ✅ 修復：如果 splits 創建失敗，刪除已創建的 transaction
  await supabase
    .from("transactions")
    .delete()
    .eq('id', transaction.id);
  
  handleError(splitError, '保存分攤失敗，已取消交易');
  setSaving(false);
  return;
}
```

**優先級：** 🔴 高 - 必須立即修復

---

### 2. 編輯頁面的事務順序問題 ⚠️⚠️

**問題描述：**
在 `app/edit/[id]/page.tsx` 中，先刪除舊 splits，然後更新 transaction。如果更新失敗，splits 已經被刪除但 transaction 可能沒有更新。

**當前代碼：**
```typescript
// app/edit/[id]/page.tsx:897-895
// Delete old splits
await supabase
  .from('transaction_splits')
  .delete()
  .eq('transaction_id', transactionId)

// 如果這裡失敗，splits 已經被刪除但 transaction 沒有更新
const { error: updateError } = await supabase
  .from('transactions')
  .update({...})
  .eq('id', transactionId)

if (updateError) {
  handleError(updateError, '更新交易失敗')
  setSaving(false)
  return // ❌ 問題：splits 已經被刪除，但 transaction 沒有更新
}
```

**解決方案：**

**方案 1：使用數據庫事務（推薦）**
```typescript
// 使用 Supabase 的 RPC 函數
const { data, error } = await supabase.rpc('update_transaction_with_splits', {
  transaction_id: transactionId,
  transaction_data: {...},
  split_records: splitRecords
})
```

**方案 2：先更新 transaction，再處理 splits（較安全）**
```typescript
// 1. 先更新 transaction
const { error: updateError } = await supabase
  .from('transactions')
  .update({...})
  .eq('id', transactionId)

if (updateError) {
  handleError(updateError, '更新交易失敗')
  setSaving(false)
  return
}

// 2. 只有當 transaction 更新成功後，才刪除和重新創建 splits
await supabase
  .from('transaction_splits')
  .delete()
  .eq('transaction_id', transactionId)

// 3. 創建新的 splits
const { error: splitError } = await supabase
  .from('transaction_splits')
  .insert(splitRecords)

if (splitError) {
  // 如果 splits 創建失敗，可以選擇：
  // a) 回滾 transaction（需要 RPC）
  // b) 提示用戶手動修復
  handleError(splitError, '更新分攤失敗，請重新編輯')
  setSaving(false)
  return
}
```

**優先級：** 🔴 高 - 必須立即修復

---

## 🟡 中優先級問題（建議修復）

### 3. 金額上限驗證缺失 ⚠️

**問題描述：**
沒有對極大金額進行驗證，用戶可能輸入異常大的金額（如 999999999），可能導致：
- 數據庫溢出
- 計算錯誤
- UI 顯示問題

**建議：**
```typescript
// 在 isValidAmount 函數中添加上限檢查
const isValidAmount = () => {
  const num = parseFloat(amount);
  const MAX_AMOUNT = 99999999; // 例如：9999 萬
  
  return (
    amount !== "0" &&
    !isNaN(num) &&
    num > 0 &&
    num <= MAX_AMOUNT && // ✅ 添加上限檢查
    !amount.includes("+") &&
    !amount.includes("×") &&
    !amount.includes("÷") &&
    !(amount.includes("-") && amount.split("-").length > 2)
  );
};
```

**優先級：** 🟡 中 - 建議修復

---

### 4. 並發編輯問題 ⚠️

**問題描述：**
當多個用戶同時編輯同一筆交易時，沒有樂觀鎖或版本控制機制，可能導致：
- 後保存的修改覆蓋先保存的修改
- 數據丟失

**建議：**
```typescript
// 添加版本號或時間戳檢查
const { data: transaction, error } = await supabase
  .from('transactions')
  .select('id, updated_at, version') // 添加 version 欄位
  .eq('id', transactionId)
  .single()

// 在更新時檢查版本
const { error: updateError } = await supabase
  .from('transactions')
  .update({
    ...updateData,
    version: transaction.version + 1 // 版本號遞增
  })
  .eq('id', transactionId)
  .eq('version', transaction.version) // 只有版本號匹配才更新

if (updateError) {
  // 如果版本號不匹配，說明有其他用戶修改過
  handleError(null, '交易已被其他用戶修改，請重新載入')
  return
}
```

**優先級：** 🟡 中 - 建議修復（如果有多用戶同時編輯的需求）

---

### 5. 錯誤處理可以更詳細 ⚠️

**問題描述：**
某些錯誤處理可以更詳細，幫助用戶理解問題。

**當前代碼：**
```typescript
if (splitError) {
  handleError(splitError, '保存分攤失敗');
  setSaving(false);
  return;
}
```

**建議：**
```typescript
if (splitError) {
  // 根據錯誤類型提供更詳細的錯誤信息
  let errorMessage = '保存分攤失敗';
  if (splitError.code === '23503') {
    errorMessage = '保存分攤失敗：參與者不存在或已被移除';
  } else if (splitError.code === '23505') {
    errorMessage = '保存分攤失敗：分攤記錄已存在';
  } else if (splitError.message) {
    errorMessage = `保存分攤失敗：${splitError.message}`;
  }
  handleError(splitError, errorMessage);
  setSaving(false);
  return;
}
```

**優先級：** 🟡 中 - 建議改善

---

## 🟢 低優先級問題（可選改善）

### 6. 輸入驗證可以更嚴格

**問題描述：**
某些輸入驗證可以更嚴格，例如：
- 描述欄位長度限制
- 日期範圍驗證（不能是未來日期或太早的日期）

**建議：**
```typescript
// 描述長度限制
if (note && note.length > 500) {
  handleError(null, '描述長度不能超過 500 字元');
  return;
}

// 日期驗證
const today = new Date();
today.setHours(23, 59, 59, 999);
if (selectedDate > today) {
  handleError(null, '記帳日期不能是未來日期');
  return;
}

const minDate = new Date('2000-01-01');
if (selectedDate < minDate) {
  handleError(null, '記帳日期不能早於 2000 年');
  return;
}
```

**優先級：** 🟢 低 - 可選改善

---

### 7. 可以添加操作日誌

**問題描述：**
沒有操作日誌記錄，難以追蹤誰在什麼時候修改了什麼。

**建議：**
考慮添加 `transaction_logs` 表來記錄：
- 操作類型（創建、更新、刪除）
- 操作者
- 操作時間
- 修改前後的值

**優先級：** 🟢 低 - 可選改善

---

## ✅ 已經做得很好的部分

1. **錯誤處理機制** - 使用統一的 `useErrorHandler` hook，錯誤處理一致
2. **權限控制** - RBAC 實現完善，Viewer 角色限制正確
3. **數據驗證** - 基本的數據驗證都有（金額、類別、付款人等）
4. **用戶體驗** - 有 loading 狀態、錯誤提示、防止重複提交等
5. **緩存管理** - 使用 React Query 進行緩存管理，並在保存後正確 invalidate

---

## 總結

### 必須立即修復的問題：
1. ✅ **事務一致性問題** - Transaction 和 Splits 創建不同步
2. ✅ **編輯頁面的事務順序問題** - Splits 刪除和 Transaction 更新的順序

### 建議修復的問題：
3. ⚠️ **金額上限驗證** - 防止異常大金額
4. ⚠️ **並發編輯問題** - 添加版本控制（如果有多用戶需求）
5. ⚠️ **錯誤處理詳細化** - 提供更詳細的錯誤信息

### 可選改善：
6. 🟢 **輸入驗證更嚴格** - 描述長度、日期範圍等
7. 🟢 **操作日誌** - 記錄操作歷史

---

## 實施建議

1. **立即實施**：修復事務一致性問題（問題 1 和 2）
2. **近期實施**：添加金額上限驗證和改善錯誤處理
3. **長期優化**：考慮添加版本控制和操作日誌

整體來說，專案的功能邏輯和錯誤處理已經相當完善，主要需要修復的是**事務一致性問題**，這是數據完整性的關鍵。


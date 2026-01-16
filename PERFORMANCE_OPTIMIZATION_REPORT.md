# 效能優化報告

## 執行摘要
本報告詳細分析了專案的效能瓶頸，並提供了具體的優化建議。主要關注點包括：數據庫查詢優化、React Query 緩存策略、組件渲染優化、API 路由優化等。

---

## 1. 數據庫查詢優化

### 1.1 useParticipants Hook - 需要優化 ⚠️

**問題：**
- 當前實現需要兩次查詢：先查 ledger/book，再查 profiles
- 可以合併為一次查詢使用 JOIN

**當前代碼：**
```typescript
// hooks/useParticipants.ts
// 第一次查詢：檢查是 ledger 還是 account_book
const { data: ledger } = await supabase
  .from('ledgers')
  .select('id')
  .eq('id', ledgerId)
  .single()

// 第二次查詢：獲取 members
// 第三次查詢：獲取 profiles
```

**優化建議：**
```typescript
// 使用一次查詢，直接從 ledger_members 或 book_members JOIN profiles
const { data: members } = await supabase
  .from('ledger_members')
  .select(`
    user_id,
    profiles!inner (
      id,
      full_name,
      avatar_url
    )
  `)
  .eq('ledger_id', ledgerId)
```

**預期改善：** 減少 1-2 次數據庫查詢，提升 30-50% 的載入速度

---

### 1.2 useLedgerBalance Hook - 可以並行化 ⚠️

**問題：**
- 多個查詢是順序執行的，可以並行化
- 某些查詢可以合併

**當前代碼：**
```typescript
// hooks/useLedgerBalance.ts
// 順序執行多個查詢
let incomeResult = await supabase...
let expenseTxResult = await supabase...
let splitsSelfResult = await supabase...
let splitsOthersResult = await supabase...
```

**優化建議：**
```typescript
// 使用 Promise.all 並行執行不相關的查詢
const [incomeResult, expenseTxResult] = await Promise.all([
  supabase.from('transactions').select('amount')...,
  supabase.from('transactions').select('id, amount, payer_id')...
])

// 合併 splits 查詢，使用一次查詢獲取所有需要的數據
const splitsResult = await supabase
  .from('transaction_splits')
  .select(`
    transaction_id,
    amount,
    user_id,
    transactions!inner (
      type,
      expense_payment_source,
      payer_id
    )
  `)
  .eq('ledger_id', ledgerId)
  .in('user_id', [currentUserId, ...otherUserIds])
```

**預期改善：** 減少 40-60% 的查詢時間

---

### 1.3 useTransactions Hook - 可以優化 JOIN ⚠️

**問題：**
- 當 `includePayer` 為 true 時，需要額外的查詢來獲取 payer profiles
- 可以使用 Supabase 的 JOIN 功能一次性獲取

**當前代碼：**
```typescript
// hooks/useTransactions.ts
// 先查詢 transactions
const { data, error } = await query

// 然後再查詢 profiles
if (includePayer && data && data.length > 0) {
  const payerIds = data.map((tx: any) => tx.payer_id)...
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', payerIds)
}
```

**優化建議：**
```typescript
// 在初始查詢中就 JOIN profiles
let query = supabase
  .from('transactions')
  .select(`
    id,
    amount,
    description,
    date,
    type,
    payer_id,
    category_id,
    expense_payment_source,
    income_mode,
    created_at,
    ${includeCategory ? 'categories (id, name, icon)' : ''},
    ${includePayer ? 'payer:profiles!transactions_payer_id_fkey (id, full_name, avatar_url)' : ''}
  `)
```

**預期改善：** 減少 1 次查詢，提升 20-30% 的載入速度

---

## 2. React Query 緩存優化

### 2.1 useCurrentUserRole - staleTime 過低 ⚠️

**問題：**
- `staleTime: 0` 導致每次組件掛載都會重新獲取
- 用戶角色通常不會頻繁變化

**當前代碼：**
```typescript
// hooks/useCurrentUserRole.ts
staleTime: 0, // Always refetch to get latest role
refetchOnMount: true,
refetchOnWindowFocus: true,
```

**優化建議：**
```typescript
staleTime: 2 * 60 * 1000, // 2 minutes
refetchOnMount: false, // 只在必要時重新獲取
refetchOnWindowFocus: false, // 避免過度重新獲取
```

**預期改善：** 減少不必要的 API 調用，提升頁面切換速度

---

### 2.2 HomePageClient - 多個查詢可以優化 ⚠️

**問題：**
- 多個獨立的查詢，某些可以合併或使用 `initialData`
- `settlements` 查詢沒有使用 React Query hook

**當前代碼：**
```typescript
// components/HomePageClient.tsx
const { data: realTimeTransactions } = useTransactions({...})
const { data: settlements = [] } = useQuery({...}) // 內聯查詢
const { data: monthlyTransactions } = useTransactions({...})
```

**優化建議：**
1. 將 `settlements` 查詢移到獨立的 hook
2. 使用 `initialData` 避免重複查詢
3. 考慮使用 `useQueries` 批量查詢

```typescript
// 創建 useSettlements hook
export function useSettlements(ledgerId: string | null, limit?: number) {
  return useQuery({
    queryKey: ['settlements', 'recent', ledgerId, limit],
    queryFn: async () => {
      if (!ledgerId) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('settlements')
        .select('id, sender_id, receiver_id, amount, created_at, date, note')
        .eq('ledger_id', ledgerId)
        .order('created_at', { ascending: false })
        .limit(limit || 5)
      return error ? [] : data
    },
    enabled: !!ledgerId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
```

**預期改善：** 更好的緩存管理和代碼組織

---

## 3. 組件渲染優化

### 3.1 HomePageClient - 缺少 React.memo ⚠️

**問題：**
- 組件沒有使用 `React.memo`，可能導致不必要的重新渲染
- 某些計算可以使用 `useMemo` 優化

**優化建議：**
```typescript
// components/HomePageClient.tsx
export default React.memo(function HomePageClient({...}) {
  // ... existing code ...
  
  // 優化計算
  const totalIncome = useMemo(() => {
    return transactionsToUse
      .filter((tx: any) => tx.type === 'income' && tx.isSettlement !== true)
      .reduce((sum, tx) => sum + Number(tx.amount), 0)
  }, [transactionsToUse])
  
  const totalExpenses = useMemo(() => {
    return transactionsToUse
      .filter((tx: any) => tx.expense_payment_source !== 'deposit')
      .reduce((sum, tx) => sum + Number(tx.amount), 0)
  }, [transactionsToUse])
})
```

**預期改善：** 減少不必要的重新渲染，提升 10-20% 的渲染性能

---

### 3.2 TransactionCard - 應該使用 React.memo ⚠️

**問題：**
- 列表中的組件應該使用 `React.memo` 避免不必要的重新渲染

**優化建議：**
```typescript
// components/TransactionCard.tsx
export default React.memo(function TransactionCard({...}) {
  // ... existing code ...
}, (prevProps, nextProps) => {
  // 自定義比較函數，只在關鍵 props 變化時重新渲染
  return (
    prevProps.id === nextProps.id &&
    prevProps.amount === nextProps.amount &&
    prevProps.date === nextProps.date
  )
})
```

---

## 4. API 路由優化

### 4.1 stock-price API - 緩存策略可以改進 ⚠️

**問題：**
- `revalidate: 60` 對於股票價格來說可能太長
- 沒有錯誤重試機制

**當前代碼：**
```typescript
// app/api/stock-price/route.ts
next: { revalidate: 60 },
```

**優化建議：**
```typescript
// 根據不同交易所設置不同的緩存時間
const cacheTime = exchange === 'CRYPTO' ? 30 : 60 // 加密貨幣更頻繁更新

next: { revalidate: cacheTime },
// 添加錯誤處理和重試
```

---

### 4.2 news API - 可以添加響應緩存 ⚠️

**問題：**
- RSS feed 解析可能較慢
- 可以添加更積極的緩存策略

**優化建議：**
```typescript
// app/api/news/route.ts
export async function GET(request: Request) {
  // 添加響應緩存標頭
  return NextResponse.json(
    { items: allNews.slice(0, 20) },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}
```

---

## 5. 代碼分割和懶加載

### 5.1 大型組件應該懶加載 ⚠️

**問題：**
- `app/add/page.tsx` 和 `app/edit/[id]/page.tsx` 文件很大（2000+ 行）
- 應該使用動態導入減少初始包大小

**優化建議：**
```typescript
// app/add/page.tsx
// 將某些大型組件或邏輯拆分為獨立文件
import dynamic from 'next/dynamic'

const NumericKeypad = dynamic(() => import('@/components/NumericKeypad'), {
  ssr: false,
  loading: () => <div>Loading...</div>
})

const CategoryPicker = dynamic(() => import('@/components/CategoryPicker'), {
  ssr: false,
})
```

---

### 5.2 Finance 頁面已經有動態導入 ✅

**狀態：** 已經正確使用 `dynamic` 導入大型圖表庫

---

## 6. 數據庫索引優化

### 6.1 建議添加的索引 ⚠️

**問題：**
- 某些常用查詢可能缺少索引

**建議索引：**
```sql
-- transaction_splits 表
CREATE INDEX IF NOT EXISTS idx_transaction_splits_ledger_user 
ON transaction_splits(ledger_id, user_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_book_user 
ON transaction_splits(book_id, user_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_user 
ON transaction_splits(transaction_id, user_id);

-- transactions 表
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_date 
ON transactions(ledger_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_book_date 
ON transactions(book_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_payer 
ON transactions(payer_id) WHERE payer_id IS NOT NULL;

-- settlements 表
CREATE INDEX IF NOT EXISTS idx_settlements_ledger_receiver 
ON settlements(ledger_id, receiver_id);

CREATE INDEX IF NOT EXISTS idx_settlements_ledger_sender 
ON settlements(ledger_id, sender_id);
```

**預期改善：** 查詢速度提升 50-80%

---

## 7. 其他優化建議

### 7.1 使用 React Query 的 `useQueries` 批量查詢 ⚠️

**問題：**
- 多個相關查詢可以批量執行

**優化建議：**
```typescript
// 在 HomePageClient 中
const queries = useQueries({
  queries: [
    {
      queryKey: ['transactions', 'recent', activeLedger?.id],
      queryFn: () => getTransactions({...}),
      enabled: !!activeLedger?.id,
    },
    {
      queryKey: ['settlements', 'recent', activeLedger?.id],
      queryFn: () => getSettlements({...}),
      enabled: !!activeLedger?.id,
    },
  ],
})
```

---

### 7.2 優化圖片加載 ⚠️

**問題：**
- 用戶頭像和類別圖標沒有使用 Next.js Image 組件

**優化建議：**
```typescript
import Image from 'next/image'

// 替換 <img> 標籤
<Image
  src={profile.avatar_url}
  alt={profile.full_name}
  width={40}
  height={40}
  className="rounded-full"
  loading="lazy"
/>
```

---

## 8. 優先級建議

### 高優先級（立即實施）
1. ✅ **useParticipants Hook 優化** - 減少查詢次數
2. ✅ **useLedgerBalance Hook 並行化** - 顯著提升載入速度
3. ✅ **添加數據庫索引** - 提升查詢性能
4. ✅ **useCurrentUserRole staleTime 調整** - 減少不必要的請求

### 中優先級（近期實施）
1. ⚠️ **useTransactions JOIN 優化** - 減少查詢次數
2. ⚠️ **組件 React.memo 優化** - 減少重新渲染
3. ⚠️ **API 路由緩存優化** - 提升響應速度

### 低優先級（長期優化）
1. ⚠️ **代碼分割和懶加載** - 減少初始包大小
2. ⚠️ **圖片優化** - 使用 Next.js Image 組件
3. ⚠️ **批量查詢優化** - 使用 useQueries

---

## 9. 預期整體改善

實施所有高優先級優化後，預期可以獲得：
- **頁面載入速度提升：** 40-60%
- **數據庫查詢減少：** 30-50%
- **API 請求減少：** 20-30%
- **渲染性能提升：** 10-20%

---

## 10. 監控建議

建議添加性能監控：
1. 使用 React DevTools Profiler 監控組件渲染
2. 使用 Supabase Dashboard 監控數據庫查詢性能
3. 使用 Next.js Analytics 監控頁面載入時間
4. 添加自定義性能指標記錄

---

## 結論

專案整體架構良好，使用了 React Query 進行狀態管理，但在數據庫查詢優化和組件渲染優化方面還有改進空間。建議優先實施高優先級的優化項目，這些改動相對簡單但效果顯著。


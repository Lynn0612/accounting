# 打包大小優化總結

## 已完成的優化

### 1. 動態導入重組件

#### app/finance/page.tsx
- ✅ **recharts** (~200KB): 使用 `next/dynamic` 動態導入
  - 創建 `RechartsWrapper` 組件，按需加載所有 recharts 組件
  - 設置 `ssr: false` 避免服務器端渲染
  - 添加 loading 狀態

- ✅ **lightweight-charts** (~150KB): 使用 `next/dynamic` 動態導入
  - 設置 `ssr: false`
  - 添加 loading 狀態

#### app/statistics/page.tsx
- ✅ 移除了未使用的 recharts 導入
  - 該頁面使用自定義 SVG 圖表，不需要 recharts

### 2. 依賴檢查

#### 已使用的依賴
- ✅ `recharts`: 在 `app/finance/page.tsx` 中使用（已動態導入）
- ✅ `lightweight-charts`: 在 `components/LightweightCandlestickChart.tsx` 中使用（已動態導入）
- ✅ `xml2js`: 在 `app/api/news/route.ts` 中使用（API 路由，不影響客戶端打包）

#### 未使用的組件
- ⚠️ `components/CandlestickChart.tsx`: 目前未被使用，但保留以備將來使用

### 3. 優化效果

**預期減少打包大小**:
- 初始包大小減少約 **350KB**（recharts + lightweight-charts）
- 這些庫只在需要時（訪問 finance 頁面）才加載
- 首屏加載時間顯著改善

**代碼分割**:
- 圖表組件被分割到獨立的 chunk
- 使用 Next.js 自動代碼分割
- 按需加載，減少初始包大小

## 建議的後續優化

### 可選優化
1. **檢查未使用的依賴**:
   - 運行 `npm run build` 並檢查 bundle analyzer
   - 考慮使用 `@next/bundle-analyzer` 分析打包大小

2. **優化圖標庫**:
   - `lucide-react` 支持 tree-shaking，但可以考慮按需導入
   - 檢查是否有未使用的圖標

3. **優化字體**:
   - Material Symbols 字體可能較大，考慮使用 subset

## 注意事項

- 動態導入的組件不會在服務器端渲染（`ssr: false`）
- 首次訪問 finance 頁面時會有短暫的加載時間
- 後續訪問會使用瀏覽器緩存


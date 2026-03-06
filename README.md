# Accounting

專案目錄結構：

```
Accounting/
├── frontend/          # Next.js 前端
│   ├── app/
│   ├── components/
│   ├── package.json
│   ├── next.config.js
│   └── ...
├── ai-service/        # FastAPI AI 微服務
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example    # 複製為 .env 並填入變數
│   └── venv/           # Python 虛擬環境（需自行建立）
├── supabase/          # Supabase 設定與 migrations
└── README.md
```

## 開發

### 前端

```bash
cd frontend
npm install   # 若尚未安裝依賴
npm run dev
```

### AI 微服務

```bash
cd ai-service
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 編輯 .env 填入所需變數
uvicorn main:app --reload
```

API 文件：<http://127.0.0.1:8000/docs>

from fastapi import FastAPI
from pydantic import BaseModel
import requests
import json
import re
from supabase_service import (
    get_transactions,
    get_categories,
    create_transaction,
    delete_transaction
)
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允許所有網域
    allow_credentials=True,
    allow_methods=["*"],  # 允許 GET, POST 等所有方法
    allow_headers=["*"],  # 允許所有標頭
)

class RecordRequest(BaseModel):
    ledger_id: str
    user_input: str
    payer_id: str


def extract_json(text):
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(text)
    except:
        return None


# --- RAG / analyze 保留不變 ---
class AnalyzeRequest(BaseModel):
    ledger_id: str
    user_query: str


@app.get("/")
def root():
    return {"message": "AI Financial Service Running"}


@app.post("/analyze")
def analyze_finance(request: AnalyzeRequest):
    raw_data = get_transactions(request.ledger_id)
    if not raw_data:
        return {"analysis": "目前沒有找到任何交易資料"}

    formatted_data = ""
    for t in raw_data:
        formatted_data += f"{t['date']} {t['type']} {t['amount']} {t['note']}\n"

    prompt = f"""
你是一位專業且幽默的財務顧問。

以下是使用者的記帳資料：

{formatted_data}

請回答使用者問題：
{request.user_query}

規則：
1. 只能根據提供的資料回答
2. 如果資料不足請說不知道
3. 如果有大額支出請給幽默省錢建議
4. 【最重要】你必須、絕對要使用「台灣繁體中文 (zh-TW)」回答，禁止使用英文或簡體中文！
5. 【最重要】不要出現任何「英文」或「簡體中文」，只能使用「台灣繁體中文 (zh-TW)」回答。
6. 回答的字數盡量不要超過 100 字，最多不要超過 150 字。
"""
    url = "http://localhost:11434/api/generate"
    payload = {"model": "llama3", "prompt": prompt, "stream": False}

    try:
        response = requests.post(url, json=payload)
        result = response.json()
        return {"analysis": result.get("response")}
    except Exception as e:
        return {"error": str(e)}


# --- Agent 分流接口 ---
@app.post("/agent")
def financial_agent(request: RecordRequest):
    categories = get_categories(request.ledger_id)
    category_names = [c["name"] for c in categories]

    prompt = f"""
你是一個全能財務管家。請判斷使用者意圖並回傳 JSON。
可用類別：{category_names}
今天日期：2026-03-09

回傳格式：
{{
    "intent": "CREATE" | "DELETE" | "ANALYZE",
    "data": {{
        "amount": 數字,
        "note": "關鍵字",
        "category_name": "從可用類別中選一個最接近的，若無合適則選 '其他'",
        "date": "YYYY-MM-DD"
    }}
}}

使用者輸入："{request.user_input}"
只回傳 JSON。
"""

    url = "http://localhost:11434/api/generate"
    payload = {"model": "llama3", "prompt": prompt, "stream": False}

    try:
        response = requests.post(url, json=payload)
        ai_raw = response.json().get("response")
        result = extract_json(ai_raw)

        if not result:
            return {"error": "AI 回傳格式錯誤", "raw": ai_raw}

        intent = result.get("intent")
        data = result.get("data")

        if intent == "ANALYZE":
            return analyze_finance(AnalyzeRequest(
                ledger_id=request.ledger_id,
                user_query=request.user_input
            ))

        if intent == "DELETE":
            deleted = delete_transaction(request.ledger_id, data.get("note"), data.get("date"))
            return {"status": "success", "action": "deleted", "data": deleted}

        if intent == "CREATE":
            category_map = {c["name"]: c["id"] for c in categories}
            # fallback 類別
            category_id = category_map.get(data.get("category_name"), category_map.get("其他"))

            transaction_data = {
                "ledger_id": request.ledger_id,
                "payer_id": request.payer_id,
                "category_id": category_id,
                "amount": data.get("amount", 0),
                "note": data.get("note"),
                "date": data.get("date"),
                "type": "expense",
                "expense_payment_source": "personal",
                "is_public_expense": False
            }

            created = create_transaction(transaction_data)
            return {"status": "success", "action": "created", "data": created}

    except Exception as e:
        return {"error": str(e)}
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL or Key not found in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_transactions(ledger_id: str):
    try:
        response = (
            supabase.table("transactions")
            .select("amount, note, date, type, category_id")
            .eq("ledger_id", ledger_id)
            .execute()
        )
        return response.data
    except Exception as e:
        print("Supabase query error:", e)
        return []


def get_categories(ledger_id: str):
    try:
        response = supabase.table("categories").select("id, name").eq("ledger_id", ledger_id).execute()
        default_response = supabase.table("categories").select("id, name").is_("ledger_id", "null").execute()
        categories = response.data + default_response.data
        # 如果沒有 fallback 類別就加一個 "其他"
        if not any(c["name"] == "其他" for c in categories):
            categories.append({"id": "00000000-0000-0000-0000-000000000000", "name": "其他"})
        return categories
    except Exception as e:
        print("Supabase query error:", e)
        return []


def create_transaction(data: dict):
    try:
        response = supabase.table("transactions").insert(data).execute()
        return response.data
    except Exception as e:
        print("Supabase insert error:", e)
        return None


def delete_transaction(ledger_id: str, note: str, date: str):
    try:
        response = (
            supabase.table("transactions")
            .delete()
            .eq("ledger_id", ledger_id)
            .ilike("note", f"%{note}%")
            .eq("date", date)
            .execute()
        )
        return response.data
    except Exception as e:
        print("Supabase delete error:", e)
        return None
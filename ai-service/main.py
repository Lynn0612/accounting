from fastapi import FastAPI
from pydantic import BaseModel
import requests
import json

app = FastAPI()

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def read_root():
    return {"status": "AI Service is running on Local Ollama"}

@app.post("/chat")
def chat_with_ai(request: ChatRequest):
    # Ollama 預設運行在 11434 端口
    url = "http://localhost:11434/api/generate"
    
    payload = {
        "model": "llama3",  # 確保這跟你在命令行 run 的名稱一樣
        "prompt": request.message,
        "stream": False
    }

    try:
        response = requests.post(url, json=payload)
        response_data = response.json()
        return {"ai_response": response_data.get("response")}
    except Exception as e:
        return {"error": str(e)}
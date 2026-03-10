"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 訊息格式
type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
};

export default function AIFinancialAgent() {
  const pathname = usePathname();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content:
        "你好！我是你的專屬 AI 財務管家 🤖\n你可以問我：「這個月花最多在哪？」或直接說：「昨天買飲料花了 50 元」來記帳！",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ❗ 這裡請換成你目前登入使用者的真實 ID 與 帳本 ID ❗
  const DEMO_LEDGER_ID = "0a42d286-87ed-4ac6-9998-78577254e931";
  const DEMO_PAYER_ID = "be2f8770-fcf9-48c2-8c2e-43a20c32b056";

  // 自動捲動到最新訊息
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 處理發送訊息（邏輯維持不變）
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8000/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledger_id: DEMO_LEDGER_ID,
          user_input: text,
          payer_id: DEMO_PAYER_ID,
        }),
      });

      const data = await response.json();
      let aiReply = "抱歉，我剛剛有點恍神，可以再說一次嗎？";

      if (data.analysis) {
        aiReply = data.analysis;
      } else if (data.action === "created") {
        aiReply = `✅ 記帳成功！已為您記錄一筆金額為 $${data.data[0].amount} 的支出。`;
      } else if (data.action === "deleted") {
        aiReply = `🗑️ 已為您刪除相關的帳務紀錄！`;
      } else if (data.error) {
        aiReply = `⚠️ 發生錯誤：${data.error}`;
      }

      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "ai", content: aiReply },
      ]);
    } catch (error) {
      console.error("API Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: "⚠️ 連線失敗，請確認本地端 FastAPI 是否有啟動！",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    "📊 這個月花最多在哪？",
    "💡 給我一些省錢建議",
    "🗑️ 刪除昨天的火鍋",
  ];

  return (
    <div className="min-h-screen bg-background-light">
      <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 pt-4 pb-24">
        {/* 頁面標題區（與其他頁一致的 style） */}
        <header className="mb-4">
          <div className="flex items-center justify-center mb-1 mt-3 ">
            <h1 className="text-xl font-extrabold text-text-main tracking-tight">
              AI 財務管家
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-3">
            用自然語言就能記帳與分析消費，試著問問看「這個月花最多在哪？」
          </p>
        </header>

        {/* 主要卡片區 */}
        <main className="flex-1 flex flex-col gap-3">
          <section className="bg-white rounded-3xl shadow-soft border border-gray-100 flex flex-col overflow-hidden">
            {/* 快捷按鈕 */}
            <div className="flex gap-2 p-3 overflow-x-auto border-b no-scrollbar bg-background-light/40">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSendMessage(q)}
                  className="whitespace-nowrap bg-primary/5 text-primary px-3 py-1.5 rounded-full text-xs font-medium hover:bg-primary/10 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* 對話區 */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[60vh]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-white rounded-br-sm"
                        : "bg-background-light text-text-main border border-gray-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-background-light border border-gray-100 text-text-secondary rounded-2xl rounded-bl-sm px-3 py-2 text-sm shadow-soft flex items-center gap-1.5">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce delay-100">●</span>
                    <span className="animate-bounce delay-200">●</span>
                    <span className="ml-1">AI 正在思考中...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* 輸入列 */}
            <div className="p-3 border-t bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSendMessage(inputText)
                  }
                  placeholder="輸入「昨天吃火鍋 200」或詢問財務狀況..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-background-light"
                  disabled={isLoading}
                />
                <button
                  onClick={() => handleSendMessage(inputText)}
                  disabled={isLoading || !inputText.trim()}
                  className="bg-primary text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-primary-light disabled:bg-gray-300 disabled:text-gray-600 transition-colors"
                >
                  發送
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* Bottom Navigation：與其他頁一致 */}
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-50">
          <Link
            href="/"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${
              pathname === "/"
                ? "bg-primary/10 text-primary"
                : "text-gray-400 hover:text-primary hover:bg-gray-50"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                pathname === "/" ? "filled" : ""
              }`}
              style={
                pathname === "/"
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              home
            </span>
          </Link>
          <Link
            href="/statistics"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${
              pathname === "/statistics"
                ? "bg-primary/10 text-primary"
                : "text-gray-400 hover:text-primary hover:bg-gray-50"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                pathname === "/statistics" ? "filled" : ""
              }`}
              style={
                pathname === "/statistics"
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              pie_chart
            </span>
          </Link>
          <div className="w-12" />
          <Link
            href="/Aifinance"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${
              pathname === "/Aifinance"
                ? "bg-primary/10 text-primary"
                : "text-gray-400 hover:text-primary hover:bg-gray-50"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                pathname === "/Aifinance" ? "filled" : ""
              }`}
              style={
                pathname === "/Aifinance"
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              account_balance_wallet
            </span>
          </Link>
          <Link
            href="/settings"
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors ${
              pathname === "/settings"
                ? "bg-primary/10 text-primary"
                : "text-gray-400 hover:text-primary hover:bg-gray-50"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                pathname === "/settings" ? "filled" : ""
              }`}
              style={
                pathname === "/settings"
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              settings
            </span>
          </Link>
          <div className="absolute -top-6 left-1/2 -translate-x-1/2">
            <Link
              href="/add"
              className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                add
              </span>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
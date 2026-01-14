"use client";

import { useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

interface LineLoginButtonProps {
  className?: string;
}

export default function LineLoginButton({ className = "" }: LineLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLineLogin = () => {
    try {
      setLoading(true);

      const clientId = process.env.NEXT_PUBLIC_LINE_CHANNEL_ID;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`;

      if (!clientId) {
        setErrorMessage("LINE_CHANNEL_ID 未設置。請在 .env.local 文件中設置 NEXT_PUBLIC_LINE_CHANNEL_ID");
        setShowErrorModal(true);
        setLoading(false);
        return;
      }

      const state = crypto.randomUUID();
      sessionStorage.setItem("auth_state", state);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state,
        scope: "profile openid email",
      });

      const authUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
      window.location.href = authUrl;
    } catch (error) {
      console.error("Error initiating LINE login:", error);
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleLineLogin}
        disabled={loading}
        className={`w-full max-w-[320px] flex items-center justify-center gap-3 h-14 px-6 bg-[#06C755] text-white rounded-2xl font-bold text-[17px] tracking-wide shadow-lg shadow-[#06C755]/20 hover:opacity-90 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>登入中...</span>
          </>
        ) : (
          <>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.348 0 .63.285.63.63 0 .349-.282.63-.63.63H17.61v1.125h1.755zm-2.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.27l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H6.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2"
                fill="currentColor"
              />
            </svg>
            <span>Log in with LINE</span>
          </>
        )}
      </button>

      <ConfirmModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onConfirm={() => setShowErrorModal(false)}
        title="錯誤"
        message={errorMessage}
        confirmText="確定"
        cancelText=""
        type="warning"
      />
    </>
  );
}


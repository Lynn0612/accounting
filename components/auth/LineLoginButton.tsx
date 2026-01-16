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
            <span>logging in...</span>
          </>
        ) : (
          <>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M24 10.304c0-5.231-5.373-9.485-12-9.485S0 5.073 0 10.304c0 4.685 4.257 8.604 10.003 9.351.39.083.92.257 1.051.589.12.304.079.779.039 1.087l-.17 1.023c-.051.306-.245 1.198 1.055.654 1.3-.543 7.022-4.136 9.58-7.078 1.636-1.782 2.442-3.418 2.442-5.526z"
                fill="white"
              />
              <path
                d="M6.92 13.525H5.253a.352.352 0 01-.353-.352V7.12a.352.352 0 01.353-.352h.176c.195 0 .353.158.353.352v5.353h1.138c.195 0 .353.158.353.353v.352a.352.352 0 01-.353.347zm2.46-.352a.352.352 0 01-.353.352h-.176a.352.352 0 01-.353-.352V7.12a.352.352 0 01.353-.352h.176c.195 0 .353.158.353.352v6.053zm5.053 0a.352.352 0 01-.322.35l-.147.002h-.144a.434.434 0 01-.34-.17l-2.03-2.735v2.553a.352.352 0 01-.353.352h-.176a.352.352 0 01-.353-.352V7.12a.352.352 0 01.319-.35h.147h.147a.432.432 0 01.334.167l2.035 2.741V7.12a.352.352 0 01.353-.352h.176a.352.352 0 01.353.352v6.053zm3.76-2.527h-1.138v1.127h1.138c.195 0 .353.158.353.353v.352a.352.352 0 01-.353.352h-1.666a.352.352 0 01-.353-.352V7.12a.352.352 0 01.353-.352h1.666c.195 0 .353.158.353.352v.353a.352.352 0 01-.353.352h-1.138V9.2h1.138c.195 0 .353.158.353.353v.352a.352.352 0 01-.353.352z"
                fill="#06C755"
                stroke="#06C755"
                stroke-width="0.3"
                stroke-linecap="round"
                stroke-linejoin="round"
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


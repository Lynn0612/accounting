"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LineLoginButton from "@/components/auth/LineLoginButton";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [isDebugLoading, setIsDebugLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  useEffect(() => {
    const inviteBookId = searchParams.get("invite_book_id");
    if (inviteBookId) {
      sessionStorage.setItem("pending_invite_book_id", inviteBookId);
    }
    
    // Handle pending invite from sessionStorage (from /invite page)
    const pendingInviteId = sessionStorage.getItem("pending_invite_id");
    const pendingInviteType = sessionStorage.getItem("pending_invite_type");
    
    if (pendingInviteId && pendingInviteType === 'account_book') {
      sessionStorage.setItem("pending_invite_book_id", pendingInviteId);
      sessionStorage.removeItem("pending_invite_id");
      sessionStorage.removeItem("pending_invite_type");
    }
  }, [searchParams]);

  const errorMessage = searchParams.get("error");

  const handleDebugLogin = async () => {
    setIsDebugLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'forever83612@hotmail.com',
        password: '123456',
      });
      
      if (error) {
        console.error('Guest Login 1 Error:', error.message);
        setAlertMessage('Guest Login 1 Failed. Please try again or use LINE Login.');
        setShowAlertModal(true);
      } else if (data?.user) {
        console.log('Guest Login 1 Successful:', data.user.id);
        // 登入成功後執行與 LINE 登入相同的跳轉邏輯
        // 等待確保 cookie 已保存並同步
        await new Promise(resolve => setTimeout(resolve, 500));
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        window.location.replace(siteUrl + '/');
      } else {
        setAlertMessage('Login failed. Please try again.');
        setShowAlertModal(true);
      }
    } catch (err) {
      console.error('Guest Login 1 Exception:', err);
      setAlertMessage('Login failed. Please try again.');
      setShowAlertModal(true);
    } finally {
      setIsDebugLoading(false);
    }
  };

  const handleDebugLogin2 = async () => {
    setIsDebugLoading(true);
    try {
      const email = process.env.NEXT_PUBLIC_DEBUG_USER2_EMAIL;
      const password = process.env.NEXT_PUBLIC_DEBUG_USER2_PASSWORD;

      if (!email || !password) {
        setAlertMessage('Guest Login 2 is not configured. Please use Guest Login 1 or LINE Login.');
        setShowAlertModal(true);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error('Guest Login 2 Error:', error.message);
        setAlertMessage('Guest Login 2 Failed. Please try again or use LINE Login.');
        setShowAlertModal(true);
      } else if (data?.user) {
        console.log('Guest Login 2 Successful:', data.user.id);
        
        // Update profile full_name to "2 Test" for Guest Login 2
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name: '2 Test',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id',
          });

        if (profileError) {
          console.error('Failed to update profile:', profileError);
        } else {
          console.log('Profile updated to "2 Test"');
        }
        
        // 等待確保 cookie 已保存並同步
        await new Promise(resolve => setTimeout(resolve, 500));
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        window.location.replace(siteUrl + '/');
      } else {
        setAlertMessage('Login failed. Please try again.');
        setShowAlertModal(true);
      }
    } catch (err) {
      console.error('Guest Login 2 Exception:', err);
      setAlertMessage('Login failed. Please try again.');
      setShowAlertModal(true);
    } finally {
      setIsDebugLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-background-light">
      <div className="relative flex h-full w-full flex-col mx-auto max-w-md shadow-2xl bg-background-light">
        <div className="h-12 w-full shrink-0"></div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 z-10 min-h-0">
          <div className="flex flex-col items-center gap-2 mb-8">
            <h1 className="text-primary tracking-tight text-[30px] font-extrabold leading-tight text-center">
            Track Your Expenses
            </h1>
            <p className="text-[#657486] text-lg font-medium leading-normal text-center max-w-[260px]">
            Financial Freedom
            </p>
          </div>

          <div className="relative flex items-center justify-center w-full aspect-square max-w-[600px] mb-10 group flex-shrink-0">
            <div
              className="w-full h-full bg-contain bg-center bg-no-repeat transition-transform duration-700 ease-in-out hover:scale-105"
              style={{
                backgroundImage: 'url("/icon.png")',
                backgroundSize: "contain",
              }}
            ></div>
          </div>

          <div className="w-full flex flex-col gap-4 items-center mt-auto mb-8">
            {errorMessage && (
              <div className="w-full max-w-[320px] px-4 py-3 bg-red-50 border border-red-200 rounded-full text-red-600 text-sm text-center">
                {errorMessage}
              </div>
            )}
            <LineLoginButton />
            <div className="w-full max-w-[320px] flex flex-col gap-3">
              <button
                onClick={handleDebugLogin}
                disabled={isDebugLoading}
                className="w-full px-6 py-3 bg-white border-2 border-primary/20 text-primary rounded-full font-semibold hover:bg-primary/5 hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isDebugLoading ? 'Logging in...' : 'Guest Login 1'}
              </button>
              <button
                onClick={handleDebugLogin2}
                disabled={isDebugLoading}
                className="w-full px-6 py-3 bg-white border-2 border-primary/20 text-primary rounded-full font-semibold hover:bg-primary/5 hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isDebugLoading ? 'Logging in...' : 'Guest Login 2'}
              </button>
            </div>
          </div>
        </div>

        {/* <div className="w-full pb-8 px-6 text-center z-10 shrink-0">
          <p className="text-[#9aa5b1] text-xs font-normal leading-relaxed">
            By logging in, you agree to our{" "}
            <a
              className="underline decoration-1 underline-offset-2 hover:text-primary transition-colors"
              href="#"
            >
              Terms of Service
            </a>{" "}
            &{" "}
            <a
              className="underline decoration-1 underline-offset-2 hover:text-primary transition-colors"
              href="#"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div> */}

        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-primary/5 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[60%] h-[40%] bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
      </div>

      <ConfirmModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        onConfirm={() => setShowAlertModal(false)}
        title="Error"
        message={alertMessage}
        confirmText="Confirm"
        cancelText=""
        type="warning"
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-background-light"><div>Loading...</div></div>}>
      <LoginPageContent />
    </Suspense>
  );
}


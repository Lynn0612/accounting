"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLedger } from "@/contexts/LedgerContext";
import Loading from "@/components/Loading";

function InvitePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const { refreshLedgers } = useLedger();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleInvite = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // User not logged in, redirect to login with invite parameter
          const ledgerId = searchParams.get('ledger');
          const bookId = searchParams.get('book');
          const inviteId = ledgerId || bookId;
          
          if (inviteId) {
            sessionStorage.setItem('pending_invite_id', inviteId);
            sessionStorage.setItem('pending_invite_type', ledgerId ? 'ledger' : 'account_book');
          }
          
          router.push('/login');
          return;
        }

        const ledgerId = searchParams.get('ledger');
        const bookId = searchParams.get('book');

        if (ledgerId) {
          // Join ledger
          const { data, error } = await supabase.rpc('join_ledger_by_code', {
            ledger_code: ledgerId
          });

          if (error) {
            setStatus('error');
            setMessage(error.message || 'Failed to join ledger');
            return;
          }

          if (data && data.success) {
            setStatus('success');
            setMessage(data.already_member ? 'You are already a member of this ledger.' : 'Successfully joined the ledger!');
            
            // Refresh ledgers
            if (refreshLedgers) {
              await refreshLedgers();
            }
            
            // Redirect to home after 1.5 seconds
            setTimeout(() => {
              router.push('/');
            }, 1500);
          } else {
            // Check if it's an already_member case (which should be treated as success)
            if (data?.already_member) {
              setStatus('success');
              setMessage('You are already a member of this ledger.');
              
              // Refresh ledgers
              if (refreshLedgers) {
                await refreshLedgers();
              }
              
              // Redirect to home after 1.5 seconds
              setTimeout(() => {
                router.push('/');
              }, 1500);
            } else {
              setStatus('error');
              setMessage(data?.message || 'Failed to join ledger');
            }
          }
        } else if (bookId) {
          // Join account book (existing logic)
          const { data, error } = await supabase.rpc("join_book_via_invite", {
            target_book_id: bookId,
          });

          if (error) {
            setStatus('error');
            setMessage(error.message || 'Failed to join account book');
            return;
          }

          if (data && data.success) {
            setStatus('success');
            setMessage(data.already_member ? 'You are already a member of this book.' : 'Successfully joined the account book!');
            
            setTimeout(() => {
              router.push('/');
            }, 1500);
          } else {
            setStatus('error');
            setMessage(data?.message || 'Failed to join account book');
          }
        } else {
          setStatus('error');
          setMessage('Invalid invitation link');
        }
      } catch (error: any) {
        console.error('Error handling invite:', error);
        setStatus('error');
        setMessage(error?.message || 'An unexpected error occurred');
      }
    };

    handleInvite();
  }, [searchParams, router, supabase, refreshLedgers]);

  if (status === 'loading') {
    return <Loading fullScreen message="加入中..." size="lg" />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-background-light flex items-center justify-center">
      <div className="relative flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        {status === 'success' && (
          <>
            <div className="size-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-green-500 text-4xl">check_circle</span>
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-2">Success!</p>
            <p className="text-sm text-gray-600 text-center">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="size-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-2">Error</p>
            <p className="text-sm text-gray-600 text-center">{message}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<Loading fullScreen message="載入中..." size="lg" />}>
      <InvitePageContent />
    </Suspense>
  );
}

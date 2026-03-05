"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Suspense } from "react";

function LinkCallbackPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider") || "google";
  const callbackUrl = searchParams.get("callbackUrl") || "/panel/users/profile";
  const [message, setMessage] = useState("Linking your account...");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session?.user?.id) {
      // Check if the account was already linked (the OAuth provider will have linked it)
      // Just redirect back to the profile
      setMessage("Account linked successfully!");
      setTimeout(() => {
        router.push(callbackUrl);
      }, 1500);
    }
  }, [status, session, callbackUrl, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function LinkCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Linking your account...</p>
            </div>
          </div>
        </div>
      }
    >
      <LinkCallbackPageContent />
    </Suspense>
  );
}

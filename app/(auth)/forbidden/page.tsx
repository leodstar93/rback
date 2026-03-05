"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-red-600">403</h1>
        <h2 className="text-2xl font-semibold text-gray-900">
          Access Forbidden
        </h2>
        <p className="text-gray-600">
          You don't have permission to view this page. If you believe this is a
          mistake, please contact support or return to a safe page.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 transition-colors"
          >
            Go Home
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Back
          </Link>
        </div>

        <p className="text-sm text-gray-500 mt-8">
          Error Code: 403 | Forbidden
        </p>
      </div>
    </div>
  );
}

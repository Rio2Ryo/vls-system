"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/admin";
  const error = searchParams.get("error");

  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(error === "CredentialsSignin" ? "パスワードが違います" : "");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setLoading(true);
    const result = await signIn("credentials", {
      password: pw,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (result?.error) {
      setPwError("パスワードが違います");
    } else if (result?.url) {
      window.location.href = result.url;
    }
  };

  const handleSocialLogin = (provider: string) => {
    setSocialLoading(provider);
    signIn(provider, { callbackUrl });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] px-6 py-5 text-center">
            <h1 className="text-xl font-bold text-white">VLS System</h1>
            <p className="text-white/80 text-sm mt-1">管理画面ログイン</p>
          </div>

          <div className="p-6 space-y-5">
            {/* Social login buttons */}
            <div className="space-y-2.5">
              <button
                onClick={() => handleSocialLogin("google")}
                disabled={!!socialLoading}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">
                  {socialLoading === "google" ? "接続中..." : "Googleでログイン"}
                </span>
              </button>

              <button
                onClick={() => handleSocialLogin("line")}
                disabled={!!socialLoading}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 bg-[#06C755] hover:bg-[#05b54e] text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386a.63.63 0 01-.63-.629V8.108a.63.63 0 01.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 01-.63.63.625.625 0 01-.51-.262l-2.437-3.317v2.95a.63.63 0 01-1.26 0V8.108a.63.63 0 01.63-.63c.2 0 .385.095.505.254l2.437 3.33V8.108a.63.63 0 011.265 0v4.771zm-5.741 0a.63.63 0 01-1.26 0V8.108a.63.63 0 011.26 0v4.771zm-2.527.63H4.856a.63.63 0 01-.63-.63V8.108a.63.63 0 011.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.63-.629.63M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                <span className="text-sm font-medium">
                  {socialLoading === "line" ? "接続中..." : "LINEでログイン"}
                </span>
              </button>

              <button
                onClick={() => handleSocialLogin("apple")}
                disabled={!!socialLoading}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 bg-black hover:bg-gray-900 text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="white">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <span className="text-sm font-medium">
                  {socialLoading === "apple" ? "接続中..." : "Appleでログイン"}
                </span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">または</span>
              </div>
            </div>

            {/* Password login */}
            <form onSubmit={handleCredentialLogin} className="space-y-3">
              <div>
                <label htmlFor="admin-password" className="sr-only">管理パスワード</label>
                <input
                  id="admin-password"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="管理パスワード"
                  aria-label="管理パスワード"
                  data-testid="admin-password"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm text-center"
                />
              </div>
              {pwError && (
                <p className="text-red-400 text-xs text-center" role="alert" aria-live="assertive">
                  {pwError}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !pw}
                data-testid="login-button"
                className="w-full py-2.5 rounded-xl bg-[#6EC6FF] text-white text-sm font-bold hover:bg-[#5ab5ee] transition-colors disabled:opacity-50"
              >
                {loading ? "ログイン中..." : "パスワードでログイン"}
              </button>
            </form>

            {/* Forgot password link */}
            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-xs text-gray-400 hover:text-[#6EC6FF] transition-colors"
              >
                パスワードをお忘れですか？
              </Link>
            </div>

            {/* Error from OAuth callback */}
            {error && error !== "CredentialsSignin" && (
              <p className="text-red-400 text-xs text-center">
                ログインに失敗しました ({error})
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-4">
          VLS System &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </main>
  );
}

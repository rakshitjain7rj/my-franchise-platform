"use client";

/**
 * app/login/page.tsx
 *
 * A premium confectionery-styled login page for the Cake Break franchise platform.
 * Features an elegant bento card design with interactive elements and instant response feedback.
 */

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cake, Mail, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { loginCustomer } from "@/lib/auth/auth-actions";
import { useCart } from "@/lib/cart/cart-context";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function LoginPage() {
  const router = useRouter();
  const { syncCartWithSession } = useCart();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("redirect");
    if (r) {
      setRedirectTo(r);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await loginCustomer(formData);

      if (result.success) {
        // Reconcile the cart with the new session: adopt a guest cart into
        // this account, or discard one left behind by a different customer.
        await syncCartWithSession();
        // Tell Header (and any other listeners) the session is live before we
        // navigate — otherwise soft nav can leave the UI stuck on "Sign In".
        window.dispatchEvent(new Event("auth-changed"));
        router.refresh();
        router.push(redirectTo);
      } else {
        setError(result.error ?? "Invalid login credentials.");
      }
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-lavender-bg">
      <Header />
      
      <main className="flex-grow flex items-center justify-center pt-20 sm:pt-32 pb-20 md:pb-16 px-4 sm:px-6">
        <div className="w-full max-w-[480px]">
          
          {/* Brand/Welcome Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-white shadow-sm border border-outline-variant/30 mb-4">
              <Cake className="h-10 w-10 text-secondary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-deep-plum tracking-tight">
              Welcome back to Cake Break
            </h1>
            <p className="text-on-surface-variant font-body text-sm mt-2">
              Sign in to manage your orders, check out faster, and earn sweet rewards.
            </p>
          </div>

          {/* Bento-style Login Card */}
          <Card className="border border-outline-variant/50 bg-white/80 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden p-3">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold font-heading text-deep-plum">
                Customer Sign In
              </CardTitle>
              <CardDescription className="text-xs font-body text-on-surface-variant">
                Enter your registered email and password to log in.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      className="pl-10 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                      disabled={isPending}
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-bold text-secondary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      className="pl-10 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                      disabled={isPending}
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-error-container/20 border border-error/20 p-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
                    <p className="text-xs text-error font-semibold leading-relaxed">
                      {error}
                    </p>
                  </div>
                )}

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-deep-plum text-white hover:bg-deep-plum/90 active:translate-y-0.5 transition-all rounded-xl font-bold uppercase tracking-wider text-xs shadow-md shadow-deep-plum/10 flex items-center justify-center gap-2 group"
                >
                  {isPending ? (
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

              </form>

              {/* Toggle to Signup */}
              <div className="mt-6 pt-6 border-t border-outline-variant/30 text-center">
                <p className="text-xs font-body text-on-surface-variant">
                  Don&apos;t have a bakery account yet?{" "}
                  <Link
                    href={`/signup${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
                    className="font-bold text-secondary hover:underline inline-flex items-center gap-0.5"
                  >
                    Create Account
                  </Link>
                </p>
              </div>

            </CardContent>
          </Card>
          
        </div>
      </main>

      <Footer />
    </div>
  );
}

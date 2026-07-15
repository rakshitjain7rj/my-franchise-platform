"use client";

/**
 * app/signup/page.tsx
 *
 * Confectionery-themed customer registration page for the Cake Break franchise platform.
 * Form includes validation (password confirmation checking) and triggers registerCustomer Server Action.
 */

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cake, Mail, Lock, User, AlertCircle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { registerCustomer } from "@/lib/auth/auth-actions";
import { useCart } from "@/lib/cart/cart-context";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function SignupPage() {
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
    const password = formData.get("password")?.toString();
    const confirmPassword = formData.get("confirm_password")?.toString();

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    startTransition(async () => {
      const result = await registerCustomer(formData);

      if (result.success) {
        // Reconcile the cart with the new session: adopt a guest cart into
        // this account, or discard one left behind by a different customer.
        await syncCartWithSession();
        // Tell Header the session is live before soft-navigating away so the
        // signed-in avatar renders instead of the "Sign In" CTA.
        window.dispatchEvent(new Event("auth-changed"));
        router.refresh();
        router.push(redirectTo);
      } else {
        setError(result.error ?? "Could not complete registration.");
      }
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-lavender-bg">
      <Header />
      
      <main className="flex-grow flex items-center justify-center pt-32 pb-16 px-6">
        <div className="w-full max-w-[500px]">
          
          {/* Brand/Welcome Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-white shadow-sm border border-outline-variant/30 mb-4">
              <Cake className="h-10 w-10 text-secondary" />
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-deep-plum tracking-tight">
              Create Your Account
            </h1>
            <p className="text-on-surface-variant font-body text-sm mt-2">
              Join the club to save your preferences, track deliveries, and unlock special franchise rewards.
            </p>
          </div>

          {/* Bento-style Signup Card */}
          <Card className="border border-outline-variant/50 bg-white/80 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden p-3">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold font-heading text-deep-plum">
                Customer Registration
              </CardTitle>
              <CardDescription className="text-xs font-body text-on-surface-variant">
                Complete the fields below to create your account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* First and Last Name Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label htmlFor="first_name" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                      First Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                      <Input
                        id="first_name"
                        name="first_name"
                        type="text"
                        required
                        placeholder="John"
                        className="pl-9 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="last_name" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                      Last Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                      <Input
                        id="last_name"
                        name="last_name"
                        type="text"
                        required
                        placeholder="Doe"
                        className="pl-9 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                </div>

                {/* Email Field */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      className="pl-9 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                      disabled={isPending}
                    />
                  </div>
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        placeholder="••••••••"
                        className="pl-9 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="confirm_password" className="text-xs font-semibold text-deep-plum uppercase tracking-wider block">
                      Confirm
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                      <Input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        required
                        placeholder="••••••••"
                        className="pl-9 h-11 border-outline-variant focus-visible:ring-secondary/20 focus-visible:border-secondary bg-white/50"
                        disabled={isPending}
                      />
                    </div>
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
                  className="w-full h-11 bg-deep-plum text-white hover:bg-deep-plum/90 active:translate-y-0.5 transition-all rounded-xl font-bold uppercase tracking-wider text-xs shadow-md shadow-deep-plum/10 flex items-center justify-center gap-2 group mt-2"
                >
                  {isPending ? (
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Register Account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

              </form>

              {/* Toggle to Login */}
              <div className="mt-6 pt-6 border-t border-outline-variant/30 text-center">
                <p className="text-xs font-body text-on-surface-variant">
                  Already have an account?{" "}
                  <Link
                    href={`/login${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
                    className="font-bold text-secondary hover:underline inline-flex items-center gap-0.5"
                  >
                    Sign In
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

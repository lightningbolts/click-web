'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { startOAuth, type OAuthProvider } from '@/lib/auth/oauth';
import { useRouter } from 'next/navigation';

function isAtLeastYearsOld(isoDate: string, years: number): boolean {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return d <= cutoff;
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open directly in sign-up mode (default: false = sign-in mode) */
  initialIsSignup?: boolean;
}

export default function LoginModal({ isOpen, onClose, initialIsSignup = false }: LoginModalProps) {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset to the intended mode each time the modal is opened
  useEffect(() => {
    if (isOpen) {
      setIsSignup(initialIsSignup);
      setIsForgotPassword(false);
      setError('');
      setSuccess('');
    }
  }, [isOpen, initialIsSignup]);

  const handleOAuth = async (provider: OAuthProvider) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available');
        setIsLoading(false);
        return;
      }
      const { error: oauthError } = await startOAuth(supabase, {
        provider,
        origin: window.location.origin,
        next: '/dashboard',
      });
      if (oauthError) {
        setError(oauthError);
        setIsLoading(false);
      }
      // On success the browser is redirected to the provider; nothing more to do here.
    } catch (_err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password reset link sent! Check your email.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available');
        setIsLoading(false);
        return;
      }

      if (isSignup) {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }

        const fn = firstName.trim();
        const ln = lastName.trim();
        if (!fn || !ln || !birthday) {
          setError('Please enter first name, last name, and birthday.');
          setIsLoading(false);
          return;
        }
        if (!isAtLeastYearsOld(birthday, 13)) {
          setError('You must be at least 13 years old.');
          setIsLoading(false);
          return;
        }

        const display = `${fn} ${ln}`.trim();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: fn,
              last_name: ln,
              birthday,
              full_name: display,
              name: display,
            },
            // Send email auth redirects through the secure server callback route.
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          },
        });

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('unique constraint')) {
            setError('An account with this email already exists.');
          } else {
            setError(error.message);
          }
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('An account with this email already exists.');
        } else {
          setSuccess('Account created! Check your email to verify.');
          setTimeout(() => {
            onClose();
          }, 3000);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError(error.message);
        } else {
          setSuccess('Login successful!');
          setTimeout(() => {
            router.push('/dashboard');
            onClose();
          }, 500);
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="glass max-w-md w-full p-8 rounded-3xl border border-zinc-800 relative">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Header */}
              <h2 className="text-3xl font-bold mb-2">
                {isForgotPassword
                  ? 'Reset Password'
                  : isSignup
                    ? 'Create Account'
                    : 'Welcome Back'}
              </h2>
              <p className="text-zinc-400 mb-8">
                {isForgotPassword
                  ? 'Enter your email to receive a reset link'
                  : isSignup
                    ? 'Join Click and start building real connections'
                    : 'Sign in to your Click account'}
              </p>

              {/* OAuth sign-in buttons — hidden on the forgot-password pane. */}
              {!isForgotPassword && (
                <div className="space-y-3 mb-5">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => handleOAuth('google')}
                    disabled={isLoading}
                    aria-label={isSignup ? 'Continue with Google' : 'Sign in with Google'}
                    className="w-full flex items-center justify-center gap-3 py-3 bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
                      <path
                        fill="#4285F4"
                        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.209 1.125-.8427 2.0782-1.7963 2.7166v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6152z"
                      />
                      <path
                        fill="#34A853"
                        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1804l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5832-5.0359-3.7104H.957v2.3318C2.4382 15.9832 5.4818 18 9 18z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.957C.3477 6.1732 0 7.5468 0 9s.3477 2.8268.957 4.0418L3.9641 10.71z"
                      />
                      <path
                        fill="#EA4335"
                        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
                      />
                    </svg>
                    Continue with Google
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => handleOAuth('apple')}
                    disabled={isLoading}
                    aria-label={isSignup ? 'Continue with Apple' : 'Sign in with Apple'}
                    className="w-full flex items-center justify-center gap-3 py-3 bg-black text-white border border-zinc-700 hover:bg-zinc-900 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg aria-hidden="true" width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
                      <path d="M13.35 9.58c-.02-2.02 1.65-2.99 1.73-3.04-.95-1.38-2.42-1.57-2.94-1.59-1.25-.13-2.44.74-3.07.74-.64 0-1.61-.72-2.65-.7-1.36.02-2.63.8-3.33 2.02-1.42 2.46-.36 6.1 1.02 8.09.67.97 1.47 2.06 2.52 2.02 1.02-.04 1.4-.66 2.63-.66s1.57.66 2.65.64c1.1-.02 1.79-.99 2.46-1.97.78-1.12 1.09-2.22 1.11-2.28-.02-.01-2.13-.82-2.15-3.27zM11.4 3.64c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.85 2.48.9.07 1.83-.46 2.39-1.14z" />
                    </svg>
                    Continue with Apple
                  </motion.button>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-px bg-zinc-800 flex-1" />
                    <span className="text-xs uppercase tracking-wider text-zinc-500">or</span>
                    <div className="h-px bg-zinc-800 flex-1" />
                  </div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-4">
                {isSignup && !isForgotPassword && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                          First name
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                          autoComplete="given-name"
                          className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium mb-2">
                          Last name
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                          autoComplete="family-name"
                          className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="birthday" className="block text-sm font-medium mb-2">
                        Birthday
                      </label>
                      <input
                        type="date"
                        id="birthday"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                {!isForgotPassword && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="password" className="block text-sm font-medium">
                        Password
                      </label>
                      {!isSignup && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setError('');
                            setSuccess('');
                          }}
                          className="text-xs text-zinc-400 hover:text-[#8338EC] transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {isSignup && !isForgotPassword && (
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-[#8338EC]/10 border border-[#8338EC]/20 rounded-xl text-[#8338EC] text-sm">
                    {success}
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading
                    ? 'Loading...'
                    : isForgotPassword
                      ? 'Send Reset Link'
                      : isSignup
                        ? 'Create Account'
                        : 'Sign In'}
                </motion.button>
              </form>

              {/* Toggle */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    if (isForgotPassword) {
                      setIsForgotPassword(false);
                    } else {
                      setIsSignup(!isSignup);
                    }
                    setError('');
                    setSuccess('');
                  }}
                  className="text-zinc-400 hover:text-[#8338EC] transition-colors text-sm"
                >
                  {isForgotPassword
                    ? 'Back to Sign In'
                    : isSignup
                      ? 'Already have an account? Sign in'
                      : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


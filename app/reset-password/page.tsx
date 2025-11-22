'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password updated successfully! Redirecting...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass max-w-md w-full p-8 rounded-3xl border-zinc-800"
      >
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#8338EC]" />
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-2 text-center">Set New Password</h2>
        <p className="text-zinc-400 mb-8 text-center">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              New Password
            </label>
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

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              Confirm New Password
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
            {isLoading ? 'Updating...' : 'Update Password'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

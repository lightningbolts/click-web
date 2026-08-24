'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { Lock, Save } from 'lucide-react';

export default function PasswordSection() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage({ type: '', text: '' });

    const supabase = getSupabaseClient();
    if (!supabase) {
      setPasswordMessage({ type: 'error', text: 'Supabase client not initialized' });
      setPasswordLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setPasswordMessage({ type: 'error', text: error.message });
      } else {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'An unexpected error occurred' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="fc-card p-8 rounded-[16px] border border-border-hard">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#630ed4]" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Security</h3>
          <p className="text-on-surface-variant text-sm">Update your password</p>
        </div>
      </div>

      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
            placeholder="••••••••"
            minLength={6}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Confirm New Password</label>
          <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
            placeholder="••••••••"
            minLength={6}
          />
        </div>

        {passwordMessage.text && (
          <div className={`p-3 rounded-xl text-sm ${passwordMessage.type === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
            }`}>
            {passwordMessage.text}
          </div>
        )}

        <button
          type="submit"
          disabled={passwordLoading}
          className="flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {passwordLoading ? (
            'Updating...'
          ) : (
            <>
              <Save className="w-4 h-4" />
              Update Password
            </>
          )}
        </button>
      </form>
    </div>
  );
}

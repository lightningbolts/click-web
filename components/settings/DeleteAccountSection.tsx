'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DeleteAccountSection({
  profileFormDisplayName,
}: {
  profileFormDisplayName: string;
}) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const handleDeleteAccount = async () => {
    const expectedFullName = profileFormDisplayName.trim();
    if (!expectedFullName) {
      setDeleteError('Set your name in Profile Settings before deleting your account.');
      return;
    }
    if (deleteConfirmName.trim() !== expectedFullName) {
      setDeleteError('Name does not match. Type your first and last name exactly as shown to confirm deletion.');
      return;
    }

    setDeleteLoading(true);
    setDeleteError('');

    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      await signOut();
      router.push('/');
    } catch (error: any) {
      setDeleteError(error.message);
      setDeleteLoading(false);
    }
  };

  return (
    <div className="fc-card p-8 rounded-[16px] border border-red-900/30">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-red-500">Danger Zone</h3>
          <p className="text-on-surface-variant text-sm">Irreversible account actions</p>
        </div>
      </div>

      {!showDeleteConfirm ? (
        <button
          onClick={() => {
            setShowDeleteConfirm(true);
            setDeleteConfirmName('');
            setDeleteError('');
          }}
          className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl font-semibold transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button>
      ) : (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
          <h4 className="font-bold text-red-500 mb-2">Are you absolutely sure?</h4>
          <p className="text-on-surface-variant text-sm mb-4">
            This action cannot be undone. This will permanently delete your account and remove your data from our servers.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-on-surface">
              Type your name to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => {
                setDeleteConfirmName(e.target.value);
                if (deleteError) setDeleteError('');
              }}
              placeholder={profileFormDisplayName.trim() || 'Set your name in Profile Settings first'}
              className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-red-500/70 transition-colors"
              disabled={deleteLoading}
            />
            {profileFormDisplayName.trim() && (
              <p className="text-xs text-on-surface-variant mt-2">
                Must match exactly: {profileFormDisplayName.trim()}
              </p>
            )}
          </div>

          {deleteError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm">
              {deleteError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDeleteAccount}
              disabled={
                deleteLoading ||
                !profileFormDisplayName.trim() ||
                deleteConfirmName.trim() !== profileFormDisplayName.trim()
              }
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-on-surface rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteLoading}
              className="px-6 py-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

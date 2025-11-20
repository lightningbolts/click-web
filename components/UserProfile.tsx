'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, MapPin, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function UserProfile() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  if (!user) return null;

  // Get initials from email
  const initials = user.email?.substring(0, 2).toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#8338EC] to-purple-600 flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <span className="text-sm hidden md:inline">{user.email}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 glass rounded-2xl border-zinc-800 overflow-hidden shadow-xl z-50"
          >
            <div className="p-4 border-b border-zinc-800">
              <p className="text-sm font-semibold">{user.email}</p>
              <p className="text-xs text-zinc-500 mt-1">Signed in</p>
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  router.push('/dashboard');
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left"
              >
                <MessageCircle className="w-4 h-4 text-[#8338EC]" />
                <span className="text-sm">My Chats</span>
              </button>

              <button
                onClick={() => {
                  router.push('/dashboard');
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left"
              >
                <MapPin className="w-4 h-4 text-[#8338EC]" />
                <span className="text-sm">Connection Map</span>
              </button>
            </div>

            <div className="p-2 border-t border-zinc-800">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


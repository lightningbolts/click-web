'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, MapPin, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { createPortal } from 'react-dom';

export default function UserProfile() {
  const { user, signOut, profileImageUrl } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Create a dedicated portal root element at the very end of body
  useEffect(() => {
    let root = document.getElementById('user-profile-portal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'user-profile-portal-root';
      root.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647;';
      document.body.appendChild(root);
    }
    setPortalRoot(root);
    
    return () => {
      // Don't remove on unmount - other instances might use it
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 256;
      const left = Math.min(
        Math.max(rect.right - menuWidth, 8),
        window.innerWidth - menuWidth - 8
      );
      const top = rect.bottom + 8;
      setMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

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
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#8338EC] to-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
          {profileImageUrl ? (
            <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <span className="text-xs md:text-sm hidden md:inline truncate max-w-[100px] lg:max-w-[150px]">{user.email}</span>
      </button>

      {portalRoot && createPortal(
        <AnimatePresence>
          {isOpen && menuPosition && (
            <>
              {/* Backdrop to catch clicks */}
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  pointerEvents: 'auto',
                }}
                onClick={() => setIsOpen(false)}
              />
              {/* Menu - using opacity animation only, no transforms */}
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                style={{
                  position: 'fixed',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: 256,
                  pointerEvents: 'auto',
                  backgroundColor: 'rgba(24, 24, 27, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(63, 63, 70, 0.5)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div className="p-4 border-b border-zinc-800">
                  <p className="text-sm font-semibold text-white">{user.email}</p>
                  <p className="text-xs text-zinc-500 mt-1">Signed in</p>
                </div>

                <div className="p-2">
                  <button
                    onClick={() => {
                      router.push('/dashboard');
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left text-white"
                  >
                    <MessageCircle className="w-4 h-4 text-[#8338EC]" />
                    <span className="text-sm">My Chats</span>
                  </button>

                  <button
                    onClick={() => {
                      router.push('/dashboard');
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left text-white"
                  >
                    <MapPin className="w-4 h-4 text-[#8338EC]" />
                    <span className="text-sm">Connection Map</span>
                  </button>
                </div>

                <div className="p-2 border-t border-zinc-800">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-left text-white"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Sign Out</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        portalRoot
      )}
    </div>
  );
}


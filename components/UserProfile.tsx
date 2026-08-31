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

    let raf = 0;
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

    const schedulePosition = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updatePosition();
      });
    };

    updatePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      if (raf !== 0) cancelAnimationFrame(raf);
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
        className="flex items-center gap-1 md:gap-2 rounded-[8px] border border-border-hard bg-surface px-2 py-2 text-on-surface transition-colors hover:bg-surface-container md:px-4"
      >
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-hard bg-primary text-xs font-bold text-on-primary">
          {profileImageUrl ? (
            <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <span className="hidden max-w-[100px] truncate text-xs font-semibold md:inline md:text-sm lg:max-w-[150px]">{user.email}</span>
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
                className="fc-card overflow-hidden text-on-surface"
                style={{
                  position: 'fixed',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: 256,
                  pointerEvents: 'auto',
                  backgroundColor: 'var(--color-surface)',
                }}
              >
                <div className="border-b border-border-hard p-4">
                  <p className="text-sm font-bold text-on-surface">{user.email}</p>
                  <p className="mt-1 text-xs font-medium text-on-surface-variant">Signed in</p>
                </div>

                <div className="p-2">
                  <button
                    onClick={() => {
                      router.push('/dashboard');
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <MessageCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">My Chats</span>
                  </button>

                  <button
                    onClick={() => {
                      router.push('/dashboard');
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Connection Map</span>
                  </button>
                </div>

                <div className="border-t border-border-hard p-2">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-on-surface transition-colors hover:bg-surface-container hover:text-error"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="text-sm font-semibold">Sign Out</span>
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


'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import UserProfile from '@/components/UserProfile';
import { useState } from 'react';
import LoginModal from '@/components/LoginModal';
import { usePathname, useRouter } from 'next/navigation';
import { User, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/dashboard';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <>
      <nav className={`relative z-10 flex items-center justify-between px-4 md:px-12 py-6 gap-2 ${isDashboard ? 'border-b border-zinc-800' : ''}`}>
        <Link href="/" className="text-xl md:text-2xl font-bold flex-shrink-0">
          <span className="text-[#8338EC]">C</span>lick
        </Link>
        <div className="flex items-center gap-2 md:gap-6">
          {isDashboard ? (
            <>
              <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-400">
                <User className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                <span className="truncate max-w-[100px] md:max-w-[200px]">{user?.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-red-500 hover:text-red-500 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  const missionSection = document.getElementById('mission');
                  if (missionSection) {
                    missionSection.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    window.location.href = '/#mission';
                  }
                }}
                className="text-xs md:text-sm hover:text-[#8338EC] transition-colors"
              >
                Mission
              </button>
              <Link href="/about" className="text-xs md:text-sm hover:text-[#8338EC] transition-colors">
                About
              </Link>
              {user ? (
                <UserProfile />
              ) : (
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="text-xs md:text-sm px-3 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] transition-colors"
                >
                  Login
                </button>
              )}
            </>
          )}
        </div>
      </nav>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}


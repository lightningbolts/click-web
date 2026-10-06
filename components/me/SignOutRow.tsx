'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { ListRow } from '@/components/ds/ListGroup';
import { useAuth } from '@/lib/AuthContext';

export function SignOutRow() {
  const router = useRouter();
  const { signOut } = useAuth();
  return (
    <ListRow
      icon={LogOut}
      title="Sign out"
      onClick={async () => {
        try {
          await signOut();
        } finally {
          router.push('/');
          router.refresh();
        }
      }}
    />
  );
}

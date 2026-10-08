'use client';

import { useRouter } from 'next/navigation';
import { HelpCircle, LogOut, Monitor, Moon, Settings, Store, Sun, Ticket, User } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ds/Menu';
import { useAuth } from '@/lib/AuthContext';
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';

/** Avatar 32 → account menu (spec §6.1). */
export function AccountMenu({ bootstrap }: { bootstrap: SessionBootstrap }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const { viewer, managesPlaces } = bootstrap;

  const onSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <Menu>
      <MenuTrigger
        className="press hit-44 relative rounded-full outline-offset-2"
        aria-label="Account"
        data-testid="nav-account"
      >
        <Avatar seed={viewer.id} name={viewer.name} src={viewer.avatarUrl} size={32} />
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel className="px-2.5 pb-2 pt-1.5">
          <span className="type-body-strong block truncate text-fg">{viewer.name}</span>
          {viewer.email ? <span className="type-meta block truncate text-fg-tertiary">{viewer.email}</span> : null}
        </MenuLabel>
        <MenuSeparator />
        <MenuItem icon={User} onSelect={() => router.push('/me')}>
          Profile
        </MenuItem>
        {bootstrap.ticketing ? (
          <MenuItem icon={Ticket} onSelect={() => router.push('/tickets')}>
            Tickets
          </MenuItem>
        ) : null}
        <MenuItem icon={Settings} onSelect={() => router.push('/settings')}>
          Settings
        </MenuItem>
        <MenuItem
          icon={Store}
          onSelect={() => router.push(managesPlaces ? '/business/places' : '/business/get-started')}
        >
          {managesPlaces ? 'Your Places' : 'Set up a Place'}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger icon={preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor}>
            Appearance
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
              <MenuRadioItem value="system">System</MenuRadioItem>
              <MenuRadioItem value="light">Light</MenuRadioItem>
              <MenuRadioItem value="dark">Dark</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        <MenuItem icon={HelpCircle} onSelect={() => router.push('/about')}>
          Help
        </MenuItem>
        <MenuItem icon={LogOut} onSelect={() => void onSignOut()} data-testid="nav-sign-out">
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

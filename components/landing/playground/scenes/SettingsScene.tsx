'use client';

import { Bell, Lock, User } from 'lucide-react';
import { DEMO_USER_NAME } from '../mockData';

export default function SettingsScene() {
  return (
    <div className="flex h-full flex-col overflow-auto bg-bg" data-testid="playground-scene-settings">
      <div className="border-b border-hairline px-4 py-3">
        <h3 className="text-lg font-bold text-fg">Settings</h3>
        <p className="text-xs text-fg-secondary">Account, privacy, and notifications</p>
      </div>
      <ul className="space-y-2 p-3">
        <li className="rounded-[12px] border border-hairline bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-semibold text-fg">Profile</p>
              <p className="text-xs text-fg-secondary">{DEMO_USER_NAME}</p>
            </div>
          </div>
        </li>
        <li className="rounded-[12px] border border-hairline bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-semibold text-fg">Notifications</p>
              <p className="text-xs text-fg-secondary">Chat, calls, and nearby Clicks</p>
            </div>
          </div>
        </li>
        <li className="rounded-[12px] border border-hairline bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-semibold text-fg">Privacy</p>
              <p className="text-xs text-fg-secondary">Ghost mode, blocked accounts</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}

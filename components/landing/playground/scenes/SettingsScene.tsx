'use client';

import { Bell, Lock, User } from 'lucide-react';
import { DEMO_USER_NAME } from '../mockData';

export default function SettingsScene() {
  return (
    <div className="flex h-full flex-col overflow-auto bg-background" data-testid="playground-scene-settings">
      <div className="border-b border-border-hard px-4 py-3">
        <h3 className="text-lg font-bold text-on-surface">Settings</h3>
        <p className="text-xs text-on-surface-variant">Account, privacy, and notifications</p>
      </div>
      <ul className="space-y-2 p-3">
        <li className="rounded-[12px] border border-border-hard bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Profile</p>
              <p className="text-xs text-on-surface-variant">{DEMO_USER_NAME}</p>
            </div>
          </div>
        </li>
        <li className="rounded-[12px] border border-border-hard bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Notifications</p>
              <p className="text-xs text-on-surface-variant">Chat, calls, and nearby Clicks</p>
            </div>
          </div>
        </li>
        <li className="rounded-[12px] border border-border-hard bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Privacy</p>
              <p className="text-xs text-on-surface-variant">Ghost mode, blocked accounts</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}

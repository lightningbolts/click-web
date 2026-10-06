'use client';

import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type ShellHeader = {
  /** Mobile top-bar title on pushed pages (spec §6.2). */
  title: string;
  /** Back chevron target; omitted → router.back(). */
  backHref?: string;
  /** Hide the mobile tab bar while this page is mounted (thread, creation form, camera). */
  hideTabBar?: boolean;
};

type Ctx = { header: ShellHeader | null; setHeader: (h: ShellHeader | null) => void };

const ShellContext = createContext<Ctx>({ header: null, setHeader: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<ShellHeader | null>(null);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShellHeader(): ShellHeader | null {
  return useContext(ShellContext).header;
}

/**
 * Declares this page as pushed: the mobile top bar shows a back chevron and `title` instead of
 * the logo. Render it anywhere in the page; it renders nothing itself.
 */
export function PushedPage({ title, backHref, hideTabBar }: ShellHeader) {
  const { setHeader } = useContext(ShellContext);
  useLayoutEffect(() => {
    setHeader({ title, backHref, hideTabBar });
    return () => setHeader(null);
  }, [setHeader, title, backHref, hideTabBar]);
  return null;
}

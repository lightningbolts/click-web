'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

const ProductChromeContext = createContext(false);
const SetProductChromeContext = createContext<(active: boolean) => void>(() => {});

/**
 * True while a signed-in product surface is mounted.
 * Footer reads this so marketing footer cannot stack on dashboard/event pages,
 * including the gap after sign-out before `router.refresh()` swaps the page.
 */
export function ProductChromeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <SetProductChromeContext.Provider value={setActive}>
      <ProductChromeContext.Provider value={active}>{children}</ProductChromeContext.Provider>
    </SetProductChromeContext.Provider>
  );
}

export function useProductChrome(): boolean {
  return useContext(ProductChromeContext);
}

/** Register product chrome for the lifetime of the nearest signed-in tree. */
export function ProductChromeOn() {
  const setActive = useContext(SetProductChromeContext);
  useLayoutEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);
  return null;
}

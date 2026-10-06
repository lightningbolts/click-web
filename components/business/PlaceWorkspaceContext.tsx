'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ManagerPlace } from '@/lib/server/places/serialize';

export type WorkspacePlace = ManagerPlace & { entitled: boolean };

type Ctx = { place: WorkspacePlace; places: WorkspacePlace[] };

const PlaceWorkspace = createContext<Ctx | null>(null);

/** Serializable workspace state from the server guard (spec §9.3). */
export function PlaceWorkspaceProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <PlaceWorkspace.Provider value={value}>{children}</PlaceWorkspace.Provider>;
}

export function usePlaceWorkspace(): Ctx {
  const ctx = useContext(PlaceWorkspace);
  if (!ctx) throw new Error('usePlaceWorkspace outside a Place workspace');
  return ctx;
}

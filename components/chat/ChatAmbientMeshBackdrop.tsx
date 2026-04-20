'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { deriveAmbientMeshCss } from '@/lib/chat/chatAmbientMesh';

/**
 * Non-interactive ambient tint behind chat chrome. Does not alter header,
 * bubbles, or composer layout — only adds absolute layers under existing content.
 */
export function ChatAmbientMeshBackdrop({
  connection,
  isGroupClique,
}: {
  connection: ConnectionRecord;
  isGroupClique: boolean;
}) {
  const { c1, c2, c3 } = useMemo(
    () => deriveAmbientMeshCss(connection, isGroupClique),
    [connection, isGroupClique],
  );

  const baseBg = useMemo(
    () =>
      `radial-gradient(ellipse 85% 70% at 32% 28%, ${c1} 0%, transparent 62%), radial-gradient(ellipse 75% 60% at 78% 72%, ${c2} 0%, transparent 58%), radial-gradient(ellipse 55% 45% at 50% 100%, ${c3} 0%, transparent 55%)`,
    [c1, c2, c3],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: baseBg,
        }}
      />
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 70% 55% at 70% 30%, ${c2} 0%, transparent 55%)`,
          mixBlendMode: 'screen',
        }}
        animate={{ opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear', repeatType: 'mirror' }}
      />
    </div>
  );
}

/** Browser E2EE recovery is enabled after production vault migration; set false to roll back. */
export const HISTORY_RECOVERY_ENABLED = process.env.NEXT_PUBLIC_E2EE_RECOVERY_ENABLED !== 'false';

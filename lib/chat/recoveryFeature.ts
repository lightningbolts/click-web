/** Roll out credential-based E2EE recovery only after browser interoperability and security QA. */
export const HISTORY_RECOVERY_ENABLED = process.env.NEXT_PUBLIC_E2EE_RECOVERY_ENABLED === 'true';

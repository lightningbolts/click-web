/** What the signed-in shell needs before first paint (spec §11.4.5). Safe to send to the client. */
export type SessionBootstrap = {
  viewer: { id: string; name: string; email: string | null; avatarUrl: string | null };
  unreadTotal: number;
  hasActivity: boolean;
  managesPlaces: boolean;
  /** Ticketing is switched on (`TICKETING_ENABLED`): show the ticket wallet entry points. */
  ticketing: boolean;
};

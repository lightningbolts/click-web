/**
 * Junction tables for per-user connection visibility (not `connections.status`).
 */

export type ConnectionArchiveRow = {
  id: string;
  user_id: string;
  connection_id: string;
  archived_at: string;
};

export type ConnectionHiddenRow = {
  id: string;
  user_id: string;
  connection_id: string;
  hidden_at: string;
};

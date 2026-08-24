'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Group header metadata (name, creator, member labels) and the peer's shared
 * interest tags. Extracted verbatim from ChatView.
 */
export function useChatConnectionMeta({
  isGroupClique,
  connection,
  otherUserName,
  peerUserId,
  getAuthHeaders,
}: {
  isGroupClique: boolean;
  connection: ConnectionRecord;
  otherUserName: string;
  peerUserId: string | undefined;
  getAuthHeaders: () => Promise<HeadersInit>;
}) {
  const [groupHeaderSubtitle, setGroupHeaderSubtitle] = useState<string | null>(null);
  const [groupCreatorId, setGroupCreatorId] = useState<string | null>(null);
  const [displayGroupName, setDisplayGroupName] = useState<string | null>(null);
  const [groupMemberProfileRows, setGroupMemberProfileRows] = useState<{ userId: string; label: string }[]>([]);
  const [sharedInterestTags, setSharedInterestTags] = useState<string[]>([]);

  useEffect(() => {
    if (!isGroupClique) {
      setGroupHeaderSubtitle(null);
      setGroupCreatorId(null);
      setDisplayGroupName(null);
      setGroupMemberProfileRows([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: g, error: ge } = await supabase
          .from('groups')
          .select('name, created_by')
          .eq('id', connection.id)
          .maybeSingle();
        if (ge || !g || cancelled) return;
        const nm = typeof g.name === 'string' ? g.name.trim() : '';
        if (!cancelled) {
          setDisplayGroupName(nm || otherUserName);
          setGroupCreatorId(
            (typeof g.created_by === 'string' ? g.created_by : null) ??
              connection.groupCreatedByUserId ??
              null,
          );
        }
        const { data: mems } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', connection.id);
        const ids = (mems ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean);
        if (ids.length === 0 || cancelled) return;
        type UserMini = { id: string; name?: string | null; first_name?: string | null };
        let usersData: UserMini[] | null = null;
        const r1 = await supabase.from('users').select('id, name, full_name, first_name, last_name').in('id', ids);
        if (!r1.error && r1.data) {
          usersData = r1.data as UserMini[];
        } else {
          const r2 = await supabase.from('users').select('id, name').in('id', ids);
          if (!r2.error && r2.data) usersData = r2.data as UserMini[];
        }
        const labelFor = (u: { first_name?: string | null; name?: string | null }) => {
          const fn = u.first_name?.trim();
          if (fn) return fn;
          const n = u.name?.trim();
          if (n) return n.split(/\s+/)[0] ?? n;
          return 'Member';
        };
        const byId = new Map((usersData ?? []).map((u) => [u.id, labelFor(u)]));
        const labels = ids
          .slice()
          .sort()
          .map((id) => byId.get(id) ?? 'Member');
        const profileRows = ids
          .slice()
          .sort()
          .map((id) => ({ userId: id, label: byId.get(id) ?? 'Member' }));
        if (!cancelled) {
          setGroupHeaderSubtitle(`${ids.length} Members: ${labels.join(', ')}`);
          setGroupMemberProfileRows(profileRows);
        }
      } catch {
        if (!cancelled) {
          setGroupHeaderSubtitle(null);
          setGroupMemberProfileRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGroupClique, connection.id, connection.groupCreatedByUserId, otherUserName]);

  useEffect(() => {
    if (!peerUserId) {
      setSharedInterestTags([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/users/${encodeURIComponent(peerUserId)}/profile`,
          { headers },
        );
        const json = (await res.json().catch(() => ({}))) as {
          sharedInterestTags?: unknown;
        };
        if (!res.ok || cancelled) return;
        const raw = json.sharedInterestTags;
        const tags = Array.isArray(raw)
          ? raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          : [];
        if (!cancelled) setSharedInterestTags(tags);
      } catch {
        if (!cancelled) setSharedInterestTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, peerUserId]);

  return {
    groupHeaderSubtitle,
    groupCreatorId,
    displayGroupName,
    setDisplayGroupName,
    groupMemberProfileRows,
    sharedInterestTags,
  };
}

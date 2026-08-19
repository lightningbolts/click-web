'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { memberSetKeySorted } from '@/components/chat';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Verified-clique (group click) rows for the chat list, the member-set keys
 * that block duplicate clique creation, and the member picker. Extracted
 * verbatim from DashboardView.
 */
export function useVerifiedCliques({
  user,
  groupClicksReloadNonce,
}: {
  user: any;
  groupClicksReloadNonce: number;
}) {
  const [groupCliqueRecords, setGroupCliqueRecords] = useState<ConnectionRecord[]>([]);
  const [verifiedClickMemberSetKeys, setVerifiedClickMemberSetKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupMemberPickerRows, setGroupMemberPickerRows] = useState<{ userId: string; label: string }[]>([]);
  const [showGroupMemberPicker, setShowGroupMemberPicker] = useState(false);
  const [groupMemberPickerBusy, setGroupMemberPickerBusy] = useState(false);
  /** Verified clique rows keyed by `chats.id` (group message realtime + previews). */
  const groupRecordByChatIdRef = useRef<Map<string, ConnectionRecord>>(new Map());

  useEffect(() => {
    groupRecordByChatIdRef.current = new Map(
      groupCliqueRecords
        .filter((r) => typeof r.groupChatId === 'string' && r.groupChatId.length > 0)
        .map((r) => [r.groupChatId as string, r]),
    );
  }, [groupCliqueRecords]);

  useEffect(() => {
    if (!user?.id) {
      setGroupCliqueRecords([]);
      setVerifiedClickMemberSetKeys(new Set());
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setGroupCliqueRecords([]);
      setVerifiedClickMemberSetKeys(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: memberships, error: memErr } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id);
        if (memErr || cancelled) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const groupIds = [...new Set((memberships ?? []).map((m: { group_id: string }) => m.group_id))];
        if (groupIds.length === 0) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const [
          { data: chats, error: chatErr },
          { data: groups, error: groupErr },
          { data: allMembers, error: membersKeyErr },
        ] = await Promise.all([
          supabase.from('chats').select('id, group_id, updated_at').in('group_id', groupIds),
          supabase.from('groups').select('id, name, created_by').in('id', groupIds),
          supabase.from('group_members').select('group_id, user_id').in('group_id', groupIds),
        ]);
        if (chatErr || groupErr || cancelled) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const byGroup = new Map<string, string[]>();
        if (!membersKeyErr && allMembers?.length) {
          for (const row of allMembers as { group_id: string; user_id: string }[]) {
            if (!row.group_id || !row.user_id) continue;
            const arr = byGroup.get(row.group_id) ?? [];
            arr.push(row.user_id);
            byGroup.set(row.group_id, arr);
          }
        }
        const memberKeys = new Set<string>();
        for (const gid of groupIds) {
          const ids = byGroup.get(gid);
          if (ids?.length) {
            memberKeys.add(memberSetKeySorted(ids));
          }
        }
        const groupMetaById = new Map(
          (groups ?? []).map((g: { id: string; name: string; created_by?: string }) => [
            g.id,
            { name: g.name, createdBy: g.created_by as string | undefined },
          ]),
        );
        const rows: ConnectionRecord[] = (chats ?? [])
          .filter((c: { group_id: string | null }) => c.group_id)
          .map((c: { id: string; group_id: string; updated_at: number | null }) => {
            const gid = c.group_id as string;
            const meta = groupMetaById.get(gid) as { name: string; createdBy?: string } | undefined;
            const title = meta?.name?.trim() || 'Click';
            const memberIds = (byGroup.get(gid) ?? []).slice().sort();
            return {
              id: gid,
              chatKind: 'group_clique' as const,
              groupChatId: c.id,
              groupCreatedByUserId: meta?.createdBy,
              userIds: memberIds,
              name: title,
              dateMet: new Date(),
              location: 'Verified click',
              status: 'active',
            };
          });
        if (!cancelled) {
          setGroupCliqueRecords(rows);
          setVerifiedClickMemberSetKeys(memberKeys);
        }
      } catch {
        if (!cancelled) {
          setGroupCliqueRecords([]);
          setVerifiedClickMemberSetKeys(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, groupClicksReloadNonce]);

  const openVerifiedCliqueMemberPicker = useCallback(async (memberUserIds: string[]) => {
    const ids = [...new Set(memberUserIds)].filter(Boolean).sort();
    if (ids.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setGroupMemberPickerBusy(true);
    try {
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
      const rows = ids.map((id) => ({ userId: id, label: byId.get(id) ?? 'Member' }));
      setGroupMemberPickerRows(rows);
      setShowGroupMemberPicker(true);
    } finally {
      setGroupMemberPickerBusy(false);
    }
  }, []);

  return {
    groupCliqueRecords,
    verifiedClickMemberSetKeys,
    groupMemberPickerRows,
    showGroupMemberPicker,
    setShowGroupMemberPicker,
    groupMemberPickerBusy,
    openVerifiedCliqueMemberPicker,
  };
}

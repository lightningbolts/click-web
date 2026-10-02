import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { safetyBlockBodySchema } from '@/lib/api/schemas/connections';

/**
 * List the caller's blocked users, newest first.
 * GET → { blocks: [{ blocked_id, blocked_at }] }
 * Display names/avatars are resolved by clients via POST /api/users/display-names.
 */
export async function GET(request: NextRequest) {
    try {
        // Bearer-aware: mobile clients send `Authorization: Bearer`, and RLS on user_blocks
        // (blocker_id = auth.uid()) needs the user's JWT on the query, not just a cookie check.
        const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('user_blocks')
            .select('blocked_id, created_at')
            .eq('blocker_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('List blocks error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const blocks = (data ?? []).map((row: { blocked_id: string; created_at: string | null }) => ({
            blocked_id: row.blocked_id,
            blocked_at: row.created_at,
        }));
        return NextResponse.json({ blocks });
    } catch (error) {
        console.error('List blocks API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Block a user.
 * POST { blocked_id: string }
 */
export async function POST(request: NextRequest) {
    try {
        const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = await parseBody(request, safetyBlockBodySchema);
        if (!parsed.ok) return parsed.response;
        const { blocked_id } = parsed.data;

        const { error } = await supabase
            .from('user_blocks')
            .insert({
                blocker_id: user.id,
                blocked_id,
            });

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ success: true, message: 'User already blocked' });
            }
            console.error('Block error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'User blocked' });
    } catch (error) {
        console.error('Block API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const blocked_id = request.nextUrl.searchParams.get('blocked_id');
        if (!blocked_id) {
            return NextResponse.json({ error: 'blocked_id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('user_blocks')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', blocked_id);

        if (error) {
            console.error('Unblock error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'User unblocked' });
    } catch (error) {
        console.error('Unblock API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

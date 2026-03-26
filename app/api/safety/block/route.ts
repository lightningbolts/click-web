import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function resolveAuthenticatedUser(
    request: NextRequest,
    supabase: ReturnType<typeof createServerClient>
) {
    const cookieAuth = await supabase.auth.getUser();
    if (cookieAuth.data.user && !cookieAuth.error) {
        return { user: cookieAuth.data.user, error: null };
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
        return { user: null, error: cookieAuth.error };
    }

    const tokenAuth = await supabase.auth.getUser(token);
    return { user: tokenAuth.data.user, error: tokenAuth.error };
}

/**
 * Block a user.
 * POST { blocked_id: string }
 */
export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    },
                },
            }
        );

        const { user, error: authError } = await resolveAuthenticatedUser(request, supabase);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { blocked_id } = await request.json();
        if (!blocked_id) {
            return NextResponse.json({ error: 'blocked_id is required' }, { status: 400 });
        }

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
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    },
                },
            }
        );

        const { user, error: authError } = await resolveAuthenticatedUser(request, supabase);
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

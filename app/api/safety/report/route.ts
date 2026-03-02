import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Report a connection.
 * POST { connection_id: string, reason: string }
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

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { connection_id, reason } = await request.json();
        if (!connection_id || !reason) {
            return NextResponse.json(
                { error: 'connection_id and reason are required' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('connection_reports')
            .insert({
                connection_id,
                reporter_id: user.id,
                reason,
            });

        if (error) {
            console.error('Report error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Report submitted' });
    } catch (error) {
        console.error('Report API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

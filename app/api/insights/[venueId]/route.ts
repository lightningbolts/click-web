import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';

/**
 * Insights API — returns anonymized, aggregated analytics for a venue.
 * No user IDs, emails, or names are ever exposed.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ venueId: string }> }
) {
    try {
        const { venueId } = await params;

        const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await userMayAccessBusinessInsights(supabase, user))) {
            return NextResponse.json(
                { error: 'Forbidden: Requires verified_business role' },
                { status: 403 },
            );
        }

        // Venue ownership check
        const { data: venue, error: venueError } = await supabase
            .from('claimed_venues')
            .select('*')
            .eq('id', venueId)
            .eq('owner_user_id', user.id)
            .single();

        if (venueError || !venue) {
            return NextResponse.json(
                { error: 'Venue not found or not authorized', status: 'unauthorized' },
                { status: 403 }
            );
        }

        const venueName = venue.venue_name;
        const semanticLocation = venue.semantic_location || venueName;

        // Query connections for this venue (anonymized aggregation only)
        const { data: connections, error: connError } = await supabase
            .from('connections')
            .select('created, expiry_state, last_message_at')
            .eq('semantic_location', semanticLocation)
            .eq('include_in_business_insights', true);

        if (connError) {
            console.error('Error fetching connections:', connError.message);
            return NextResponse.json({ error: connError.message }, { status: 500 });
        }

        const rows = connections || [];
        const totalConnections = rows.length;

        // Daily data (last 30 days)
        const thirtyDaysAgo = Date.now() - 30 * 86400000;
        const dailyMap = new Map<string, number>();
        const hourlyDistribution = new Array(24).fill(0);
        let keptCount = 0;

        for (const row of rows) {
            const ts = typeof row.created === 'number' ? row.created : 0;
            const date = new Date(ts);
            const dateStr = date.toISOString().split('T')[0];
            const hour = date.getHours();

            hourlyDistribution[hour]++;

            if (ts > thirtyDaysAgo) {
                dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + 1);
            }

            if (row.expiry_state === 'kept') keptCount++;
        }

        const dailyData = Array.from(dailyMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
        const retentionRate = totalConnections > 0
            ? (keptCount / totalConnections * 100).toFixed(1) + '%'
            : '0%';

        // Find busiest day of week
        const dayOfWeekCounts = new Array(7).fill(0);
        for (const row of rows) {
            const ts = typeof row.created === 'number' ? row.created : 0;
            dayOfWeekCounts[new Date(ts).getDay()]++;
        }
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const busiestDay = dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];

        // Top interest tags among connected users at this venue
        const { data: tagData } = await supabase
            .rpc('get_venue_top_tags', { venue_location: semanticLocation })
            .limit(10);

        return NextResponse.json({
            venueName,
            totalConnections,
            hourlyDistribution,
            dailyData,
            peakHour,
            retentionRate,
            busiestDay,
            keptRatio: totalConnections > 0 ? +(keptCount / totalConnections).toFixed(2) : 0,
            topTags: tagData || [],
            status: 'success',
        });
    } catch (error) {
        console.error('Insights API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

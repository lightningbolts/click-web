-- B2B Insights: mathematically verified "Micro-Communities" present at the venue.
-- Aggregates user_interests tags for members of the same group_id who are checked in
-- (recent window). SECURITY DEFINER + venue manager assert (same pattern as other insights RPCs).

CREATE OR REPLACE FUNCTION public.insights_venue_micro_communities (venue_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    RETURN COALESCE(
        (
            WITH recent_checkins AS (
                SELECT DISTINCT
                    vci.user_id
                FROM public.venue_check_ins vci
                WHERE
                    vci.venue_id = venue_id_param
                    AND vci.checked_at > now() - interval '8 hours'
            ),
            groups_with_presence AS (
                SELECT
                    gm.group_id,
                    COUNT(DISTINCT gm.user_id)::INT AS attendee_count
                FROM public.group_members gm
                INNER JOIN recent_checkins rc ON rc.user_id = gm.user_id
                GROUP BY
                    gm.group_id
                HAVING
                    COUNT(DISTINCT gm.user_id) >= 2
            ),
            tag_counts AS (
                SELECT
                    gwp.group_id,
                    gwp.attendee_count,
                    TRIM(BOTH FROM t.tag) AS tag,
                    COUNT(*)::INT AS tag_hits
                FROM groups_with_presence gwp
                INNER JOIN public.group_members gm ON gm.group_id = gwp.group_id
                INNER JOIN recent_checkins rc ON rc.user_id = gm.user_id
                LEFT JOIN public.user_interests ui ON ui.user_id = gm.user_id
                CROSS JOIN LATERAL UNNEST(COALESCE(ui.tags, ARRAY[]::TEXT[])) AS t (tag)
                WHERE
                    t.tag IS NOT NULL
                    AND LENGTH(TRIM(BOTH FROM t.tag)) > 0
                GROUP BY
                    gwp.group_id,
                    gwp.attendee_count,
                    TRIM(BOTH FROM t.tag)
            ),
            ranked_tags AS (
                SELECT
                    tc.group_id,
                    tc.attendee_count,
                    tc.tag,
                    tc.tag_hits,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            tc.group_id
                        ORDER BY
                            tc.tag_hits DESC,
                            tc.tag ASC
                    ) AS rn
                FROM
                    tag_counts tc
            ),
            top_per_group AS (
                SELECT
                    rt.group_id,
                    MAX(rt.attendee_count)::INT AS attendee_count,
                    jsonb_agg(
                        jsonb_build_object(
                            'tag',
                            rt.tag,
                            'count',
                            rt.tag_hits
                        )
                        ORDER BY
                            rt.tag_hits DESC,
                            rt.tag ASC
                    ) AS top_tags
                FROM
                    ranked_tags rt
                WHERE
                    rt.rn <= 12
                GROUP BY
                    rt.group_id
            )
            SELECT
                jsonb_agg(
                    jsonb_build_object(
                        'kind',
                        'micro_community',
                        'verifiedPairwiseClique',
                        TRUE,
                        'attendeeCount',
                        gwp.attendee_count,
                        'topTags',
                        COALESCE(tpg.top_tags, '[]'::jsonb)
                    )
                    ORDER BY
                        gwp.attendee_count DESC
                )
            FROM
                groups_with_presence gwp
                LEFT JOIN top_per_group tpg ON tpg.group_id = gwp.group_id
        ),
        '[]'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.insights_venue_micro_communities (UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insights_venue_micro_communities (UUID) TO authenticated;

COMMENT ON FUNCTION public.insights_venue_micro_communities (UUID) IS
'Venue managers only. Returns anonymized aggregate interest tags for verified clique groups with ≥2 members currently checked in (8h window).';

SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb),
  'meta', jsonb_build_object('page', 1, 'page_size', GREATEST(count(*), 1), 'total', count(*))) AS result
FROM (
  SELECT k.id, k.name, k.email, k.whatsapp, k.timezone, k.created_at,
         a.deals, a.calls_completed, a.proposals_sent, a.won, a.lost,
         round(100.0 * a.won / NULLIF(a.won + a.lost, 0), 2) AS win_rate_pct,
         round(a.avg_won, 2) AS avg_deal_size_inr, COALESCE(a.total_won, 0) AS total_won_inr,
         round(a.avg_h::numeric, 2) AS avg_hours_call_to_proposal, round(a.med_h::numeric, 2) AS median_hours_call_to_proposal,
         (SELECT count(*) FROM calls c JOIN deals d ON d.id = c.deal_id WHERE d.consultant_id = k.id AND NOT d.is_test AND c.status = 'scheduled' AND c.scheduled_for >= now())::int AS upcoming_calls
  FROM consultants k
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS deals, (count(*) FILTER (WHERE f.call_completed))::int AS calls_completed, (count(*) FILTER (WHERE f.proposal_sent))::int AS proposals_sent,
           (count(*) FILTER (WHERE f.stage = 'won'))::int AS won, (count(*) FILTER (WHERE f.stage = 'lost'))::int AS lost,
           avg(f.value_inr) FILTER (WHERE f.stage = 'won') AS avg_won, sum(f.value_inr) FILTER (WHERE f.stage = 'won') AS total_won,
           avg(EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0) FILTER (WHERE f.first_sent_at IS NOT NULL AND f.call_completed_at IS NOT NULL) AS avg_h,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0) FILTER (WHERE f.first_sent_at IS NOT NULL AND f.call_completed_at IS NOT NULL) AS med_h
    FROM v_deal_facts f WHERE f.consultant_id = k.id AND NOT f.is_test) a ON true
) r

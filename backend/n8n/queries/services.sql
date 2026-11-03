SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb),
  'meta', jsonb_build_object('page', 1, 'page_size', GREATEST(count(*), 1), 'total', count(*))) AS result
FROM (
  SELECT s.id, s.name, s.service_type, s.base_price_inr, s.proposal_template_doc_id, s.active, s.created_at, s.updated_at,
         a.deals, a.won, a.lost, round(100.0 * a.won / NULLIF(a.won + a.lost, 0), 2) AS win_rate_pct,
         round(a.avg_won, 2) AS avg_deal_size_inr, COALESCE(a.total_won, 0) AS total_won_inr
  FROM services s
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS deals, (count(*) FILTER (WHERE d.stage = 'won'))::int AS won, (count(*) FILTER (WHERE d.stage = 'lost'))::int AS lost,
           avg(d.value_inr) FILTER (WHERE d.stage = 'won') AS avg_won, sum(d.value_inr) FILTER (WHERE d.stage = 'won') AS total_won
    FROM deals d WHERE d.service_type = s.service_type AND NOT d.is_test) a ON true
) r

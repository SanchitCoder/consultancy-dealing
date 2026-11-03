-- Reads pipeline_metrics. With consultant_id it aggregates v_deal_facts instead (pipeline_metrics has no per-consultant slice of other dimensions).
WITH p AS (
  SELECT COALESCE(NULLIF($1::jsonb->>'group_by', ''), 'service_type') AS gb, COALESCE(NULLIF($1::jsonb->>'period', ''), 'all_time') AS per,
         NULLIF($1::jsonb->>'consultant_id', '')::bigint AS cid
), since AS (
  SELECT CASE per WHEN 'this_month' THEN date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                  WHEN 'last_30d' THEN now() - interval '30 days' WHEN 'last_90d' THEN now() - interval '90 days' ELSE '-infinity'::timestamptz END AS s FROM p
), f AS (
  SELECT x.*, d.lost_reason FROM v_deal_facts x JOIN deals d ON d.id = x.deal_id, p, since
  WHERE NOT x.is_test AND x.created_at >= since.s AND (p.cid IS NULL OR x.consultant_id = p.cid)
), live AS (
  SELECT CASE p.gb WHEN 'service_type' THEN f.service_type WHEN 'lead_source' THEN f.lead_source
                   WHEN 'service_type_x_lead_source' THEN f.service_type || '|' || f.lead_source ELSE f.consultant_id::text END AS dimension_value,
         count(*)::int AS deals, (count(*) FILTER (WHERE f.call_completed))::int AS calls_completed, (count(*) FILTER (WHERE f.proposal_sent))::int AS proposals_sent,
         (count(*) FILTER (WHERE f.proposal_opened))::int AS proposals_opened, (count(*) FILTER (WHERE f.stage = 'won'))::int AS won, (count(*) FILTER (WHERE f.stage = 'lost'))::int AS lost,
         round(100.0 * count(*) FILTER (WHERE f.stage = 'won') / NULLIF(count(*) FILTER (WHERE f.stage IN ('won', 'lost')), 0), 2) AS win_rate_pct,
         round(avg(f.value_inr) FILTER (WHERE f.stage = 'won'), 2) AS avg_deal_size_inr, COALESCE(sum(f.value_inr) FILTER (WHERE f.stage = 'won'), 0) AS total_won_inr,
         round((avg(EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0) FILTER (WHERE f.first_sent_at IS NOT NULL AND f.call_completed_at IS NOT NULL))::numeric, 2) AS avg_hours_call_to_proposal,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0) FILTER (WHERE f.first_sent_at IS NOT NULL AND f.call_completed_at IS NOT NULL))::numeric, 2) AS median_hours_call_to_proposal,
         round(100.0 * count(*) FILTER (WHERE f.proposal_opened) / NULLIF(count(*) FILTER (WHERE f.proposal_sent), 0), 2) AS open_rate_pct
  FROM f, p WHERE p.cid IS NOT NULL GROUP BY 1
), src AS (
  SELECT m.dimension_value, m.deals, m.calls_completed, m.proposals_sent, m.proposals_opened, m.won, m.lost, m.win_rate_pct, m.avg_deal_size_inr, m.total_won_inr,
         m.avg_hours_call_to_proposal, m.median_hours_call_to_proposal, m.open_rate_pct
  FROM pipeline_metrics m, p WHERE p.cid IS NULL AND m.dimension = p.gb AND m.period = p.per
  UNION ALL SELECT * FROM live
), rws AS (
  SELECT s.*, CASE p.gb
      WHEN 'service_type' THEN COALESCE((SELECT v.name FROM services v WHERE v.service_type = s.dimension_value), s.dimension_value)
      WHEN 'consultant' THEN COALESCE((SELECT c.name FROM consultants c WHERE c.id::text = s.dimension_value), s.dimension_value)
      WHEN 'service_type_x_lead_source' THEN COALESCE((SELECT v.name FROM services v WHERE v.service_type = split_part(s.dimension_value, '|', 1)), split_part(s.dimension_value, '|', 1)) || ' × ' || split_part(s.dimension_value, '|', 2)
      ELSE s.dimension_value END AS label,
    (s.won + s.lost) AS decided
  FROM src s, p
), ov AS (
  SELECT count(*)::int AS deals, (count(*) FILTER (WHERE f.proposal_sent))::int AS proposals_sent, (count(*) FILTER (WHERE f.stage = 'won'))::int AS won, (count(*) FILTER (WHERE f.stage = 'lost'))::int AS lost,
         round(100.0 * count(*) FILTER (WHERE f.stage = 'won') / NULLIF(count(*) FILTER (WHERE f.stage IN ('won', 'lost')), 0), 2) AS win_rate_pct,
         round(avg(f.value_inr) FILTER (WHERE f.stage = 'won'), 2) AS avg_deal_size_inr, COALESCE(sum(f.value_inr) FILTER (WHERE f.stage = 'won'), 0) AS total_won_inr
  FROM f
), sb AS (
  SELECT b.bucket, b.label, b.ord, count(z.stage)::int AS decided, (count(z.stage) FILTER (WHERE z.stage = 'won'))::int AS won, (count(z.stage) FILTER (WHERE z.stage = 'lost'))::int AS lost,
         round(100.0 * count(z.stage) FILTER (WHERE z.stage = 'won') / NULLIF(count(z.stage), 0), 2) AS win_rate_pct
  FROM (VALUES ('lt_24h', 'Under 24h', 1), ('24_48h', '24–48h', 2), ('gt_48h', 'Over 48h', 3)) b(bucket, label, ord)
  LEFT JOIN (SELECT f.stage::text AS stage, CASE WHEN h < 24 THEN 'lt_24h' WHEN h < 48 THEN '24_48h' ELSE 'gt_48h' END AS bucket
             FROM (SELECT f.stage, EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0 AS h FROM f
                   WHERE f.stage IN ('won', 'lost') AND f.first_sent_at IS NOT NULL AND f.call_completed_at IS NOT NULL) f) z ON z.bucket = b.bucket
  GROUP BY b.bucket, b.label, b.ord
), lr AS (
  SELECT COALESCE(NULLIF(f.lost_reason, ''), 'unspecified') AS reason, count(*)::int AS n FROM f WHERE f.stage = 'lost' GROUP BY 1
)
SELECT jsonb_build_object('status', 'ok', 'data', jsonb_build_object(
  'group_by', (SELECT gb FROM p), 'period', (SELECT per FROM p),
  'rows', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.dimension_value) FROM rws r), '[]'::jsonb),
  'overall', (SELECT to_jsonb(ov) FROM ov),
  'speed_buckets', (SELECT jsonb_agg(jsonb_build_object('bucket', s.bucket, 'label', s.label, 'decided', s.decided, 'won', s.won, 'lost', s.lost, 'win_rate_pct', s.win_rate_pct) ORDER BY s.ord) FROM sb s),
  'lost_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', l.reason, 'count', l.n) ORDER BY l.n DESC, l.reason) FROM lr l), '[]'::jsonb)
), 'meta', jsonb_build_object('page', 1, 'page_size', 1, 'total', (SELECT count(*) FROM rws))) AS result

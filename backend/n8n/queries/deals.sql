WITH p AS (
  SELECT $1::jsonb AS q, COALESCE($1::jsonb->>'include_test', '') = '1' AS inc,
         COALESCE(NULLIF($1::jsonb->>'page', '')::int, 1) AS pg, COALESCE(NULLIF($1::jsonb->>'page_size', '')::int, 50) AS ps,
         ltrim(COALESCE(NULLIF($1::jsonb->>'sort', ''), '-created_at'), '-') AS skey,
         CASE WHEN left(COALESCE(NULLIF($1::jsonb->>'sort', ''), '-created_at'), 1) = '-' THEN 1 ELSE -1 END AS sdir
), base AS (
  SELECT d.id, d.prospect_id, d.consultant_id, d.service_type, d.lead_source, d.stage::text AS stage, d.value_inr, d.currency, d.lost_reason,
         d.created_at, d.stage_changed_at, d.won_at, d.lost_at, d.is_test,
         round((EXTRACT(EPOCH FROM (now() - d.stage_changed_at)) / 86400.0)::numeric, 1)::float8 AS days_in_stage,
         pr.name AS prospect_name, pr.company, pr.role, k.name AS consultant_name, s.name AS service_name,
         lp.id AS latest_proposal_id, lp.version AS latest_proposal_version, lp.status AS latest_proposal_status, nc.scheduled_for AS next_call_at
  FROM deals d
  JOIN prospects pr ON pr.id = d.prospect_id
  JOIN consultants k ON k.id = d.consultant_id
  LEFT JOIN services s ON s.service_type = d.service_type
  LEFT JOIN LATERAL (SELECT x.id, x.version, x.status FROM proposals x WHERE x.deal_id = d.id AND x.status <> 'superseded' ORDER BY x.version DESC LIMIT 1) lp ON true
  LEFT JOIN LATERAL (SELECT c.scheduled_for FROM calls c WHERE c.deal_id = d.id ORDER BY (c.status = 'scheduled') DESC, c.scheduled_for DESC NULLS LAST LIMIT 1) nc ON true
  CROSS JOIN p
  WHERE (p.inc OR NOT d.is_test)
    AND (NULLIF(p.q->>'stage', '') IS NULL OR d.stage::text = p.q->>'stage')
    AND (NULLIF(p.q->>'service_type', '') IS NULL OR d.service_type = p.q->>'service_type')
    AND (NULLIF(p.q->>'lead_source', '') IS NULL OR d.lead_source = p.q->>'lead_source')
    AND (NULLIF(p.q->>'consultant_id', '') IS NULL OR d.consultant_id = (p.q->>'consultant_id')::bigint)
    AND (NULLIF(p.q->>'from', '') IS NULL OR d.created_at >= (p.q->>'from')::timestamptz)
    AND (NULLIF(p.q->>'to', '') IS NULL OR d.created_at < (p.q->>'to')::timestamptz)
    AND (NULLIF(p.q->>'search', '') IS NULL OR pr.name ILIKE '%' || (p.q->>'search') || '%' OR pr.company ILIKE '%' || (p.q->>'search') || '%'
         OR pr.email ILIKE '%' || (p.q->>'search') || '%' OR s.name ILIKE '%' || (p.q->>'search') || '%' OR d.id::text = p.q->>'search')
), page AS (
  SELECT b.*, row_number() OVER (ORDER BY (CASE p.skey WHEN 'value_inr' THEN b.value_inr::float8 WHEN 'days_in_stage' THEN b.days_in_stage ELSE EXTRACT(EPOCH FROM b.created_at) END) * p.sdir DESC NULLS LAST, b.id DESC) AS rn
  FROM base b CROSS JOIN p
)
SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE((SELECT jsonb_agg(to_jsonb(g) - 'rn' ORDER BY g.rn) FROM page g, p WHERE g.rn > (p.pg - 1) * p.ps AND g.rn <= p.pg * p.ps), '[]'::jsonb),
  'meta', jsonb_build_object('page', (SELECT pg FROM p), 'page_size', (SELECT ps FROM p), 'total', (SELECT count(*) FROM base))) AS result

WITH p AS (
  SELECT $1::jsonb AS q, COALESCE($1::jsonb->>'include_test', '') = '1' AS inc,
         COALESCE(NULLIF($1::jsonb->>'page', '')::int, 1) AS pg, COALESCE(NULLIF($1::jsonb->>'page_size', '')::int, 25) AS ps
), base AS (
  SELECT pr.id, pr.deal_id, pr.version, pr.status, pr.doc_url, pr.amount_inr, pr.drafted_at, pr.approved_at, pr.sent_at, pr.first_opened_at, pr.last_opened_at,
         pr.open_count, pr.accepted_at, pr.declined_at, pr.expires_at, pr.change_notes,
         COALESCE(ck.n, 0)::int AS link_clicks,
         (pr.sent_at IS NOT NULL AND pr.sent_at = f.first_sent_at) AS is_first_sent_version,
         round((EXTRACT(EPOCH FROM (pr.sent_at - f.call_completed_at)) / 3600.0)::numeric, 2)::float8 AS hours_call_to_proposal,
         round((EXTRACT(EPOCH FROM (pr.drafted_at - f.call_completed_at)) / 3600.0)::numeric, 2)::float8 AS hours_call_to_draft,
         round((EXTRACT(EPOCH FROM (now() - pr.sent_at)) / 86400.0)::numeric, 1)::float8 AS days_since_sent,
         pro.name AS prospect_name, pro.company, d.service_type, s.name AS service_name, d.consultant_id, k.name AS consultant_name, d.stage::text AS deal_stage
  FROM proposals pr
  JOIN deals d ON d.id = pr.deal_id JOIN prospects pro ON pro.id = d.prospect_id JOIN consultants k ON k.id = d.consultant_id
  JOIN v_deal_facts f ON f.deal_id = d.id
  LEFT JOIN services s ON s.service_type = d.service_type
  LEFT JOIN LATERAL (SELECT count(*) AS n FROM proposal_events e WHERE e.proposal_id = pr.id AND e.event_type = 'link_click') ck ON true
  CROSS JOIN p
  WHERE (p.inc OR NOT d.is_test)
    AND ((NULLIF(p.q->>'status', '') IS NULL AND pr.status <> 'superseded') OR pr.status = ANY (string_to_array(p.q->>'status', ',')))
    AND (NULLIF(p.q->>'consultant_id', '') IS NULL OR d.consultant_id = (p.q->>'consultant_id')::bigint)
    AND (NULLIF(p.q->>'deal_id', '') IS NULL OR pr.deal_id = (p.q->>'deal_id')::bigint)
    AND (NULLIF(p.q->>'from', '') IS NULL OR pr.drafted_at >= (p.q->>'from')::timestamptz)
    AND (NULLIF(p.q->>'to', '') IS NULL OR pr.drafted_at < (p.q->>'to')::timestamptz)
), page AS (
  SELECT b.*, row_number() OVER (ORDER BY COALESCE(b.sent_at, b.drafted_at) DESC, b.id DESC) AS rn FROM base b
)
SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE((SELECT jsonb_agg(to_jsonb(g) - 'rn' ORDER BY g.rn) FROM page g, p WHERE g.rn > (p.pg - 1) * p.ps AND g.rn <= p.pg * p.ps), '[]'::jsonb),
  'meta', jsonb_build_object('page', (SELECT pg FROM p), 'page_size', (SELECT ps FROM p), 'total', (SELECT count(*) FROM base))) AS result

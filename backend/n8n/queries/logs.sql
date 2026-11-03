WITH p AS (
  SELECT COALESCE(NULLIF($1::jsonb->>'type', ''), 'event') AS ty, COALESCE($1::jsonb->>'include_test', '') = '1' AS inc,
         COALESCE(NULLIF($1::jsonb->>'page', '')::int, 1) AS pg, COALESCE(NULLIF($1::jsonb->>'page_size', '')::int, 25) AS ps
), rws AS (
  SELECT e.id, 'error'::text AS kind, e.node AS source, e.error AS title, e.payload, e.execution_id, false AS is_test, e.created_at FROM error_log e, p WHERE p.ty = 'error'
  UNION ALL
  SELECT v.id, 'event', v.branch, v.event_type, v.payload, NULL::text, v.is_test, v.created_at FROM event_log v, p WHERE p.ty = 'event' AND (p.inc OR NOT v.is_test)
), page AS (
  SELECT r.*, row_number() OVER (ORDER BY r.created_at DESC, r.id DESC) AS rn FROM rws r
)
SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE((SELECT jsonb_agg(to_jsonb(g) - 'rn' ORDER BY g.rn) FROM page g, p WHERE g.rn > (p.pg - 1) * p.ps AND g.rn <= p.pg * p.ps), '[]'::jsonb),
  'meta', jsonb_build_object('page', (SELECT pg FROM p), 'page_size', (SELECT ps FROM p), 'total', (SELECT count(*) FROM rws))) AS result

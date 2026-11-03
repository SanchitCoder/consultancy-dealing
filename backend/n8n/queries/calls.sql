WITH p AS (
  SELECT $1::jsonb AS q, COALESCE($1::jsonb->>'include_test', '') = '1' AS inc, COALESCE(NULLIF($1::jsonb->>'when', ''), 'all') AS wh,
         COALESCE($1::jsonb->>'include_transcript', '') = '1' AS tr,
         COALESCE(NULLIF($1::jsonb->>'page', '')::int, 1) AS pg, COALESCE(NULLIF($1::jsonb->>'page_size', '')::int, 25) AS ps
), base AS (
  SELECT c.id, c.deal_id, c.booking_id, c.provider, c.booked_at, c.scheduled_for, c.status, c.completed_at, c.transcript_source,
         (c.transcript_text IS NOT NULL AND c.transcript_text <> '') AS has_transcript,
         CASE WHEN p.tr THEN c.transcript_text END AS transcript_text, c.notes, c.intake_answers,
         pr.name AS prospect_name, pr.company, pr.role, d.service_type, d.consultant_id, k.name AS consultant_name, d.stage::text AS deal_stage, d.is_test,
         COALESCE(b.status, 'none') AS brief_status, b.id AS brief_id, b.brief_doc_url, b.generated_at AS brief_generated_at,
         COALESCE(b.status = 'ready' AND b.generated_at <= c.scheduled_for, false) AS brief_ready_before_call,
         round((EXTRACT(EPOCH FROM (c.scheduled_for - now())) / 3600.0)::numeric, 2)::float8 AS hours_until_call,
         (c.status = 'scheduled' AND c.scheduled_for >= now() - interval '60 minutes') AS is_upcoming
  FROM calls c
  JOIN deals d ON d.id = c.deal_id JOIN prospects pr ON pr.id = d.prospect_id JOIN consultants k ON k.id = d.consultant_id
  LEFT JOIN research_briefs b ON b.call_id = c.id
  CROSS JOIN p
  WHERE (p.inc OR NOT d.is_test)
    AND (NULLIF(p.q->>'status', '') IS NULL OR c.status = p.q->>'status')
    AND (NULLIF(p.q->>'consultant_id', '') IS NULL OR d.consultant_id = (p.q->>'consultant_id')::bigint)
    AND (NULLIF(p.q->>'deal_id', '') IS NULL OR c.deal_id = (p.q->>'deal_id')::bigint)
), filt AS (
  SELECT b.* FROM base b, p WHERE p.wh = 'all' OR (p.wh = 'upcoming' AND b.is_upcoming) OR (p.wh = 'past' AND NOT b.is_upcoming)
), page AS (
  SELECT f.*, row_number() OVER (ORDER BY (CASE WHEN p.wh = 'upcoming' THEN f.scheduled_for END) ASC NULLS LAST, f.scheduled_for DESC NULLS LAST, f.id DESC) AS rn
  FROM filt f CROSS JOIN p
)
SELECT jsonb_build_object('status', 'ok',
  'data', COALESCE((SELECT jsonb_agg(to_jsonb(g) - 'rn' - 'is_upcoming' - 'is_test' ORDER BY g.rn) FROM page g, p WHERE g.rn > (p.pg - 1) * p.ps AND g.rn <= p.pg * p.ps), '[]'::jsonb),
  'meta', jsonb_build_object('page', (SELECT pg FROM p), 'page_size', (SELECT ps FROM p), 'total', (SELECT count(*) FROM filt))) AS result

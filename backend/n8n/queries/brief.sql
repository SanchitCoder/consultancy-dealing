WITH p AS (SELECT $1::jsonb AS q), b AS (
  SELECT rb.id, rb.deal_id, rb.call_id, rb.status, rb.brief_markdown, rb.brief_doc_url, COALESCE(rb.sources_json, '[]'::jsonb) AS sources,
         rb.attempts, rb.error, rb.created_at, rb.generated_at, rb.delivered_at, pr.name AS prospect_name, pr.company, c.scheduled_for
  FROM research_briefs rb JOIN calls c ON c.id = rb.call_id JOIN deals d ON d.id = rb.deal_id JOIN prospects pr ON pr.id = d.prospect_id, p
  WHERE rb.deal_id = (p.q->>'deal_id')::bigint AND (NULLIF(p.q->>'call_id', '') IS NULL OR rb.call_id = (p.q->>'call_id')::bigint)
  ORDER BY rb.id DESC LIMIT 1
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM b)
  THEN jsonb_build_object('status', 'ok', 'data', (SELECT to_jsonb(b) FROM b), 'meta', jsonb_build_object('page', 1, 'page_size', 1, 'total', 1))
  ELSE jsonb_build_object('status', 'error', 'error', 'no research brief exists for that deal yet') END AS result

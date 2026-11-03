-- Thresholds come from the workflow CONFIG node (proposal_sla_hours, proposal_escalate_hours, unopened_nudge_hours, opened_followup_hours).
-- Rules mirror "SLA - Find Calls Without A Sent Proposal" and "Followups - Find Due Follow-ups" so the board agrees with the alerts people receive.
WITH p AS (
  SELECT ($1::jsonb->>'sla')::numeric AS sla, ($1::jsonb->>'escalate')::numeric AS esc, ($1::jsonb->>'unopened')::numeric AS unopened, ($1::jsonb->>'opened')::numeric AS opened,
         COALESCE($1::jsonb->>'include_test', '') = '1' AS inc, NULLIF($1::jsonb->>'consultant_id', '')::bigint AS cid
), overdue AS (
  SELECT c.deal_id, c.id AS call_id, pr.name AS prospect_name, pr.company, d.service_type, d.consultant_id, k.name AS consultant_name, c.completed_at AS call_completed_at,
         round((EXTRACT(EPOCH FROM (now() - c.completed_at)) / 3600.0)::numeric, 1)::float8 AS hours_since_call,
         CASE WHEN now() >= c.completed_at + p.esc * interval '1 hour' THEN 'escalated' ELSE 'sla' END AS level,
         dp.id AS draft_proposal_id, dp.version AS draft_version, dp.status AS draft_status
  FROM calls c JOIN deals d ON d.id = c.deal_id JOIN prospects pr ON pr.id = d.prospect_id JOIN consultants k ON k.id = d.consultant_id
  CROSS JOIN p
  LEFT JOIN LATERAL (SELECT x.id, x.version, x.status FROM proposals x WHERE x.deal_id = d.id AND x.status IN ('drafted', 'approved') ORDER BY x.version DESC LIMIT 1) dp ON true
  WHERE c.status = 'completed' AND c.id = (SELECT max(y.id) FROM calls y WHERE y.deal_id = d.id AND y.status = 'completed')
    AND d.stage IN ('call_done', 'proposal_drafted')
    AND NOT EXISTS (SELECT 1 FROM proposals x WHERE x.deal_id = d.id AND x.sent_at IS NOT NULL)
    AND now() >= c.completed_at + p.sla * interval '1 hour'
    AND (p.inc OR NOT d.is_test) AND (p.cid IS NULL OR d.consultant_id = p.cid)
), cold AS (
  SELECT x.id AS proposal_id, x.deal_id, x.version, CASE WHEN x.status = 'sent' THEN 'unopened' ELSE 'opened_undecided' END AS kind, x.status,
         pr.name AS prospect_name, pr.company, d.service_type, d.consultant_id, k.name AS consultant_name, x.amount_inr, x.sent_at, x.first_opened_at, x.last_opened_at, x.open_count, x.expires_at,
         round((EXTRACT(EPOCH FROM (now() - x.sent_at)) / 3600.0)::numeric, 1)::float8 AS hours_since_sent,
         round((EXTRACT(EPOCH FROM (now() - x.first_opened_at)) / 3600.0)::numeric, 1)::float8 AS hours_since_first_open
  FROM proposals x JOIN deals d ON d.id = x.deal_id JOIN prospects pr ON pr.id = d.prospect_id JOIN consultants k ON k.id = d.consultant_id
  CROSS JOIN p
  WHERE ((x.status = 'sent' AND now() >= x.sent_at + p.unopened * interval '1 hour') OR (x.status = 'opened' AND now() >= x.first_opened_at + p.opened * interval '1 hour'))
    AND (x.expires_at IS NULL OR now() < x.expires_at) AND (p.inc OR NOT d.is_test) AND (p.cid IS NULL OR d.consultant_id = p.cid)
)
SELECT jsonb_build_object('status', 'ok', 'data', jsonb_build_object(
  'thresholds', (SELECT jsonb_build_object('proposal_sla_hours', sla, 'proposal_escalate_hours', esc, 'unopened_nudge_hours', unopened, 'opened_followup_hours', opened) FROM p),
  'overdue', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.call_completed_at) FROM overdue o), '[]'::jsonb),
  'cold', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sent_at) FROM cold c), '[]'::jsonb),
  'counts', jsonb_build_object('overdue', (SELECT count(*) FROM overdue), 'escalated', (SELECT count(*) FROM overdue WHERE level = 'escalated'),
      'unopened', (SELECT count(*) FROM cold WHERE kind = 'unopened'), 'opened_undecided', (SELECT count(*) FROM cold WHERE kind = 'opened_undecided'))
), 'meta', jsonb_build_object('page', 1, 'page_size', 1, 'total', (SELECT count(*) FROM overdue) + (SELECT count(*) FROM cold))) AS result

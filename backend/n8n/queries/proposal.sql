-- Server-to-server read: includes approve_token and tracking_token. The dashboard proxy strips both before anything reaches a browser.
WITH p AS (SELECT (($1::jsonb)->>'id')::bigint AS pid), pr AS (
  SELECT x.* FROM proposals x, p WHERE x.id = p.pid
), ctx AS (
  SELECT pr.id, d.id AS deal_id, d.stage::text AS deal_stage, d.value_inr, d.service_type, d.lead_source, d.lost_reason, d.consultant_id, d.prospect_id,
         f.call_completed_at, f.first_sent_at
  FROM pr JOIN deals d ON d.id = pr.deal_id JOIN v_deal_facts f ON f.deal_id = d.id
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM pr) THEN jsonb_build_object('status', 'ok', 'data', jsonb_build_object(
  'proposal', (SELECT (to_jsonb(pr) - 'content') || jsonb_build_object(
      'link_clicks', (SELECT count(*) FROM proposal_events e WHERE e.proposal_id = pr.id AND e.event_type = 'link_click'),
      'is_first_sent_version', (pr.sent_at IS NOT NULL AND pr.sent_at = ctx.first_sent_at),
      'hours_call_to_proposal', round((EXTRACT(EPOCH FROM (pr.sent_at - ctx.call_completed_at)) / 3600.0)::numeric, 2)::float8,
      'hours_call_to_draft', round((EXTRACT(EPOCH FROM (pr.drafted_at - ctx.call_completed_at)) / 3600.0)::numeric, 2)::float8,
      'days_since_sent', round((EXTRACT(EPOCH FROM (now() - pr.sent_at)) / 86400.0)::numeric, 1)::float8,
      'service_name', (SELECT s.name FROM services s WHERE s.service_type = ctx.service_type),
      'consultant_id', ctx.consultant_id) FROM pr, ctx),
  'versions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'status', v.status, 'amount_inr', v.amount_inr, 'doc_url', v.doc_url,
      'drafted_at', v.drafted_at, 'sent_at', v.sent_at, 'first_opened_at', v.first_opened_at, 'open_count', v.open_count, 'accepted_at', v.accepted_at,
      'declined_at', v.declined_at, 'change_notes', v.change_notes) ORDER BY v.version), '[]'::jsonb) FROM proposals v, ctx WHERE v.deal_id = ctx.deal_id),
  'events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'proposal_id', e.proposal_id, 'version', v.version, 'event_type', e.event_type,
      'user_agent', e.user_agent, 'meta', e.meta, 'created_at', e.created_at) ORDER BY e.created_at, e.id), '[]'::jsonb)
      FROM proposal_events e JOIN proposals v ON v.id = e.proposal_id, ctx WHERE v.deal_id = ctx.deal_id),
  'approval', (SELECT jsonb_build_object(
      'state', CASE pr.status WHEN 'drafted' THEN 'awaiting_approval' ELSE pr.status END,
      'can_approve', (pr.status IN ('drafted', 'approved') AND pr.sent_at IS NULL),
      'approved_at', pr.approved_at,
      'approve_token', CASE WHEN pr.status IN ('drafted', 'approved') AND pr.sent_at IS NULL THEN pr.approve_token END) FROM pr),
  'deal', (SELECT jsonb_build_object('id', deal_id, 'stage', deal_stage, 'value_inr', value_inr, 'service_type', service_type, 'lead_source', lead_source,
      'lost_reason', lost_reason, 'consultant_id', consultant_id) FROM ctx),
  'prospect', (SELECT jsonb_build_object('id', x.id, 'name', x.name, 'email', x.email, 'phone', x.phone, 'company', x.company, 'website', x.website,
      'linkedin_url', x.linkedin_url, 'role', x.role) FROM prospects x, ctx WHERE x.id = ctx.prospect_id),
  'consultant', (SELECT jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email) FROM consultants k, ctx WHERE k.id = ctx.consultant_id),
  'call', (SELECT jsonb_build_object('id', c.id, 'scheduled_for', c.scheduled_for, 'completed_at', c.completed_at) FROM calls c, ctx WHERE c.deal_id = ctx.deal_id
      ORDER BY (c.status = 'completed') DESC, c.id DESC LIMIT 1)
), 'meta', jsonb_build_object('page', 1, 'page_size', 1, 'total', 1))
ELSE jsonb_build_object('status', 'error', 'error', 'proposal not found') END AS result

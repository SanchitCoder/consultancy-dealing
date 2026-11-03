-- == AdminApprove - Find Proposal ($1 = proposal_id) ==
SELECT pr.id AS proposal_id, pr.deal_id, pr.version, pr.status, pr.approve_token,
       (pr.status IN ('drafted', 'approved') AND pr.sent_at IS NULL) AS approvable, p.name AS prospect_name
FROM proposals pr JOIN deals d ON d.id = pr.deal_id JOIN prospects p ON p.id = d.prospect_id WHERE pr.id = $1::bigint;

-- == BriefRegen - Find Call ($1 = deal_id): the call a brief belongs to (next scheduled call, else the latest completed one) ==
SELECT c.id AS call_id, c.deal_id FROM calls c
WHERE c.deal_id = $1::bigint AND c.status IN ('scheduled', 'completed')
ORDER BY (c.status = 'scheduled') DESC, c.scheduled_for DESC NULLS LAST, c.id DESC LIMIT 1;

-- == Consultant - Upsert ($1 id|'' , $2 name, $3 email, $4 whatsapp|'', $5 timezone|'') ==
WITH inp AS (
  SELECT NULLIF($1, '')::bigint AS id, btrim($2) AS name, lower(btrim($3)) AS email, normalize_phone(NULLIF($4, '')) AS wa, COALESCE(NULLIF(btrim($5), ''), 'Asia/Kolkata') AS tz
), upd AS (
  UPDATE consultants c SET name = i.name, email = i.email, whatsapp = COALESCE(i.wa, c.whatsapp), timezone = i.tz
  FROM inp i WHERE i.id IS NOT NULL AND c.id = i.id RETURNING c.id, false AS created
), ins AS (
  INSERT INTO consultants (name, email, whatsapp, timezone) SELECT i.name, i.email, i.wa, i.tz FROM inp i WHERE i.id IS NULL
  ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, whatsapp = COALESCE(EXCLUDED.whatsapp, consultants.whatsapp), timezone = EXCLUDED.timezone
  RETURNING id, (xmax = 0) AS created
)
SELECT id AS consultant_id, created FROM upd UNION ALL SELECT id, created FROM ins;

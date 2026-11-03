-- Verbatim extract of the schema created by the workflow's "Setup" nodes (tables, v_deal_facts, v_pipeline_calc,
-- normalize_phone, recompute_pipeline_metrics). Used ONLY by scripts/verify-sql.ts to run the dashboard queries
-- against a real Postgres engine (PGlite). RLS and message_log are omitted: no dashboard query touches them.
DO $$ BEGIN
  CREATE TYPE deal_stage AS ENUM ('call_booked','brief_ready','call_done','proposal_drafted','proposal_sent','proposal_opened','negotiation','won','lost','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE consultants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, email text NOT NULL, whatsapp text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata', created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX ux_consultants_email ON consultants (lower(email));
CREATE TABLE services (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, service_type text NOT NULL UNIQUE,
  base_price_inr numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_price_inr >= 0), proposal_template_doc_id text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE prospects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text, email text, phone text CHECK (phone IS NULL OR phone ~ '^\+91[6-9][0-9]{9}$'),
  company text, website text, linkedin_url text, role text, lead_source text, utm_source text, utm_medium text, utm_campaign text, referrer text,
  opted_out boolean NOT NULL DEFAULT false, is_test boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL));
CREATE TABLE deals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, prospect_id bigint NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  consultant_id bigint NOT NULL REFERENCES consultants(id), service_type text NOT NULL, lead_source text NOT NULL DEFAULT 'direct',
  stage deal_stage NOT NULL DEFAULT 'call_booked', value_inr numeric(14,2), currency text NOT NULL DEFAULT 'INR', lost_reason text,
  is_test boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), stage_changed_at timestamptz NOT NULL DEFAULT now(),
  won_at timestamptz, lost_at timestamptz);
CREATE TABLE calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE, booking_id text NOT NULL,
  provider text NOT NULL DEFAULT 'generic', booked_at timestamptz NOT NULL DEFAULT now(), scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','no_show','canceled','rescheduled')),
  intake_answers jsonb, transcript_text text, transcript_source text, notes text, completed_at timestamptz);
CREATE TABLE research_briefs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  call_id bigint NOT NULL REFERENCES calls(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  brief_markdown text, brief_doc_url text, sources_json jsonb, attempts int NOT NULL DEFAULT 0, error text,
  created_at timestamptz NOT NULL DEFAULT now(), generated_at timestamptz, delivered_at timestamptz, UNIQUE (call_id));
CREATE TABLE proposals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE, version int NOT NULL,
  doc_url text, pdf_drive_id text, amount_inr numeric(14,2),
  status text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted','approved','sent','opened','accepted','declined','expired','superseded')),
  tracking_token text NOT NULL UNIQUE, approve_token text NOT NULL UNIQUE, content jsonb, change_notes text, payment_link text,
  followup_draft text, followup_drafted_at timestamptz, drafted_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, sent_at timestamptz,
  first_opened_at timestamptz, open_count int NOT NULL DEFAULT 0, last_opened_at timestamptz, accepted_at timestamptz, declined_at timestamptz,
  expires_at timestamptz, UNIQUE (deal_id, version));
CREATE TABLE proposal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, proposal_id bigint NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('open','link_click','accept_click','decline_click','sign','pay')),
  ip_hash text, user_agent text, meta jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE, payment_id text NOT NULL UNIQUE,
  provider text NOT NULL, amount_inr numeric(14,2) NOT NULL CHECK (amount_inr >= 0), status text NOT NULL DEFAULT 'paid', paid_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE deal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint NOT NULL REFERENCES deals(id) ON DELETE CASCADE, event_type text NOT NULL,
  from_stage deal_stage, to_stage deal_stage, note text, payload jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE pipeline_metrics (
  dimension text NOT NULL, dimension_value text NOT NULL, period text NOT NULL,
  deals int NOT NULL DEFAULT 0, calls_completed int NOT NULL DEFAULT 0, proposals_sent int NOT NULL DEFAULT 0, proposals_opened int NOT NULL DEFAULT 0,
  won int NOT NULL DEFAULT 0, lost int NOT NULL DEFAULT 0, win_rate_pct numeric(6,2), avg_deal_size_inr numeric(14,2), total_won_inr numeric(14,2) NOT NULL DEFAULT 0,
  avg_hours_call_to_proposal numeric(10,2), median_hours_call_to_proposal numeric(10,2), avg_hours_proposal_to_decision numeric(10,2), open_rate_pct numeric(6,2),
  briefs_ready int NOT NULL DEFAULT 0, brief_ready_pct numeric(6,2), proposals_drafted int NOT NULL DEFAULT 0, proposals_accepted int NOT NULL DEFAULT 0,
  avg_hours_call_to_draft numeric(10,2), computed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (dimension, dimension_value, period));
CREATE TABLE event_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, branch text NOT NULL, event_type text NOT NULL, payload jsonb,
  is_test boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE error_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, node text, error text, payload jsonb, execution_id text, created_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE VIEW v_deal_facts AS
SELECT d.id AS deal_id, d.service_type, d.lead_source, d.consultant_id, d.stage, d.value_inr, d.created_at, d.is_test, d.stage_changed_at,
       (SELECT min(c.completed_at) FROM calls c WHERE c.deal_id = d.id AND c.status = 'completed') AS call_completed_at,
       EXISTS (SELECT 1 FROM calls c WHERE c.deal_id = d.id AND c.status = 'completed') AS call_completed,
       EXISTS (SELECT 1 FROM research_briefs b WHERE b.deal_id = d.id AND b.status = 'ready') AS brief_ready,
       (SELECT min(p.drafted_at) FROM proposals p WHERE p.deal_id = d.id) AS first_drafted_at,
       (SELECT min(p.sent_at) FROM proposals p WHERE p.deal_id = d.id) AS first_sent_at,
       EXISTS (SELECT 1 FROM proposals p WHERE p.deal_id = d.id) AS proposal_drafted,
       EXISTS (SELECT 1 FROM proposals p WHERE p.deal_id = d.id AND p.sent_at IS NOT NULL) AS proposal_sent,
       EXISTS (SELECT 1 FROM proposals p WHERE p.deal_id = d.id AND p.first_opened_at IS NOT NULL) AS proposal_opened,
       EXISTS (SELECT 1 FROM proposals p WHERE p.deal_id = d.id AND p.accepted_at IS NOT NULL) AS proposal_accepted,
       (SELECT min(LEAST(COALESCE(p.accepted_at, p.declined_at), COALESCE(p.declined_at, p.accepted_at)))
          FROM proposals p WHERE p.deal_id = d.id AND (p.accepted_at IS NOT NULL OR p.declined_at IS NOT NULL)) AS decision_at
FROM deals d;

CREATE OR REPLACE VIEW v_pipeline_calc AS
WITH periods AS (
  SELECT * FROM (VALUES
    ('this_month', date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),
    ('last_30d',   now() - interval '30 days'),
    ('last_90d',   now() - interval '90 days'),
    ('all_time',   '-infinity'::timestamptz)) p(period, since)
), f AS (
  SELECT p.period, d.* FROM periods p JOIN (SELECT * FROM v_deal_facts WHERE NOT is_test) d ON d.created_at >= p.since
), x AS (
  SELECT f.*, dim.dimension, dim.dimension_value
  FROM f CROSS JOIN LATERAL (VALUES
    ('overall', 'all'),
    ('service_type', f.service_type),
    ('lead_source', f.lead_source),
    ('service_type_x_lead_source', f.service_type || '|' || f.lead_source),
    ('consultant', f.consultant_id::text)) AS dim(dimension, dimension_value)
)
SELECT dimension, dimension_value, period,
       count(*)::int AS deals,
       (count(*) FILTER (WHERE call_completed))::int AS calls_completed,
       (count(*) FILTER (WHERE proposal_sent))::int AS proposals_sent,
       (count(*) FILTER (WHERE proposal_opened))::int AS proposals_opened,
       (count(*) FILTER (WHERE stage = 'won'))::int AS won,
       (count(*) FILTER (WHERE stage = 'lost'))::int AS lost,
       round(100.0 * count(*) FILTER (WHERE stage = 'won') / NULLIF(count(*) FILTER (WHERE stage IN ('won', 'lost')), 0), 2) AS win_rate_pct,
       round(avg(value_inr) FILTER (WHERE stage = 'won'), 2) AS avg_deal_size_inr,
       COALESCE(sum(value_inr) FILTER (WHERE stage = 'won'), 0) AS total_won_inr,
       round((avg(EXTRACT(EPOCH FROM (first_sent_at - call_completed_at)) / 3600.0) FILTER (WHERE first_sent_at IS NOT NULL AND call_completed_at IS NOT NULL))::numeric, 2) AS avg_hours_call_to_proposal,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_sent_at - call_completed_at)) / 3600.0) FILTER (WHERE first_sent_at IS NOT NULL AND call_completed_at IS NOT NULL))::numeric, 2) AS median_hours_call_to_proposal,
       round((avg(EXTRACT(EPOCH FROM (decision_at - first_sent_at)) / 3600.0) FILTER (WHERE decision_at IS NOT NULL AND first_sent_at IS NOT NULL))::numeric, 2) AS avg_hours_proposal_to_decision,
       round(100.0 * count(*) FILTER (WHERE proposal_opened) / NULLIF(count(*) FILTER (WHERE proposal_sent), 0), 2) AS open_rate_pct,
       (count(*) FILTER (WHERE brief_ready))::int AS briefs_ready,
       round(100.0 * count(*) FILTER (WHERE brief_ready) / NULLIF(count(*), 0), 2) AS brief_ready_pct,
       (count(*) FILTER (WHERE proposal_drafted))::int AS proposals_drafted,
       (count(*) FILTER (WHERE proposal_accepted))::int AS proposals_accepted,
       round((avg(EXTRACT(EPOCH FROM (first_drafted_at - call_completed_at)) / 3600.0) FILTER (WHERE first_drafted_at IS NOT NULL AND call_completed_at IS NOT NULL))::numeric, 2) AS avg_hours_call_to_draft
FROM x
GROUP BY period, dimension, dimension_value;

CREATE OR REPLACE FUNCTION normalize_phone(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^[6-9][0-9]{9}$'     THEN '+91' || d
    WHEN d ~ '^0[6-9][0-9]{9}$'    THEN '+91' || substr(d, 2)
    WHEN d ~ '^91[6-9][0-9]{9}$'   THEN '+' || d
    WHEN d ~ '^0091[6-9][0-9]{9}$' THEN '+' || substr(d, 3)
  END
  FROM (SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g') AS d) s
$$;

CREATE OR REPLACE FUNCTION recompute_pipeline_metrics() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  DELETE FROM pipeline_metrics WHERE true;
  INSERT INTO pipeline_metrics (dimension, dimension_value, period, deals, calls_completed, proposals_sent, proposals_opened, won, lost,
      win_rate_pct, avg_deal_size_inr, total_won_inr, avg_hours_call_to_proposal, median_hours_call_to_proposal, avg_hours_proposal_to_decision,
      open_rate_pct, briefs_ready, brief_ready_pct, proposals_drafted, proposals_accepted, avg_hours_call_to_draft, computed_at)
  SELECT dimension, dimension_value, period, deals, calls_completed, proposals_sent, proposals_opened, won, lost,
      win_rate_pct, avg_deal_size_inr, total_won_inr, avg_hours_call_to_proposal, median_hours_call_to_proposal, avg_hours_proposal_to_decision,
      open_rate_pct, briefs_ready, brief_ready_pct, proposals_drafted, proposals_accepted, avg_hours_call_to_draft, now()
  FROM v_pipeline_calc;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

WITH p AS (
  SELECT ($1::jsonb->>'from')::timestamptz AS f, ($1::jsonb->>'to')::timestamptz AS t, COALESCE($1::jsonb->>'include_test', '') = '1' AS inc, NULLIF($1::jsonb->>'consultant_id', '')::bigint AS cid
), nw AS (
  SELECT LEAST(12, GREATEST(4, ceil(EXTRACT(EPOCH FROM (t - f)) / 604800.0)::int)) AS n FROM p
), w AS (
  SELECT 'current'::text AS k, 0 AS i, f, t FROM p
  UNION ALL SELECT 'previous', 0, f - (t - f), f FROM p
  UNION ALL SELECT 'week', g.i, p.t - (g.i + 1) * interval '7 days', p.t - g.i * interval '7 days' FROM p, generate_series(0, (SELECT n FROM nw) - 1) AS g(i)
), df AS (
  SELECT d.value_inr, d.won_at, d.lost_at, d.created_at, d.stage::text AS stage, f.first_sent_at, f.proposal_opened,
         EXTRACT(EPOCH FROM (f.first_sent_at - f.call_completed_at)) / 3600.0 AS h
  FROM deals d JOIN v_deal_facts f ON f.deal_id = d.id, p WHERE (p.inc OR NOT d.is_test) AND (p.cid IS NULL OR d.consultant_id = p.cid)
), cl AS (
  SELECT c.booked_at, c.scheduled_for, c.status, COALESCE(b.status = 'ready' AND b.generated_at <= c.scheduled_for, false) AS brief_before
  FROM calls c JOIN deals d ON d.id = c.deal_id LEFT JOIN research_briefs b ON b.call_id = c.id, p WHERE (p.inc OR NOT d.is_test) AND (p.cid IS NULL OR d.consultant_id = p.cid)
), kd AS (
  SELECT w.k, w.i, w.f, w.t,
    (count(*) FILTER (WHERE df.first_sent_at >= w.f AND df.first_sent_at < w.t))::int AS proposals_sent,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY df.h) FILTER (WHERE df.first_sent_at >= w.f AND df.first_sent_at < w.t) AS median_h,
    (count(*) FILTER (WHERE df.first_sent_at >= w.f AND df.first_sent_at < w.t AND df.proposal_opened))::int AS opened,
    (count(*) FILTER (WHERE df.won_at >= w.f AND df.won_at < w.t))::int AS won,
    (count(*) FILTER (WHERE df.lost_at >= w.f AND df.lost_at < w.t))::int AS lost,
    avg(df.value_inr) FILTER (WHERE df.won_at >= w.f AND df.won_at < w.t) AS avg_deal,
    sum(df.value_inr) FILTER (WHERE df.won_at >= w.f AND df.won_at < w.t) AS revenue,
    (count(*) FILTER (WHERE df.created_at < w.t AND df.stage <> 'no_show' AND COALESCE(df.won_at, df.lost_at, 'infinity'::timestamptz) >= w.t))::int AS open_deals,
    sum(df.value_inr) FILTER (WHERE df.created_at < w.t AND df.stage <> 'no_show' AND COALESCE(df.won_at, df.lost_at, 'infinity'::timestamptz) >= w.t) AS pipeline_value
  FROM w CROSS JOIN df GROUP BY w.k, w.i, w.f, w.t
), kc AS (
  SELECT w.k, w.i,
    (count(*) FILTER (WHERE cl.booked_at >= w.f AND cl.booked_at < w.t))::int AS calls_booked,
    (count(*) FILTER (WHERE cl.scheduled_for >= w.f AND cl.scheduled_for < w.t AND cl.scheduled_for <= now() AND cl.status NOT IN ('canceled', 'rescheduled')))::int AS calls_due,
    (count(*) FILTER (WHERE cl.scheduled_for >= w.f AND cl.scheduled_for < w.t AND cl.scheduled_for <= now() AND cl.status NOT IN ('canceled', 'rescheduled') AND cl.brief_before))::int AS calls_brief_ready
  FROM w CROSS JOIN cl GROUP BY w.k, w.i
), kpi AS (
  SELECT kd.k, kd.i, kd.f AS from_ts, kd.t AS to_ts, kc.calls_booked, kc.calls_due, kc.calls_brief_ready,
    round(100.0 * kc.calls_brief_ready / NULLIF(kc.calls_due, 0), 2)::float8 AS brief_ready_pct,
    kd.proposals_sent, round(kd.median_h::numeric, 2)::float8 AS median_hours_call_to_proposal,
    round(100.0 * kd.opened / NULLIF(kd.proposals_sent, 0), 2)::float8 AS open_rate_pct,
    kd.won, kd.lost, kd.open_deals,
    round(100.0 * kd.won / NULLIF(kd.won + kd.lost, 0), 2)::float8 AS win_rate_pct,
    round(100.0 * kd.won / NULLIF(kd.won + kd.lost + kd.open_deals, 0), 2)::float8 AS win_rate_incl_open_pct,
    round(kd.avg_deal::numeric, 2)::float8 AS avg_deal_size_inr,
    COALESCE(kd.revenue, 0)::float8 AS revenue_won_inr,
    COALESCE(kd.pipeline_value, 0)::float8 AS pipeline_value_inr
  FROM kd JOIN kc ON kc.k = kd.k AND kc.i = kd.i
)
SELECT jsonb_build_object('status', 'ok', 'data', jsonb_build_object(
  'range', (SELECT jsonb_build_object('from', f, 'to', t) FROM p),
  'previous_range', (SELECT jsonb_build_object('from', f - (t - f), 'to', f) FROM p),
  'totals', (SELECT to_jsonb(x) - 'k' - 'i' - 'from_ts' - 'to_ts' FROM kpi x WHERE x.k = 'current'),
  'previous', (SELECT to_jsonb(x) - 'k' - 'i' - 'from_ts' - 'to_ts' FROM kpi x WHERE x.k = 'previous'),
  'weekly', (SELECT COALESCE(jsonb_agg((to_jsonb(x) - 'k' - 'i' - 'from_ts' - 'to_ts') || jsonb_build_object('week_start', x.from_ts, 'week_end', x.to_ts) ORDER BY x.i DESC), '[]'::jsonb) FROM kpi x WHERE x.k = 'week')
), 'meta', jsonb_build_object('page', 1, 'page_size', 1, 'total', 1)) AS result

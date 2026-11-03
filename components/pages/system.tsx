'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, DatabaseZap, FlaskConical, HeartPulse, MinusCircle, Play, ShieldBan, SlidersHorizontal, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/deal/confirm';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/deal/states';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IS_MOCK } from '@/lib/config';
import { TEST_SCENARIOS, type ConfigData, type TestResponse } from '@/contracts/deal-api';
import { apiPost, ApiError } from '@/lib/client/api';
import { useAction, useApi } from '@/lib/client/hooks';
import { formatIst, relativeTime } from '@/lib/format';
import type { HealthRow } from '@/lib/server/proxy';
import { cn } from '@/lib/utils';

export function System() {
  return (
    <>
      <PageHeader title="System" subtitle="Connection, settings in plain language, the automatic test runner, a contract health check and the logs. Everything here is for the owner." />
      <div className="space-y-4">
        <Connection />
        <ConfigCard />
        <div className="grid gap-4 xl:grid-cols-2"><SetupCard /><HealthCard /></div>
        <TestRunner />
        <Logs />
      </div>
    </>
  );
}

function Section({ icon, title, hint, children, action }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader><div className="min-w-0"><CardTitle><span className="inline-flex items-center gap-2"><span className="text-accent" aria-hidden>{icon}</span>{title}</span></CardTitle>{hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}</div>{action}</CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

interface Info { dataMode: 'mock' | 'live'; n8nHost: string | null; authHeaderName: string | null; allowed: { key: string; method: string; path: string; summary: string; screen: string; addedByDashboard: boolean; mutates: boolean }[]; blocked: string[] }
function Connection() {
  const q = useQuery({ queryKey: ['system-info'], queryFn: async () => (await fetch('/api/system/info')).json() as Promise<Info> });
  return (
    <Section icon={<ShieldBan className="size-4" />} title="Connection and what the dashboard may call" hint="The browser never talks to n8n. A server-side proxy adds the secret header and only forwards the paths listed here.">
      {q.isLoading || !q.data ? <ListSkeleton rows={2} /> : (
        <div className="space-y-4">
          <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
            <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-ink-3">Data mode</dt><dd className="mt-0.5 font-semibold text-ink">{q.data.dataMode === 'mock' ? 'Sample data (mock)' : 'Live'}</dd></div>
            <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-ink-3">n8n host</dt><dd className="mt-0.5 font-mono text-[13px] text-ink">{q.data.n8nHost ?? 'not used in sample mode'}</dd></div>
            <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-ink-3">Auth header</dt><dd className="mt-0.5 font-mono text-[13px] text-ink">{q.data.authHeaderName ?? '—'}</dd></div>
          </dl>
          <details className="rounded-xl border border-border px-4 py-2.5"><summary className="cursor-pointer text-[13px] font-medium text-ink-2">{q.data.allowed.length} allowed endpoints</summary>
            <div className="relative mt-2 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-ink-3"><tr><th className="py-1.5 pr-3 font-medium">Endpoint</th><th className="pr-3 font-medium">Used for</th><th className="font-medium">Type</th></tr></thead>
              <tbody>{q.data.allowed.map((e) => <tr key={e.key} className="border-t border-border"><td className="py-1.5 pr-3 font-mono text-ink">{e.method} {e.path}</td><td className="pr-3 text-ink-2">{e.summary}</td><td>{e.mutates ? <Badge tone="warn">Changes data</Badge> : <Badge>Read only</Badge>} {e.addedByDashboard && <Badge tone="info">Added for dashboard</Badge>}</td></tr>)}</tbody></table></div>
          </details>
          <div className="rounded-xl border border-bad/25 bg-bad-soft p-3 text-[13px]"><p className="flex items-center gap-2 font-semibold text-bad"><ShieldBan className="size-4" aria-hidden />Never called, even by accident</p>
            <p className="mt-1 text-ink-2">These would record fake opens, clicks, acceptances or payments. The proxy refuses them: {q.data.blocked.map((b) => <span key={b}> <code className="rounded bg-surface px-1 font-mono text-xs">{b}</code></span>)}</p></div>
        </div>
      )}
    </Section>
  );
}

function ConfigCard() {
  const q = useApi('config');
  const c = q.data?.data;
  return (
    <Section icon={<SlidersHorizontal className="size-4" />} title="Settings, in plain language" hint="Read-only. These live in the CONFIG node of your n8n workflow; change them there.">
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : c && <ul className="grid gap-x-8 gap-y-2.5 text-[13.5px] text-ink-2 lg:grid-cols-2">{explain(c).map((l) => <li key={l.k} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden /><span>{l.text}</span></li>)}</ul>}
    </Section>
  );
}
function explain(c: ConfigData): { k: string; text: ReactNode }[] {
  const b = (x: ReactNode) => <strong className="text-ink">{x}</strong>;
  return [
    { k: 'sla', text: <>Proposals should go out within {b(`${c.proposal_sla_hours} hours`)} of the call. If nothing is sent by {b(`${c.proposal_escalate_hours} hours`)} the owner is alerted.</> },
    { k: 'cold', text: <>An unopened proposal gets a nudge after {b(`${c.unopened_nudge_hours} hours`)}. One that was opened but not answered gets a suggested follow-up after {b(`${c.opened_followup_hours} hours`)}.</> },
    { k: 'expiry', text: <>Proposals are valid for {b(`${c.proposal_expiry_days} days`)}. A final notice goes out {b(`${c.final_notice_days_before_expiry} days`)} before expiry; after that the deal is closed as lost.</> },
    { k: 'rem', text: <>Prospects are reminded {b(c.reminder_prospect_offsets.map((o) => (o.minutes >= 60 ? `${o.minutes / 60}h` : `${o.minutes} min`)).join(' and '))} before a call. The consultant gets a reminder {b(`${c.reminder_consultant_min} minutes`)} before.</> },
    { k: 'brief', text: <>Every 15 minutes the system looks for calls in the next {b(`${c.brief_watch_horizon_min} minutes`)} that still have no brief and starts one.</> },
    { k: 'noshow', text: <>After a no-show the prospect is nudged again after {b(c.noshow_followup_hours.map((h) => `${h}h`).join(' and '))}.</> },
    { k: 'dedupe', text: <>Several opens from the same device within {b(`${c.open_dedupe_window_min} minutes`)} count once, because mail apps pre-load images.</> },
    { k: 'stuck', text: <>A deal that stays in one stage for {b(`${c.stuck_days} days`)} is shown as stuck on the pipeline.</> },
    { k: 'dry', text: IS_MOCK ? <>Sample data mode: {b('nothing is ever sent')} to anyone, whatever the workflow setting says.</> : c.dry_run ? <>{b('Dry run is ON')}: messages are simulated and nothing is sent to anyone.</> : <>Dry run is {b('off')}: messages are really sent.</> },
    { k: 'auto', text: c.auto_send_followups ? <>Follow-up drafts are {b('sent automatically')}.</> : <>Follow-up drafts {b('wait for a person')} to approve them.</> },
    { k: 'tz', text: <>Times are shown in {b(c.timezone)}; amounts are in {b(c.currency)}.</> },
  ];
}

function SetupCard() {
  const [open, setOpen] = useState(false);
  const setup = useAction('setup', { onSuccess: () => setOpen(false) });
  const created = setup.data?.created;
  return (
    <Section icon={<DatabaseZap className="size-4" />} title="Initialise the backend" hint="Creates the database tables, views and functions the workflow needs. Safe to run again: it only adds what is missing."
      action={<Button variant="secondary" onClick={() => setOpen(true)}>Initialise…</Button>}>
      {created ? (
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">{(['tables', 'views', 'functions', 'indexes'] as const).map((k) => <div key={k} className="rounded-lg bg-surface-2 py-2"><dt className="text-[11px] capitalize text-ink-3">{k}</dt><dd className="tnum text-lg font-semibold text-ink">{created[k].length}</dd></div>)}</dl>
      ) : <p className="text-[13px] text-ink-3">Run this once after importing the workflow and connecting your database.</p>}
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Initialise the backend?" confirmLabel="Initialise" pending={setup.isPending} onConfirm={() => setup.mutate({})}
        description="This runs the setup branch of your workflow against your database. Existing data is not touched." />
    </Section>
  );
}

function HealthCard() {
  const [rows, setRows] = useState<HealthRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch('/api/system/health'); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Check failed'); setRows(j.rows); } catch (e) { setErr(e instanceof Error ? e.message : 'Check failed'); } finally { setBusy(false); }
  };
  const failed = rows?.filter((r) => r.ok === false).length ?? 0;
  return (
    <Section icon={<HeartPulse className="size-4" />} title="Contract health check" hint="Calls every read endpoint and checks the answer against the Zod contract. Catches a workflow change before a page breaks."
      action={<Button variant="secondary" loading={busy} onClick={run}><Play className="size-3.5" aria-hidden />Run check</Button>}>
      {err && <ErrorState error={new Error(err)} />}
      {!rows && !err && <p className="text-[13px] text-ink-3">Not run yet.</p>}
      {rows && (
        <>
          <p className={cn('mb-2 text-[13px] font-medium', failed ? 'text-bad' : 'text-good')}>{failed ? `${failed} of ${rows.length} checks failed` : `All ${rows.filter((r) => r.ok).length} checks pass`}{rows.some((r) => r.ok === null) ? ` (${rows.filter((r) => r.ok === null).length} skipped for lack of data)` : ''}</p>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => (
              <li key={`${r.key}${r.path}`} className="px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  {r.ok === true ? <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="Pass" /> : r.ok === false ? <XCircle className="size-4 shrink-0 text-bad" aria-label="Fail" /> : <MinusCircle className="size-4 shrink-0 text-ink-3" aria-label="Skipped" />}
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{r.method} {r.path}{r.key.includes('(') ? ` ${r.key.slice(r.key.indexOf('('))}` : ''}</code>
                  <span className="tnum text-xs text-ink-3">{r.ms === null ? '' : `${r.ms} ms`}</span>
                </div>
                {r.ok !== true && <p className={cn('ml-6 mt-0.5 text-xs', r.ok === false ? 'text-bad' : 'text-ink-3')}>{r.detail}{r.issues.slice(0, 3).map((i) => <span key={i.path} className="block font-mono">{i.path}: {i.message}</span>)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

const SCENARIO_TEXT: Record<(typeof TEST_SCENARIOS)[number], { title: string; text: string }> = {
  full_win: { title: 'Full win', text: 'Booked, call done, proposal approved, opened, accepted and paid. Checks the whole happy path and the totals.' },
  no_show_rebook: { title: 'No-show and rebook', text: 'The prospect misses the call. Checks the no-show stage and the rebooking message.' },
  proposal_ignored: { title: 'Proposal ignored', text: 'A proposal is sent and never opened. Checks the nudge timing.' },
  declined: { title: 'Declined', text: 'The prospect declines. Checks the loss and the recorded reason.' },
  multi_version: { title: 'Several versions', text: 'Changes are requested twice. Checks that versions 1 to 3 are kept and only the last is sent.' },
  cleanup: { title: 'Clean up', text: 'Deletes every test deal, prospect and log row the scenarios created.' },
};
interface Run { scenario: string; status: 'running' | 'done' | 'error'; res?: TestResponse; error?: string }

function TestRunner() {
  const qc = useQueryClient();
  const [runs, setRuns] = useState<Run[]>([]);
  const [confirm, setConfirm] = useState<'all' | (typeof TEST_SCENARIOS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const exec = async (list: (typeof TEST_SCENARIOS)[number][]) => {
    setBusy(true); setRuns(list.map((s) => ({ scenario: s, status: 'running' as const })).slice(0, 1));
    const out: Run[] = [];
    for (const s of list) {
      setRuns([...out, { scenario: s, status: 'running' }]);
      try { const res = (await apiPost('test', { scenario: s })) as TestResponse; out.push({ scenario: s, status: 'done', res }); }
      catch (e) { out.push({ scenario: s, status: 'error', error: e instanceof ApiError ? e.message : 'Failed' }); setRuns([...out]); break; }
      setRuns([...out]);
    }
    setBusy(false); setConfirm(null);
    ['deals', 'calls', 'proposals', 'overview', 'winrate', 'sla'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const bad = out.filter((r) => r.status === 'error' || (r.res && 'status' in r.res && r.res.status === 'checks_failed')).length;
    if (bad) toast.error(`${bad} scenario${bad > 1 ? 's' : ''} did not pass. Open the results below.`); else toast.success('All scenarios passed.');
  };
  return (
    <Section icon={<FlaskConical className="size-4" />} title="Test runner" hint="Runs a fake deal book through the real endpoints. Test deals are marked as tests, hidden from real numbers, and messages are simulated, never sent."
      action={<div className="flex gap-2"><Button variant="primary" loading={busy} onClick={() => setConfirm('all')}>Run all, then clean up</Button></div>}>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {TEST_SCENARIOS.map((s) => (
          <li key={s} className="flex flex-col rounded-xl border border-border p-3">
            <p className="text-sm font-semibold text-ink">{SCENARIO_TEXT[s].title}</p><p className="mt-0.5 flex-1 text-xs text-ink-3">{SCENARIO_TEXT[s].text}</p>
            <Button size="sm" variant="secondary" className="mt-2 self-start" disabled={busy} onClick={() => setConfirm(s)}>{s === 'cleanup' ? 'Clean up' : 'Run'}</Button>
          </li>
        ))}
      </ul>
      {runs.length > 0 && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <h3 className="text-[13px] font-semibold text-ink">Results</h3>
          {runs.map((r) => <RunResult key={r.scenario} run={r} />)}
        </div>
      )}
      <ConfirmDialog open={confirm !== null} onOpenChange={(o) => !o && !busy && setConfirm(null)} pending={busy} confirmLabel={confirm === 'all' ? 'Run all scenarios' : confirm === 'cleanup' ? 'Delete test data' : 'Run scenario'}
        tone={confirm === 'cleanup' ? 'danger' : 'primary'} title={confirm === 'all' ? 'Run every scenario, then clean up?' : confirm === 'cleanup' ? 'Delete all test data?' : `Run “${confirm ? SCENARIO_TEXT[confirm].title : ''}”?`}
        description={confirm === 'cleanup' ? 'Removes every row marked as a test. Real deals are not touched.' : 'This writes test deals into your database through the real endpoints (marked as tests, hidden from your numbers). Messages are simulated.'}
        onConfirm={() => exec(confirm === 'all' ? [...TEST_SCENARIOS] : [confirm as (typeof TEST_SCENARIOS)[number]])} />
    </Section>
  );
}

function RunResult({ run }: { run: Run }) {
  const res = run.res;
  const scenario = res && 'result' in res ? res.result : null;
  const ok = run.status === 'done' && (res && 'status' in res ? res.status === 'ok' : true);
  return (
    <div className={cn('rounded-xl border p-3 text-[13px]', run.status === 'running' ? 'border-border' : ok ? 'border-good/30 bg-good-soft/50' : 'border-bad/30 bg-bad-soft/60')}>
      <div className="flex items-center gap-2">
        {run.status === 'running' ? <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /> : ok ? <CheckCircle2 className="size-4 text-good" aria-hidden /> : <XCircle className="size-4 text-bad" aria-hidden />}
        <strong className="text-ink">{SCENARIO_TEXT[run.scenario as keyof typeof SCENARIO_TEXT]?.title ?? run.scenario}</strong>
        <span className="text-ink-3">{run.status === 'running' ? 'running…' : run.status === 'error' ? 'failed' : ok ? 'passed' : 'some checks failed'}</span>
      </div>
      {run.error && <p className="mt-1 text-bad">{run.error}</p>}
      {res && 'deleted' in res && <p className="mt-1 text-ink-2">Deleted {Object.entries(res.deleted).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace('_deleted', '')}`).join(', ') || 'nothing (already clean)'}.</p>}
      {scenario && (
        <details className="mt-1.5"><summary className="cursor-pointer text-ink-2">{scenario.checks.filter((c) => c.pass).length} of {scenario.checks.length} checks passed · {scenario.steps.length} steps</summary>
          <ul className="mt-1.5 space-y-1">{scenario.checks.map((c) => <li key={c.name} className="flex items-start gap-2">{c.pass ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-label="pass" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-bad" aria-label="fail" />}<span className="text-ink-2">{c.name}{!c.pass && <span className="block font-mono text-xs text-bad">expected {JSON.stringify(c.expected)}, got {JSON.stringify(c.actual)}</span>}</span></li>)}</ul>
          <p className="mt-1.5 font-mono text-[11px] text-ink-3">{scenario.steps.map((s) => `${s.step}:${s.http_status}`).join(' → ')}</p></details>
      )}
    </div>
  );
}

function Logs() {
  const [type, setType] = useState<'event' | 'error'>('error');
  const [page, setPage] = useState(1);
  const q = useApi('logs', { type, page, page_size: 15 }, { placeholderData: keepPreviousData });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.page_size)) : 1;
  return (
    <Section icon={<CircleSlash className="size-4" />} title="Logs" hint="Errors are anything the workflow could not do. Events are the routine things it did.">
      <Tabs value={type} onValueChange={(v) => { setType(v as 'event' | 'error'); setPage(1); }}>
        <TabsList aria-label="Log type"><TabsTrigger value="error">Errors</TabsTrigger><TabsTrigger value="event">Events</TabsTrigger></TabsList>
        <TabsContent value={type}>
          {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data!.data.length ? <EmptyState title={type === 'error' ? 'No errors recorded' : 'No events recorded'} hint={type === 'error' ? 'That is the good outcome.' : undefined} /> : (
            <>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {q.data!.data.map((l) => (
                  <li key={`${l.kind}${l.id}`} className="px-3 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-baseline gap-x-2"><span className={cn('font-medium', l.kind === 'error' ? 'text-bad' : 'text-ink')}>{l.source ?? '—'}</span><span className="text-ink-3" title={formatIst(l.created_at)}>{relativeTime(l.created_at)}</span>{l.execution_id && <span className="font-mono text-xs text-ink-3">execution {l.execution_id}</span>}{l.is_test && <Badge tone="info">test</Badge>}</div>
                    <p className="mt-0.5 break-words text-ink-2">{l.title}</p>
                    {l.payload != null && <details className="mt-1"><summary className="cursor-pointer text-xs text-accent">Details</summary><pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-[11px] text-ink-2">{typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload, null, 2)}</pre></details>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-3"><span className="tnum">{q.data!.meta.total} entries · page {page} of {pages}</span><div className="flex gap-1.5"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Older</Button></div></div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Section>
  );
}

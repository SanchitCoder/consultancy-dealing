'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskConical, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FieldError, Hint, Input, Label } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ownerSchema = z.object({ password: z.string().min(1, 'Enter the owner password') });
const consultantSchema = z.object({ email: z.string().min(3, 'Enter your work email').refine((v) => v.includes('@'), 'That does not look like an email'), code: z.string().min(4, 'Enter your sign-in code') });

interface Demo { ownerPassword: string | null; consultants: { name: string; email: string; code: string }[] }

function useLogin(next: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const submit = async (payload: Record<string, string>) => {
    setError(null);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { router.replace(next); router.refresh(); return; }
    setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not sign in.');
  };
  return { error, submit };
}

function OwnerForm({ next, demo }: { next: string; demo: Demo | null }) {
  const { error, submit } = useLogin(next);
  const f = useForm<z.infer<typeof ownerSchema>>({ resolver: zodResolver(ownerSchema), defaultValues: { password: '' } });
  return (
    <form onSubmit={f.handleSubmit((v) => submit({ role: 'owner', ...v }))} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="pw">Owner password</Label>
        <Input id="pw" type="password" autoComplete="current-password" autoFocus {...f.register('password')} aria-invalid={!!f.formState.errors.password} />
        <FieldError>{f.formState.errors.password?.message}</FieldError>
        {demo?.ownerPassword && <Hint>Sample data mode. Password: <code className="font-mono text-ink-2">{demo.ownerPassword}</code></Hint>}
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={f.formState.isSubmitting}>Sign in as owner</Button>
    </form>
  );
}

function ConsultantForm({ next, demo }: { next: string; demo: Demo | null }) {
  const { error, submit } = useLogin(next);
  const f = useForm<z.infer<typeof consultantSchema>>({ resolver: zodResolver(consultantSchema), defaultValues: { email: '', code: '' } });
  return (
    <form onSubmit={f.handleSubmit((v) => submit({ role: 'consultant', ...v }))} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="em">Work email</Label>
        <Input id="em" type="email" autoComplete="username" {...f.register('email')} aria-invalid={!!f.formState.errors.email} />
        <FieldError>{f.formState.errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="cd">Sign-in code</Label>
        <Input id="cd" autoComplete="one-time-code" placeholder="abcd-1234" {...f.register('code')} aria-invalid={!!f.formState.errors.code} />
        <FieldError>{f.formState.errors.code?.message}</FieldError>
        <Hint>Your owner can see your code on the Consultants page.</Hint>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={f.formState.isSubmitting}>Sign in</Button>
      {demo && (
        <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
          <p className="mb-1.5 font-medium text-ink">Sample consultants</p>
          <ul className="space-y-1">
            {demo.consultants.map((c) => (
              <li key={c.email}>
                <button type="button" className="w-full rounded px-1 py-0.5 text-left hover:bg-surface-3" onClick={() => { f.setValue('email', c.email); f.setValue('code', c.code); }}>
                  {c.name}: <span className="font-mono">{c.email}</span> · <span className="font-mono">{c.code}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-ink-3">Click one to fill the form.</p>
        </div>
      )}
    </form>
  );
}

export function LoginForm({ next, demo }: { next: string; demo: Demo | null }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-xl bg-ink text-bg" aria-hidden><Star className="size-6 fill-current" /></span>
          <h1 className="display text-3xl font-semibold text-ink">Northstar Growth Partners</h1>
          <p className="mt-1.5 text-sm text-ink-2">Calls, proposals and win rates in one calm place.</p>
          {demo && <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn"><FlaskConical className="size-3.5" aria-hidden />Sample data</span>}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <Tabs defaultValue="owner">
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="owner" className="justify-center">Owner</TabsTrigger><TabsTrigger value="consultant" className="justify-center">Consultant</TabsTrigger></TabsList>
            <TabsContent value="owner"><OwnerForm next={next} demo={demo} /></TabsContent>
            <TabsContent value="consultant"><ConsultantForm next={next} demo={demo} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

'use client';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProposalRow } from '@/contracts/deal-api';
import { ApproveSendButton, RequestChangesButton } from './proposal-actions';

/** Preview link + the two decisions every drafted proposal needs. */
export function ProposalActionsRow({ proposal, compact }: { proposal: ProposalRow; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {proposal.doc_url && (
        <Button asChild size="sm" variant="ghost"><a href={proposal.doc_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="size-3.5" aria-hidden />{compact ? 'Preview' : 'Open preview'}<span className="sr-only"> (opens Google Docs)</span></a></Button>
      )}
      {!compact && <RequestChangesButton proposal={proposal} />}
      <ApproveSendButton proposal={proposal} />
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type FounderDeleteCandidate = {
  id: string;
  name: string;
  ownerEmail: string | null;
  isTestDemo: boolean;
  isArchived: boolean;
  deleteEligible: boolean;
  deleteBlockedReason: string | null;
};

export function FounderDeleteBusinessCard({
  candidates,
  deleteAction,
}: {
  candidates: FounderDeleteCandidate[];
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedBusinessId, setSelectedBusinessId] = useState(candidates[0]?.id || '');
  const [confirmationName, setConfirmationName] = useState('');

  const selectedBusiness = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedBusinessId) || null,
    [candidates, selectedBusinessId]
  );
  const exactNameMatch = Boolean(selectedBusiness && confirmationName === selectedBusiness.name);

  useEffect(() => {
    setConfirmationName('');
  }, [selectedBusinessId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-xl border bg-background/80 p-4 text-sm">
        <div className="space-y-2">
          <Label htmlFor="founderDeleteBusinessId">Choose a business</Label>
          <Select
            id="founderDeleteBusinessId"
            onChange={(event) => setSelectedBusinessId(event.currentTarget.value)}
            value={selectedBusinessId}
          >
            {candidates.length === 0 ? <option value="">No businesses available</option> : null}
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </div>

        {selectedBusiness ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-foreground">{selectedBusiness.name}</p>
              <Badge variant={selectedBusiness.isTestDemo ? 'outline' : 'secondary'}>
                {selectedBusiness.isTestDemo ? 'Test/demo' : 'Real customer'}
              </Badge>
              <Badge variant={selectedBusiness.isArchived ? 'outline' : 'secondary'}>
                {selectedBusiness.isArchived ? 'Archived' : 'Active'}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">Owner email</p>
                <p className="mt-1 text-muted-foreground">{selectedBusiness.ownerEmail || 'Owner email missing'}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Delete policy</p>
                <p className="mt-1 text-muted-foreground">
                  {selectedBusiness.deleteEligible
                    ? 'Hard delete test/demo businesses only.'
                    : selectedBusiness.isTestDemo
                      ? 'Archive this workspace first.'
                      : 'Archive real customers instead.'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
              Deletion is permanent. This removes the business and its business-owned records through the existing schema cascades.
            </div>
          </div>
        ) : (
          <p className="mt-4 text-muted-foreground">Select a business to review its delete safety details.</p>
        )}
      </div>

      <form action={deleteAction} className="rounded-xl border border-destructive/30 bg-background/80 p-4 text-sm">
        <input name="businessId" type="hidden" value={selectedBusiness?.id || ''} />
        <input name="returnTo" type="hidden" value="/admin" />

        <div className="space-y-2">
          <Label htmlFor="founderDeleteBusinessConfirmation">Type the exact business name</Label>
          <Input
            autoComplete="off"
            disabled={!selectedBusiness}
            id="founderDeleteBusinessConfirmation"
            name="confirmationName"
            onChange={(event) => setConfirmationName(event.currentTarget.value)}
            placeholder={selectedBusiness?.name || 'Choose a business first'}
            value={confirmationName}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          The delete button unlocks only when the typed name matches exactly. Archive real customers. Hard delete test/demo businesses only.
        </p>

        {selectedBusiness && !selectedBusiness.deleteEligible ? (
          <p className="mt-3 text-xs text-destructive">
            {selectedBusiness.deleteBlockedReason || 'Hard delete stays locked for this business.'}
          </p>
        ) : null}

        <Button
          className="mt-4"
          disabled={!selectedBusiness || !selectedBusiness.deleteEligible || !exactNameMatch}
          type="submit"
          variant="destructive"
        >
          Delete this business
        </Button>
      </form>
    </div>
  );
}

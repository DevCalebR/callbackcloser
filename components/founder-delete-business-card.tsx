'use client';

import { useEffect, useState } from 'react';

import {
  getPermanentDeleteButtonLabel,
  getPermanentDeleteWarningText,
  PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE,
  REAL_CUSTOMER_DELETE_CONFIRMATION,
} from '@/lib/admin-business-delete';
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
  ownerClerkId: string;
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
  const [realCustomerConfirmation, setRealCustomerConfirmation] = useState('');

  const selectedBusiness = candidates.find((candidate) => candidate.id === selectedBusinessId) || null;
  const requiresPhrase = selectedBusiness ? !selectedBusiness.isTestDemo : false;
  const exactNameMatch = Boolean(selectedBusiness && confirmationName === selectedBusiness.name);
  const phraseMatch = !requiresPhrase || realCustomerConfirmation.trim() === REAL_CUSTOMER_DELETE_CONFIRMATION;

  useEffect(() => {
    setConfirmationName('');
    setRealCustomerConfirmation('');
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
                  {selectedBusiness.isTestDemo
                    ? 'Archive first when possible, then permanently delete if you need a full cleanup.'
                    : 'Archive is safer for churn or cancellation. Permanent delete stays available only with the real-customer phrase.'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <p>{getPermanentDeleteWarningText({ ...selectedBusiness, isTestBusiness: selectedBusiness.isTestDemo })}</p>
              <p className="mt-2">{PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE}</p>
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

        {requiresPhrase ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="founderDeleteBusinessPhrase">Type {REAL_CUSTOMER_DELETE_CONFIRMATION}</Label>
            <Input
              autoComplete="off"
              disabled={!selectedBusiness}
              id="founderDeleteBusinessPhrase"
              name="realCustomerConfirmation"
              onChange={(event) => setRealCustomerConfirmation(event.currentTarget.value)}
              placeholder={REAL_CUSTOMER_DELETE_CONFIRMATION}
              value={realCustomerConfirmation}
            />
          </div>
        ) : null}

        <p className="mt-3 text-xs text-muted-foreground">
          The delete button unlocks only when the typed name matches exactly. Real customers also require the explicit founder phrase.
        </p>

        <Button
          className="mt-4"
          disabled={!selectedBusiness || !exactNameMatch || !phraseMatch}
          type="submit"
          variant="destructive"
        >
          {selectedBusiness ? getPermanentDeleteButtonLabel({ ...selectedBusiness, isTestBusiness: selectedBusiness.isTestDemo }) : 'Delete permanently'}
        </Button>
      </form>
    </div>
  );
}

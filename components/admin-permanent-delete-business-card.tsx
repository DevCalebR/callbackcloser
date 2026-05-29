'use client';

import { useState } from 'react';

import {
  getPermanentDeleteButtonLabel,
  getPermanentDeleteWarningText,
  PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE,
  REAL_CUSTOMER_DELETE_CONFIRMATION,
  requiresRealCustomerDeleteConfirmation,
  type PermanentDeleteBusinessCandidate,
} from '@/lib/admin-business-delete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PermanentDeleteBusinessCardProps = {
  business: PermanentDeleteBusinessCandidate & {
    id: string;
    archivedAt: Date | null;
    ownerEmail?: string | null;
  };
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
};

export function AdminPermanentDeleteBusinessCard({
  business,
  action,
  returnTo,
}: PermanentDeleteBusinessCardProps) {
  const [confirmationName, setConfirmationName] = useState('');
  const [realCustomerConfirmation, setRealCustomerConfirmation] = useState('');

  const requiresPhrase = requiresRealCustomerDeleteConfirmation(business);
  const exactNameMatch = confirmationName === business.name;
  const phraseMatch = !requiresPhrase || realCustomerConfirmation.trim() === REAL_CUSTOMER_DELETE_CONFIRMATION;
  const deleteLabel = getPermanentDeleteButtonLabel(business);

  return (
    <form action={action} className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <input name="businessId" type="hidden" value={business.id} />
      <input name="returnTo" type="hidden" value={returnTo} />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-foreground">{business.name}</p>
        <Badge variant={business.isTestBusiness ? 'outline' : 'secondary'}>
          {business.isTestBusiness ? 'Test/demo' : 'Real customer'}
        </Badge>
        <Badge variant={business.archivedAt ? 'outline' : 'secondary'}>{business.archivedAt ? 'Archived' : 'Live or in setup'}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="font-medium text-foreground">Owner email</p>
          <p className="mt-1 text-muted-foreground">{business.ownerEmail || 'Owner email missing'}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Safety guidance</p>
          <p className="mt-1 text-muted-foreground">
            {requiresPhrase ? 'Archive is safer for churn, cancellation, and pauses.' : 'Use this for permanent test/demo cleanup only when needed.'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-destructive/20 bg-background/80 p-3 text-xs text-muted-foreground">
        <p>{getPermanentDeleteWarningText(business)}</p>
        <p className="mt-2">{PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE}</p>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor={`delete-business-name-${business.id}`}>Type the exact business name</Label>
        <Input
          autoComplete="off"
          id={`delete-business-name-${business.id}`}
          name="confirmationName"
          onChange={(event) => setConfirmationName(event.currentTarget.value)}
          placeholder={business.name}
          value={confirmationName}
        />
      </div>

      {requiresPhrase ? (
        <div className="mt-4 space-y-2">
          <Label htmlFor={`delete-business-phrase-${business.id}`}>Type {REAL_CUSTOMER_DELETE_CONFIRMATION}</Label>
          <Input
            autoComplete="off"
            id={`delete-business-phrase-${business.id}`}
            name="realCustomerConfirmation"
            onChange={(event) => setRealCustomerConfirmation(event.currentTarget.value)}
            placeholder={REAL_CUSTOMER_DELETE_CONFIRMATION}
            value={realCustomerConfirmation}
          />
        </div>
      ) : null}

      <Button className="mt-4" disabled={!exactNameMatch || !phraseMatch} type="submit" variant="destructive">
        {deleteLabel}
      </Button>
    </form>
  );
}

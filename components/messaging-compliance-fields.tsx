'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Option = {
  value: string;
  label: string;
};

type MessagingComplianceFieldsProps = {
  idPrefix: string;
  initialMessagingComplianceType: string;
  initialManagedTwilioStatus: string;
  initialA2pCustomerProfileSid: string;
  initialA2pBrandSid: string;
  initialA2pCampaignSid: string;
  initialA2pFailureReason: string;
  initialTollFreeVerificationStatus: string;
  initialTollFreeVerificationSid: string;
  initialTollFreeVerificationNote: string;
  complianceTypeOptions: Option[];
  managedTwilioStatusOptions: Option[];
  tollFreeVerificationStatusOptions: Option[];
  showSubmitButton?: boolean;
  submitButtonVariant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost';
};

export function MessagingComplianceFields({
  idPrefix,
  initialMessagingComplianceType,
  initialManagedTwilioStatus,
  initialA2pCustomerProfileSid,
  initialA2pBrandSid,
  initialA2pCampaignSid,
  initialA2pFailureReason,
  initialTollFreeVerificationStatus,
  initialTollFreeVerificationSid,
  initialTollFreeVerificationNote,
  complianceTypeOptions,
  managedTwilioStatusOptions,
  tollFreeVerificationStatusOptions,
  showSubmitButton = false,
  submitButtonVariant = 'outline',
}: MessagingComplianceFieldsProps) {
  const [complianceType, setComplianceType] = useState(initialMessagingComplianceType);
  const submitLabel =
    complianceType === 'LOCAL_A2P'
      ? 'Save A2P status'
      : complianceType === 'TOLL_FREE_VERIFICATION'
        ? 'Save toll-free verification status'
        : 'Save messaging compliance status';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}MessagingComplianceType`}>Number type</Label>
        <Select
          defaultValue={initialMessagingComplianceType}
          id={`${idPrefix}MessagingComplianceType`}
          name="messagingComplianceType"
          onChange={(event) => setComplianceType(event.target.value)}
        >
          {complianceTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className={cn('contents', complianceType === 'LOCAL_A2P' ? '' : 'hidden')}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}ManagedTwilioStatus`}>A2P status</Label>
          <Select defaultValue={initialManagedTwilioStatus} id={`${idPrefix}ManagedTwilioStatus`} name="managedTwilioStatus">
            {managedTwilioStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}A2pCustomerProfileSid`}>Customer profile SID</Label>
          <Input defaultValue={initialA2pCustomerProfileSid} id={`${idPrefix}A2pCustomerProfileSid`} name="a2pCustomerProfileSid" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}A2pBrandSid`}>Brand SID</Label>
          <Input defaultValue={initialA2pBrandSid} id={`${idPrefix}A2pBrandSid`} name="a2pBrandSid" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}A2pCampaignSid`}>Campaign SID</Label>
          <Input defaultValue={initialA2pCampaignSid} id={`${idPrefix}A2pCampaignSid`} name="a2pCampaignSid" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}A2pFailureReason`}>A2P blocker note</Label>
          <Textarea
            defaultValue={initialA2pFailureReason}
            id={`${idPrefix}A2pFailureReason`}
            name="a2pFailureReason"
            placeholder="Record why launch is blocked, pending, or approved."
          />
        </div>
      </div>

      <div className={cn('contents', complianceType === 'TOLL_FREE_VERIFICATION' ? '' : 'hidden')}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}TollFreeVerificationStatus`}>Toll-free verification status</Label>
          <Select
            defaultValue={initialTollFreeVerificationStatus}
            id={`${idPrefix}TollFreeVerificationStatus`}
            name="tollFreeVerificationStatus"
          >
            {tollFreeVerificationStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}TollFreeVerificationSid`}>Toll-free verification SID</Label>
          <Input
            defaultValue={initialTollFreeVerificationSid}
            id={`${idPrefix}TollFreeVerificationSid`}
            name="tollFreeVerificationSid"
            placeholder="Verification SID"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}TollFreeVerificationNote`}>Toll-free blocker note</Label>
          <Textarea
            defaultValue={initialTollFreeVerificationNote}
            id={`${idPrefix}TollFreeVerificationNote`}
            name="tollFreeVerificationNote"
            placeholder="Record why verification is pending, blocked, or approved."
          />
        </div>
      </div>

      <div className={cn('md:col-span-2', complianceType === 'UNKNOWN' ? '' : 'hidden')}>
        <p className="rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Choose number type before messaging compliance can be evaluated.
        </p>
      </div>

      {showSubmitButton ? (
        <div className="md:col-span-2">
          <Button size="sm" type="submit" variant={submitButtonVariant}>
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

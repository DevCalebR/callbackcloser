import { BusinessProvisioningStatus } from '@prisma/client';

export const customerSetupStatusLabels: Record<BusinessProvisioningStatus, string> = {
  DRAFT: 'Pending setup',
  ONBOARDING: 'Setup in progress',
  NEEDS_ATTENTION: 'Needs attention',
  LIVE: 'Live',
  PAUSED: 'Paused',
};

export function shouldShowCustomerSetupWaitingPage(status: BusinessProvisioningStatus) {
  return status === BusinessProvisioningStatus.DRAFT || status === BusinessProvisioningStatus.ONBOARDING;
}

export function shouldShowCustomerWorkspaceNotice(status: BusinessProvisioningStatus) {
  return status === BusinessProvisioningStatus.NEEDS_ATTENTION || status === BusinessProvisioningStatus.PAUSED;
}

export function getCustomerSetupStatusDetail(status: BusinessProvisioningStatus) {
  switch (status) {
    case BusinessProvisioningStatus.DRAFT:
      return 'We have your account and are preparing the first setup steps for your business.';
    case BusinessProvisioningStatus.ONBOARDING:
      return 'We are connecting your missed-call recovery flow and running the launch checks for you.';
    case BusinessProvisioningStatus.NEEDS_ATTENTION:
      return 'Your workspace is saved, but we need a founder follow-up before everything can stay fully active.';
    case BusinessProvisioningStatus.PAUSED:
      return 'Missed-call recovery is paused while we work through a support or launch issue.';
    case BusinessProvisioningStatus.LIVE:
    default:
      return 'Your missed-call recovery system is live and ready to capture leads.';
  }
}

export function getCustomerWorkspaceNotice(status: BusinessProvisioningStatus) {
  if (status === BusinessProvisioningStatus.NEEDS_ATTENTION) {
    return {
      title: 'Support follow-up is in progress',
      detail: 'We found something that needs attention. Your dashboard is still available, and we will follow up directly if anything needs your approval.',
      variant: 'destructive' as const,
    };
  }

  if (status === BusinessProvisioningStatus.PAUSED) {
    return {
      title: 'Automation is paused',
      detail: 'Your workspace is still available, but missed-call recovery is paused until support clears the current issue.',
      variant: 'outline' as const,
    };
  }

  return null;
}

export function isGenericManagedSetupBusinessName(name: string | null | undefined) {
  const value = name?.trim().toLowerCase() || '';
  return value === '' || value === 'new callbackcloser signup';
}

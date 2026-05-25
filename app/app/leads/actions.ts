'use server';

import { LeadStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireBusiness } from '@/lib/auth';
import { updateLeadStatusForBusiness } from '@/lib/business-access';
import { leadStatusSchema } from '@/lib/validators';

function resolveSafeAppRedirect(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const nextPath = value.trim();
  if (!nextPath.startsWith('/app/') || nextPath.startsWith('//')) return fallback;
  return nextPath;
}

export async function updateLeadStatusAction(formData: FormData) {
  const fallbackPath = '/app/leads';
  const redirectTo = resolveSafeAppRedirect(formData.get('redirectTo'), fallbackPath);
  const successRedirectTo = resolveSafeAppRedirect(formData.get('successRedirectTo'), redirectTo);

  const business = await requireBusiness();
  const parsed = leadStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=Invalid%20status`);
  }

  const lead = await updateLeadStatusForBusiness({
    businessId: business.id,
    leadId: parsed.data.leadId,
    status: parsed.data.status as LeadStatus,
  });
  if (!lead) {
    redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=Lead%20not%20found`);
  }

  revalidatePath('/app/leads');
  revalidatePath('/app');
  revalidatePath('/app/conversations');
  revalidatePath(`/app/leads/${lead.id}`);
  redirect(`${successRedirectTo}${successRedirectTo.includes('?') ? '&' : '?'}saved=1`);
}

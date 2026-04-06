'use server';

import { LeadStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { leadStatusSchema } from '@/lib/validators';

function resolveSafeAppRedirect(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const nextPath = value.trim();
  if (!nextPath.startsWith('/app/') || nextPath.startsWith('//')) return fallback;
  return nextPath;
}

export async function updateLeadStatusAction(formData: FormData) {
  const business = await requireBusiness();
  const parsed = leadStatusSchema.safeParse(Object.fromEntries(formData));
  const fallbackPath = '/app/leads';
  const redirectTo = resolveSafeAppRedirect(formData.get('redirectTo'), fallbackPath);
  if (!parsed.success) {
    redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=Invalid%20status`);
  }

  const lead = await db.lead.findFirst({ where: { id: parsed.data.leadId, businessId: business.id } });
  if (!lead) {
    redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=Lead%20not%20found`);
  }

  await db.lead.update({
    where: { id: lead.id },
    data: {
      status: parsed.data.status as LeadStatus,
      lastInteractionAt: new Date(),
    },
  });

  revalidatePath('/app/leads');
  revalidatePath('/app/conversations');
  revalidatePath(`/app/leads/${lead.id}`);
  redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}saved=1`);
}

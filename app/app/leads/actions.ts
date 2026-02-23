'use server';

import { LeadStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { leadStatusSchema } from '@/lib/validators';

export async function updateLeadStatusAction(formData: FormData) {
  const business = await requireBusiness();
  const parsed = leadStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect('/app/leads?error=Invalid%20status');
  }

  const lead = await db.lead.findFirst({ where: { id: parsed.data.leadId, businessId: business.id } });
  if (!lead) {
    redirect('/app/leads?error=Lead%20not%20found');
  }

  await db.lead.update({
    where: { id: lead.id },
    data: {
      status: parsed.data.status as LeadStatus,
      lastInteractionAt: new Date(),
    },
  });

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${lead.id}`);
  redirect(`/app/leads/${lead.id}?saved=1`);
}

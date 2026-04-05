# CallbackCloser Backend Code Proof
**Selected server-side excerpts from a production-style SaaS application**

These excerpts were chosen to show the backend work clients usually care about most: Stripe webhook handling, server-side auth/account enforcement, and protected data access. The application uses Clerk for auth, Stripe for billing, Twilio for communications, and Prisma/Postgres for persisted state.

## 1. Billing / Webhook / Subscription Logic
**Why this matters:** Reliable billing systems depend on signed server-side webhooks, not client-side billing flags.

**File path:** `app/api/stripe/webhook/route.ts`

This code verifies the Stripe webhook signature, maps Stripe entities back to the correct business record, and updates stored subscription state from trusted server-side events.

```ts
async function upsertBusinessSubscriptionFromSubscription(subscription: Stripe.Subscription) {
  const metadataBusinessId = subscription.metadata?.businessId || undefined;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const priceId = subscription.items.data[0]?.price?.id || null;

  const business = metadataBusinessId
    ? await db.business.findUnique({ where: { id: metadataBusinessId } })
    : customerId
      ? await db.business.findUnique({ where: { stripeCustomerId: customerId } })
      : null;

  if (!business) return;

  await db.business.update({
    where: { id: business.id },
    data: {
      stripeCustomerId: customerId ?? business.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
      subscriptionStatusUpdatedAt: new Date(),
    },
  });
}

const payload = await request.text();
const event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);

switch (event.type) {
  case 'checkout.session.completed':
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    break;
  case 'customer.subscription.created':
  case 'customer.subscription.updated':
  case 'customer.subscription.deleted':
    await upsertBusinessSubscriptionFromSubscription(event.data.object as Stripe.Subscription);
    break;
}
```

**What this proves:** Signed webhook handling, subscription reconciliation, and database-backed billing state management.

## 2. Auth / Session / Account-State Logic
**Why this matters:** A real app must enforce both identity and account readiness before protected features run.

**File path:** `lib/auth.ts`

This helper layer resolves the signed-in Clerk user, then binds that session to the product’s `Business` account record. If the account is not fully set up yet, the user is routed into onboarding instead of being allowed into the protected app.

```ts
export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return { userId };
}

export async function requireBusiness() {
  const { userId } = await requireAuth();
  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    redirect('/app/onboarding');
  }
  return business;
}
```

**What this proves:** Server-side session enforcement tied to application account state, not just a front-end login check.

## 3. Protected Backend / Permissions / Data Access
**Why this matters:** Sensitive data should be permission-checked on the server and never exposed directly from third-party systems.

**File path:** `app/api/leads/[leadId]/recording/route.ts`

This route protects call recordings by validating the signed-in user, confirming the lead belongs to that user’s business, then fetching the Twilio recording server-side instead of exposing the source URL directly.

```ts
const lead = await db.lead.findUnique({
  where: { id: params.leadId },
  select: {
    id: true,
    business: { select: { ownerClerkId: true } },
    call: { select: { recordingUrl: true } },
  },
});

if (!lead) {
  return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
}

const accessReason = resolveRecordingAccessReason({
  requestUserId: userId,
  businessOwnerClerkId: lead.business.ownerClerkId,
  recordingUrl: lead.call?.recordingUrl ?? null,
});

if (accessReason === 'wrong_business') {
  return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
}
if (accessReason !== 'ok') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const mediaUrl = getTwilioRecordingMediaUrl(lead.call!.recordingUrl!);
const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const twilioResponse = await fetch(mediaUrl.toString(), {
  headers: {
    Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
  },
  cache: 'no-store',
});
```

**What this proves:** Ownership checks, secure resource proxying, and protected server-side data flow design.

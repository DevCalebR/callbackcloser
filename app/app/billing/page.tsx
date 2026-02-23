import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';

function planPrice(priceId: string | undefined) {
  return priceId ? 'Configured via Stripe Price ID' : 'Missing env var';
}

export default async function BillingPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const starterPriceId = process.env.STRIPE_PRICE_STARTER;
  const proPriceId = process.env.STRIPE_PRICE_PRO;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const checkout = typeof searchParams?.checkout === 'string' ? searchParams.checkout : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Stripe subscriptions control whether new missed-call leads receive automated SMS follow-up.</p>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {checkout === 'success' ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Stripe checkout completed. Webhook sync may take a few seconds.</div> : null}
      {checkout === 'canceled' ? <div className="rounded-md border bg-muted/40 p-3 text-sm">Checkout canceled.</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>Status synced from Stripe webhook events.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={business.subscriptionStatus === 'ACTIVE' ? 'success' : 'outline'}>
            {business.subscriptionStatus.toLowerCase()}
          </Badge>
          {business.stripeCustomerId ? <span className="text-muted-foreground">Customer: {business.stripeCustomerId}</span> : null}
          {business.stripeSubscriptionId ? <span className="text-muted-foreground">Subscription: {business.stripeSubscriptionId}</span> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Starter</CardTitle>
            <CardDescription>Basic missed-call SMS follow-up and dashboard access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{planPrice(starterPriceId)}</p>
            <p className="text-muted-foreground">Uses `STRIPE_PRICE_STARTER`.</p>
          </CardContent>
          <CardFooter>
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={starterPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!starterPriceId}>Subscribe to Starter</Button>
            </form>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>Higher volume and premium support workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{planPrice(proPriceId)}</p>
            <p className="text-muted-foreground">Uses `STRIPE_PRICE_PRO`.</p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={proPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!proPriceId}>Subscribe to Pro</Button>
            </form>
            {business.stripeCustomerId ? (
              <form action="/api/stripe/portal" method="post" className="w-full">
                <Button type="submit" variant="outline" className="w-full">Open Billing Portal</Button>
              </form>
            ) : null}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

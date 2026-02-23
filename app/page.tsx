import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <main className="container flex min-h-screen items-center py-16">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <p className="inline-flex rounded-full border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
            CallbackCloser
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Missed Call to Booked Job with automated SMS follow-up.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            When a customer calls and nobody answers, CallbackCloser texts them instantly, captures the job details, and alerts the owner with a lead summary.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/leads">
              <Button size="lg">Open App</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="lg" variant="outline">
                Create Account
              </Button>
            </Link>
          </div>
        </section>
        <Card className="border-primary/20 bg-white/90 backdrop-blur">
          <CardHeader>
            <CardTitle>How it works</CardTitle>
            <CardDescription>Built for home service businesses using Twilio, Stripe, Clerk, and Prisma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/50 p-4">1. Incoming call hits your Twilio number and forwards to your business line.</div>
            <div className="rounded-lg border bg-muted/50 p-4">2. If unanswered, a lead is created and SMS qualification starts automatically.</div>
            <div className="rounded-lg border bg-muted/50 p-4">3. Owner gets a summary text and can track leads inside the dashboard.</div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

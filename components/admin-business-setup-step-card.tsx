import type { ReactNode } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TwilioSetupStep } from '@/lib/twilio-setup';

function getBadgeVariant(tone: TwilioSetupStep['tone']) {
  if (tone === 'success') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'pending') return 'outline' as const;
  return 'secondary' as const;
}

export function AdminBusinessSetupStepCard({
  step,
  title,
  currentState,
  explanation,
  nextAction,
  instructions,
  verification,
  automaticActions,
  manualEntry,
  open,
  href,
}: {
  step: TwilioSetupStep;
  title: string;
  currentState: string;
  explanation: string;
  nextAction: string;
  instructions: string[];
  verification: string[];
  automaticActions?: ReactNode;
  manualEntry?: ReactNode;
  open?: boolean;
  href: string;
}) {
  return (
    <Card className="bg-card/90" id={`step-${step.key}`}>
      <details className="group" open={open}>
        <summary className="list-none cursor-pointer">
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getBadgeVariant(step.tone)}>{step.stateLabel}</Badge>
                  <code className="rounded bg-background px-2 py-1 text-xs">{step.key}</code>
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{step.detail}</CardDescription>
              </div>
              <Link className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'shrink-0')} href={href}>
                Open step
              </Link>
            </div>
          </CardHeader>
        </summary>
        <CardContent className="space-y-5 border-t pt-6">
          <section className="space-y-2 text-sm">
            <p className="font-medium">Current state</p>
            <p className="text-muted-foreground">{currentState}</p>
          </section>

          <section className="space-y-2 text-sm">
            <p className="font-medium">Why this matters</p>
            <p className="text-muted-foreground">{explanation}</p>
          </section>

          <section className="space-y-2 text-sm">
            <p className="font-medium">What to do next</p>
            <p className="text-muted-foreground">{nextAction}</p>
          </section>

          {automaticActions ? (
            <section className="space-y-3 text-sm">
              <p className="font-medium">Automatic actions</p>
              {automaticActions}
            </section>
          ) : null}

          {manualEntry ? (
            <section className="space-y-3 text-sm">
              <p className="font-medium">Manual fallback / manual entry</p>
              {manualEntry}
            </section>
          ) : null}

          <section className="space-y-2 text-sm">
            <p className="font-medium">Step-by-step</p>
            <ol className="space-y-2 pl-5 text-muted-foreground">
              {instructions.map((instruction) => (
                <li key={instruction} className="list-decimal">
                  {instruction}
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2 text-sm">
            <p className="font-medium">How to verify</p>
            <ul className="space-y-2 text-muted-foreground">
              {verification.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>
        </CardContent>
      </details>
    </Card>
  );
}

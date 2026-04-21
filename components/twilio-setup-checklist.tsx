import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TwilioSetupBanner, TwilioSetupStep, TwilioSetupTone } from '@/lib/twilio-setup';

type StepWithBody = TwilioSetupStep & {
  body?: React.ReactNode;
};

function getBadgeVariant(tone: TwilioSetupTone) {
  if (tone === 'success') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'pending') return 'outline' as const;
  return 'secondary' as const;
}

export function TwilioSetupChecklist({
  title,
  description,
  banner,
  bannerAction,
  steps,
  advanced,
}: {
  title: string;
  description: string;
  banner: TwilioSetupBanner;
  bannerAction?: React.ReactNode;
  steps: StepWithBody[];
  advanced?: React.ReactNode;
}) {
  const completedCount = steps.filter((step) => step.complete).length;

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Badge variant={completedCount === steps.length ? 'success' : 'outline'}>
              {completedCount}/{steps.length} complete
            </Badge>
          </div>
          <div
            className={cn(
              'rounded-xl border p-4',
              banner.tone === 'attention'
                ? 'border-destructive/30 bg-destructive/5'
                : banner.tone === 'success'
                  ? 'border-accent/40 bg-accent/20'
                  : 'bg-background/80'
            )}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getBadgeVariant(banner.tone)}>Next step</Badge>
                  <p className="font-medium">{banner.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{banner.detail}</p>
              </div>
              {bannerAction ? <div className="shrink-0">{bannerAction}</div> : null}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {steps.map((step) => (
          <Card key={step.key} className="bg-card/90">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">{step.label}</CardTitle>
                  <CardDescription>{step.detail}</CardDescription>
                </div>
                <Badge variant={getBadgeVariant(step.tone)}>{step.stateLabel}</Badge>
              </div>
            </CardHeader>
            {step.body ? <CardContent className="pt-0">{step.body}</CardContent> : null}
          </Card>
        ))}
      </div>

      {advanced ? <div className="pt-1">{advanced}</div> : null}
    </div>
  );
}

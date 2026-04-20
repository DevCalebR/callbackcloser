import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatConversionRate, type LeadOutcomeSummary } from '@/lib/lead-outcomes';
import { cn } from '@/lib/utils';

export function LeadConversionSummaryCard({
  summary,
  title = 'Conversion summary',
  description = 'Only the few numbers that show whether missed calls are turning into real jobs.',
  className,
}: {
  summary: LeadOutcomeSummary;
  title?: string;
  description?: string;
  className?: string;
}) {
  const metrics = [
    {
      label: 'Leads',
      value: String(summary.totalLeads),
      href: '/app/leads',
    },
    {
      label: 'Closed',
      value: String(summary.closedLeads),
      href: '/app/leads?status=booked',
    },
    {
      label: 'Lost',
      value: String(summary.lostLeads),
      href: '/app/leads?status=lost',
    },
    {
      label: 'Conversion rate',
      value: formatConversionRate(summary.conversionRate),
    },
  ];

  return (
    <Card className={cn('bg-card/95', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) =>
            metric.href ? (
              <Link key={metric.label} className="rounded-2xl border bg-background/90 p-4 transition-colors hover:bg-muted/20" href={metric.href}>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{metric.value}</p>
              </Link>
            ) : (
              <div key={metric.label} className="rounded-2xl border bg-background/90 p-4">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{metric.value}</p>
              </div>
            ),
          )}
        </div>
        <p className="text-xs text-muted-foreground">Conversion rate = closed leads divided by total missed-call leads.</p>
      </CardContent>
    </Card>
  );
}

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type UpgradeBannerProps = {
  blockedCount: number;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function UpgradeBanner({
  blockedCount,
  title = 'SMS follow-up is paused until billing is active.',
  description,
  ctaLabel = 'Upgrade Now',
  ctaHref = '/app/billing',
}: UpgradeBannerProps) {
  const defaultDescription = `${blockedCount} lead${blockedCount === 1 ? '' : 's'} captured but not contacted automatically.`;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description ?? defaultDescription}</p>
        </div>
        <Link href={ctaHref}>
          <Button>{ctaLabel}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function UpgradeBanner({ blockedCount }: { blockedCount: number }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">SMS follow-up is paused until billing is active.</p>
          <p className="text-sm text-muted-foreground">
            {blockedCount} lead{blockedCount === 1 ? '' : 's'} captured but not contacted automatically.
          </p>
        </div>
        <Link href="/app/billing">
          <Button>Upgrade Now</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

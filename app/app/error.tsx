'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app.route_error_boundary', {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-start justify-center gap-4">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Application Error</p>
        <h1 className="text-3xl font-semibold tracking-tight">The dashboard hit an unexpected error.</h1>
        <p className="text-sm text-muted-foreground">
          Retry the request. If the problem repeats, capture the time and recent action for support.
        </p>
      </div>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}

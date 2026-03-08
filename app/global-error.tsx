'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('app.global_error_boundary', {
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Unexpected Error</p>
            <h1 className="text-3xl font-semibold tracking-tight">CallbackCloser could not finish this request.</h1>
            <p className="text-sm text-muted-foreground">
              Retry once. If the error persists, use the support contact listed on the public legal pages.
            </p>
          </div>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}

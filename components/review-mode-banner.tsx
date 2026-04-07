import Link from 'next/link';

export function ReviewModeBanner() {
  return (
    <div className="border-b border-amber-300/50 bg-amber-50 text-amber-950">
      <div className="container flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">Preview Review Mode — Read Only</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <span>Preview-only demo access is active. Real customer data and write actions stay blocked.</span>
          <Link className="underline underline-offset-4" href="/review-logout">
            Exit review mode
          </Link>
        </div>
      </div>
    </div>
  );
}

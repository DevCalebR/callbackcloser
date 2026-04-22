import type { ReactNode } from 'react';
import type { BusinessOperatorEvent } from '@prisma/client';
import { operatorEventCategoryLabels, operatorEventStatusLabels, type BusinessTimelineFilter } from '@/lib/operator-events';

import {
  getOperatorEventCategoryBadgeVariant,
  getOperatorEventStatusBadgeVariant,
} from '@/lib/admin-operator-visibility';
import { formatDateTime } from '@/lib/lead-presenters';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type TimelineEvent = Pick<
  BusinessOperatorEvent,
  'id' | 'type' | 'category' | 'status' | 'summary' | 'detailsJson' | 'createdAt' | 'relatedEntityType' | 'relatedEntityId'
>;

function formatDetailLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderJsonValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="break-words">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="rounded-md border bg-background/70 p-2">
            {renderJsonValue(item)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => (
          <div key={key} className="rounded-md border bg-background/70 p-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{formatDetailLabel(key)}</p>
            <div className="mt-1 text-sm">{renderJsonValue(nestedValue)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

export function AdminBusinessActivityTimeline({
  events,
  activeFilter,
  filterLinks,
  expanded,
  expandHref,
  collapseHref,
  defaultVisibleCount = 5,
}: {
  events: TimelineEvent[];
  activeFilter: BusinessTimelineFilter;
  filterLinks: Array<{ key: BusinessTimelineFilter; label: string; href: string; count: number }>;
  expanded: boolean;
  expandHref: string | null;
  collapseHref: string | null;
  defaultVisibleCount?: number;
}) {
  const visibleEvents = expanded ? events : events.slice(0, defaultVisibleCount);
  const hasHiddenEvents = events.length > defaultVisibleCount;

  return (
    <Card className="bg-card/90">
      <CardHeader className="space-y-4">
        <div className="space-y-1">
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Business-scoped operator events, newest first, with the exact status and step type that produced each signal.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterLinks.map((filter) => (
            <Link
              key={filter.key}
              className={cn(
                buttonVariants({ size: 'sm', variant: filter.key === activeFilter ? 'default' : 'outline' }),
                filter.key === activeFilter && 'pointer-events-none'
              )}
              href={filter.href}
            >
              {filter.label} ({filter.count})
            </Link>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No business events match this filter yet.</div>
        ) : (
          <div className="space-y-3">
            {visibleEvents.map((event) => (
              <details key={event.id} className="rounded-xl border bg-background/80 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getOperatorEventStatusBadgeVariant(event.status)}>{operatorEventStatusLabels[event.status]}</Badge>
                        <Badge variant={getOperatorEventCategoryBadgeVariant(event.category)}>{operatorEventCategoryLabels[event.category]}</Badge>
                        <code className="rounded bg-muted px-2 py-1 text-xs">{event.type}</code>
                      </div>
                      <p className="font-medium">{event.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                        {event.relatedEntityType && event.relatedEntityId
                          ? ` • ${event.relatedEntityType} ${event.relatedEntityId.slice(-8)}`
                          : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">Expand details</span>
                  </div>
                </summary>
                <div className="mt-4 space-y-3 border-t pt-4">
                  {event.detailsJson ? renderJsonValue(event.detailsJson) : <p className="text-sm text-muted-foreground">No extra details recorded.</p>}
                </div>
              </details>
            ))}
            {hasHiddenEvents ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/80 p-4 text-sm">
                <p className="text-muted-foreground">
                  {expanded
                    ? `Showing all ${events.length} activity items.`
                    : `Showing ${visibleEvents.length} of ${events.length} activity items by default.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!expanded && expandHref ? (
                    <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={expandHref}>
                      Show more activity
                    </Link>
                  ) : null}
                  {expanded && collapseHref ? (
                    <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={collapseHref}>
                      Collapse activity
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

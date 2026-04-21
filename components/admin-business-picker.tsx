'use client';

import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type AdminBusinessPickerOption = {
  id: string;
  label: string;
};

function buildAdminBoardHref(params: { pathname: string; selectedBusinessId?: string | null; view?: string | null; query?: string | null }) {
  const search = new URLSearchParams();

  if (params.view) {
    search.set('view', params.view);
  }

  if (params.query) {
    search.set('q', params.query);
  }

  if (params.selectedBusinessId) {
    search.set('businessId', params.selectedBusinessId);
  }

  const query = search.toString();
  return query ? `${params.pathname}?${query}` : params.pathname;
}

export function AdminBusinessPicker({
  options,
  selectedBusinessId,
  view,
  query,
}: {
  options: AdminBusinessPickerOption[];
  selectedBusinessId: string | null;
  view: string | null;
  query: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      <Label htmlFor="business-picker">Jump to business</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Jump to business"
          className="sm:flex-1"
          id="business-picker"
          onChange={(event) => {
            const nextBusinessId = event.currentTarget.value || null;
            router.replace(
              buildAdminBoardHref({
                pathname,
                selectedBusinessId: nextBusinessId,
                view,
              })
            );
          }}
          value={selectedBusinessId || ''}
        >
          <option value="">Choose a business instantly</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        {selectedBusinessId ? (
          <Button
            onClick={() => {
              router.replace(
                buildAdminBoardHref({
                  pathname,
                  view,
                  query,
                })
              );
            }}
            type="button"
            variant="ghost"
          >
            Clear selection
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Pick a business to focus the board immediately. Text search stays below for rare edge-case lookups.</p>
    </div>
  );
}

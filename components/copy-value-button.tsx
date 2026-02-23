'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function CopyValueButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      window.setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 1500);
    }
  }

  return (
    <Button onClick={handleCopy} size="sm" type="button" variant="outline">
      {state === 'copied' ? 'Copied' : state === 'error' ? 'Copy Failed' : label}
    </Button>
  );
}

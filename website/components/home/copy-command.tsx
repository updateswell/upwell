'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="group inline-flex items-center gap-3 rounded-full border bg-fd-card px-4 py-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
      aria-label={`Copy "${command}"`}
    >
      <span className="text-fd-muted-foreground/60">$</span>
      <span className="text-fd-foreground">{command}</span>
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5 opacity-60 group-hover:opacity-100" />}
    </button>
  );
}

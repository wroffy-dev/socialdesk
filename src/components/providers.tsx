'use client';

import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/components/ui/confirm';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ConfirmProvider>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: '!rounded-lg !border !border-line !bg-surface !text-fg !shadow-pop !text-sm',
              description: '!text-muted',
              error: '!border-danger-line',
            },
          }}
        />
      </ConfirmProvider>
    </TooltipProvider>
  );
}

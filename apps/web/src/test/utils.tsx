/** Test helpers: render with the providers the views depend on. */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { buildSnapshot } from '../mocks/fixtures';
import type { DashboardSnapshot } from '../api';

export function makeSnapshot(): DashboardSnapshot {
  return buildSnapshot();
}

function Providers({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}

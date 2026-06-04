import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { BalanceBatteryView } from './BalanceBattery';
import { makeSnapshot, renderWithProviders } from '../test/utils';

describe('BalanceBatteryView', () => {
  it('renders a goal-completion percentage for each adult', () => {
    const snapshot = makeSnapshot();
    renderWithProviders(<BalanceBatteryView snapshot={snapshot} />);

    const pcts = screen.getAllByTestId('battery-pct');
    expect(pcts).toHaveLength(snapshot.batteries.length);
    // Every gauge shows a "NN%" value.
    pcts.forEach((el) => {
      expect(el.textContent).toMatch(/^\d+%$/);
    });

    // The first fixture battery is 33% goal completion.
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('shows the load-asymmetry indicator', () => {
    renderWithProviders(<BalanceBatteryView snapshot={makeSnapshot()} />);
    expect(screen.getByText('Load asymmetry')).toBeInTheDocument();
    expect(screen.getByText(/pts apart/)).toBeInTheDocument();
  });
});

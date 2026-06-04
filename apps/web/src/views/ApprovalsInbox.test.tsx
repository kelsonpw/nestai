import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { ApprovalsInbox } from './ApprovalsInbox';
import { makeSnapshot, renderWithProviders } from '../test/utils';

describe('ApprovalsInbox', () => {
  it('renders pending approvals with Approve/Reject actions', () => {
    const snapshot = makeSnapshot();
    const pending = snapshot.approvals.filter((a) => a.status === 'PENDING');
    expect(pending.length).toBeGreaterThan(0);

    renderWithProviders(<ApprovalsInbox snapshot={snapshot} />);

    // The inbox heading is present.
    expect(screen.getByText('Approvals inbox')).toBeInTheDocument();

    // One Approve and one Reject button per pending item.
    expect(screen.getAllByText('Approve')).toHaveLength(pending.length);
    expect(screen.getAllByText('Reject')).toHaveLength(pending.length);

    // A known pending reason renders (permission slip).
    expect(screen.getByText('Permission slip')).toBeInTheDocument();
  });
});

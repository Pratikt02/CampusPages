import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReadingMilestoneCelebration from './ReadingMilestoneCelebration.jsx';

describe('ReadingMilestoneCelebration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the default milestone and closes from its primary action', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn(), clearRect: vi.fn() });
    const onClose = vi.fn();
    render(<ReadingMilestoneCelebration isOpen onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Congrats, buddy!' })).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('STREAK')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toHaveClass('reading-celebration-highlight');
    fireEvent.click(screen.getByRole('button', { name: /continue reading/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('supports custom labels and dismisses with Escape', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn(), clearRect: vi.fn() });
    const onClose = vi.fn();
    render(<ReadingMilestoneCelebration
      isOpen
      onClose={onClose}
      durationLabel="2h"
      badgeLabel="DAILY GOAL"
      title="Amazing work!"
      subtitle="You completed 2 hours of reading!"
      buttonText="Back to notes"
    />);

    expect(screen.getByRole('dialog', { name: 'Amazing work!' })).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('DAILY GOAL')).toBeInTheDocument();
    expect(screen.getByText('2 hours')).toHaveClass('reading-celebration-highlight');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

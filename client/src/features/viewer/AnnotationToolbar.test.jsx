import { fireEvent, render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnnotationToolbar } from './AnnotationToolbar.jsx';

const props = {
  tool: 'pencil',
  setTool: vi.fn(),
  color: '#2563eb',
  setColor: vi.fn(),
  strokeWidth: 0.006,
  setStrokeWidth: vi.fn(),
  strokes: [],
  onUndo: vi.fn(),
  onClear: vi.fn(),
  status: 'ready',
};

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
});

describe('AnnotationToolbar color picker', () => {
  it('clamps the bucket and keeps its palette visible on a narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    render(<AnnotationToolbar {...props} />);
    vi.spyOn(screen.getByRole('button', { name: 'Color picker' }), 'getBoundingClientRect').mockReturnValue({
      left: 276, right: 304, top: 266, bottom: 294, width: 28, height: 28,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Color picker' }));

    const bucket = screen.getByRole('dialog', { name: 'Choose pencil color' });
    expect(Number.parseFloat(bucket.style.left)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(bucket.style.left) + 190).toBeLessThanOrEqual(308);
    expect(Number.parseFloat(bucket.style.top)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(bucket.style.top) + 195).toBeLessThanOrEqual(288);
    fireEvent.click(screen.getByRole('button', { name: 'Open color palette' }));
    expect(document.querySelector('.paint-picker-palette')).toHaveClass('palette-inline');
    expect(screen.getAllByRole('button', { name: /Use .* pencil color/ })).toHaveLength(6);
  });

  it('lands the bucket at the center of the viewport', () => {
    render(<AnnotationToolbar {...props} />);
    vi.spyOn(screen.getByRole('button', { name: 'Color picker' }), 'getBoundingClientRect').mockReturnValue({
      left: 30, right: 62, top: 40, bottom: 68, width: 32, height: 28,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Color picker' }));

    const bucket = screen.getByRole('dialog', { name: 'Choose pencil color' });
    expect(bucket.style.left).toBe('392px');
    expect(bucket.style.top).toBe('269px');
    expect(bucket.style.getPropertyValue('--jump-x')).toBe('-466px');
  });

  it('updates the pencil color, dips the brush, and jumps back to the trigger', () => {
    vi.useFakeTimers();
    const setColor = vi.fn();
    function StatefulToolbar() {
      const [color, updateColor] = useState(props.color);
      return <AnnotationToolbar {...props} color={color} setColor={(value) => { setColor(value); updateColor(value); }} />;
    }
    render(<StatefulToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Color picker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open color palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use #22c55e pencil color' }));

    expect(setColor).toHaveBeenCalledWith('#22c55e');
    expect(screen.getByRole('dialog', { name: 'Choose pencil color' })).toHaveStyle({ '--paint-color': '#22c55e' });
    expect(document.querySelector('.paint-ground-splatter')).toHaveAttribute('fill', 'var(--paint-color)');
    expect(screen.getByRole('button', { name: 'Open color palette' })).toHaveClass('is-dipping');

    act(() => vi.advanceTimersByTime(220));
    expect(screen.getByRole('dialog', { name: 'Choose pencil color' })).toHaveClass('is-exiting');

    act(() => vi.advanceTimersByTime(1060));
    expect(screen.queryByRole('dialog', { name: 'Choose pencil color' })).not.toBeInTheDocument();
  });

  it('dismisses outside taps without allowing them to reach the drawing surface', () => {
    render(<AnnotationToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color picker' }));
    const outsidePointer = vi.fn();
    document.body.addEventListener('pointerdown', outsidePointer);

    fireEvent.pointerDown(document.body);

    expect(outsidePointer).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Choose pencil color' })).toHaveClass('is-exiting');
    document.body.removeEventListener('pointerdown', outsidePointer);
  });
});

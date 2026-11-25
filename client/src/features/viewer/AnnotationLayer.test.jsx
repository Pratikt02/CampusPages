import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnotationLayer } from './AnnotationLayer.jsx';

describe('AnnotationLayer', () => {
  it('creates a normalized tick mark at the pointer position', () => {
    const onSave = vi.fn();
    render(<AnnotationLayer page={2} width={100} height={200} tool="tick" color="#2563eb"
      strokeWidth={0.01} onSave={onSave} />);
    const layer = screen.getByLabelText('Annotations on page 2');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 200 });

    fireEvent.pointerDown(layer, { pointerId: 1, clientX: 40, clientY: 80 });

    expect(onSave).toHaveBeenCalledTimes(1);
    const [page, [stroke]] = onSave.mock.calls[0];
    expect(page).toBe(2);
    expect(stroke).toMatchObject({ tool: 'tick', color: '#2563eb', width: 0.01 });
    expect(stroke.points).toHaveLength(3);
    expect(stroke.points[0].x).toBeCloseTo(0.3);
    expect(stroke.points[1].y).toBeCloseTo(0.354);
  });

  it('uses neon yellow-green ink for the highlighter', () => {
    const onSave = vi.fn();
    render(<AnnotationLayer page={1} width={100} height={100} tool="highlighter" color="#2563eb"
      strokeWidth={0.006} onSave={onSave} />);
    const layer = screen.getByLabelText('Annotations on page 1');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 });

    fireEvent.pointerDown(layer, { pointerId: 1, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(layer, { pointerId: 1 });

    const [, [stroke]] = onSave.mock.calls[0];
    expect(stroke).toMatchObject({ tool: 'highlighter', color: '#39ff14', width: 0.012 });
  });
});

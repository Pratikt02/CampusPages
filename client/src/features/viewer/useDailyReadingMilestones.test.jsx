import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDailyReadingMilestones } from './useDailyReadingMilestones.js';

const dayStamp = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('useDailyReadingMilestones', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('celebrates once for each completed hour and persists daily progress', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 10));
    const { result, unmount } = renderHook(() => useDailyReadingMilestones(true, 'student-1'));

    act(() => vi.advanceTimersByTime(60 * 60 * 1000));
    expect(result.current[0]).toBe(1);
    act(() => vi.advanceTimersByTime(60 * 60 * 1000));
    expect(result.current[0]).toBe(2);
    unmount();

    const saved = JSON.parse(localStorage.getItem('campuspages:reading-progress:student-1'));
    expect(saved).toMatchObject({ day: dayStamp(new Date()), celebratedHours: 2 });
    expect(saved.seconds).toBeGreaterThanOrEqual(7200);
  });

  it('does not count while inactive and resets progress on a new local day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 23, 59, 59));
    localStorage.setItem('campuspages:reading-progress:student-2', JSON.stringify({
      day: '2026-11-23', seconds: 3599, celebratedHours: 0,
    }));
    const { result, rerender } = renderHook(({ active }) => useDailyReadingMilestones(active, 'student-2'), {
      initialProps: { active: false },
    });

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0]).toBeNull();
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current[0]).toBeNull();
    const saved = JSON.parse(localStorage.getItem('campuspages:reading-progress:student-2'));
    expect(saved.day).toBe(dayStamp(new Date()));
    expect(saved.seconds).toBeLessThanOrEqual(10);
  });
});

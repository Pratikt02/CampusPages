import { useEffect, useState } from 'react';

const HOUR_SECONDS = 60 * 60;
const STORAGE_PREFIX = 'campuspages:reading-progress:';

const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const emptyProgress = (day) => ({ day, seconds: 0, celebratedHours: 0 });

function readProgress(userId, day) {
  try {
    const stored = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${userId}`) ?? 'null');
    if (stored?.day === day && Number.isFinite(stored.seconds) && Number.isInteger(stored.celebratedHours)) {
      return { day, seconds: Math.max(stored.seconds, 0), celebratedHours: Math.max(stored.celebratedHours, 0) };
    }
  } catch {
    // Reading progress starts fresh when browser storage is unavailable or invalid.
  }
  return emptyProgress(day);
}

export function useDailyReadingMilestones(isActive, userId) {
  const [milestone, setMilestone] = useState(null);

  useEffect(() => {
    if (!isActive || !userId) return undefined;
    let progress = readProgress(userId, localDay(new Date()));
    let lastTick = Date.now();
    let lastPersist = lastTick;

    const persist = () => {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(progress));
        lastPersist = Date.now();
      } catch {
        // The in-memory timer and celebration still work if storage is unavailable.
      }
    };

    const tick = (forcePersist = false) => {
      const now = Date.now();
      const today = localDay(new Date(now));
      if (progress.day !== today) {
        progress = emptyProgress(today);
        lastTick = now;
        persist();
        return;
      }
      if (document.visibilityState !== 'visible') {
        lastTick = now;
        return;
      }

      const elapsed = Math.min(Math.max((now - lastTick) / 1000, 0), 2);
      lastTick = now;
      if (elapsed === 0) return;
      progress.seconds += elapsed;
      const completedHours = Math.floor(progress.seconds / HOUR_SECONDS);
      if (completedHours > progress.celebratedHours) {
        progress.celebratedHours = completedHours;
        setMilestone(completedHours);
        forcePersist = true;
      }
      if (forcePersist || now - lastPersist >= 10_000) persist();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') tick(true);
      else lastTick = Date.now();
    };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      tick(true);
      persist();
    };
  }, [isActive, userId]);

  return [milestone, setMilestone];
}

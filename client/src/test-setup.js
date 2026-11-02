import '@testing-library/jest-dom/vitest';
import { act } from '@testing-library/react';

// jsdom has no layout engine: these doubles let tests control "visibility" and viewport size deterministically.
class MockIntersectionObserver {
  static instances = new Set();
  constructor(cb) { this.cb = cb; this.els = new Set(); MockIntersectionObserver.instances.add(this); }
  observe(el) { this.els.add(el); } unobserve(el) { this.els.delete(el); } takeRecords() { return []; }
  disconnect() { this.els.clear(); MockIntersectionObserver.instances.delete(this); }
}
globalThis.IntersectionObserver = MockIntersectionObserver;
// Marks the elements matching `predicate` as (not) intersecting. Nothing intersects by default, so rendering stays lazy.
globalThis.__setVisible = (predicate, isIntersecting = true) => act(() => {
  for (const io of MockIntersectionObserver.instances) for (const el of io.els) if (predicate(el)) io.cb([{ isIntersecting, target: el }]);
});
globalThis.__viewport = { width: 800, height: 600 };
globalThis.ResizeObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() { queueMicrotask(() => act(() => this.cb([{ contentRect: { ...globalThis.__viewport } }]))); }
  unobserve() {} disconnect() {}
};
HTMLCanvasElement.prototype.getContext = () => ({});
URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:mock');
URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
// jsdom lacks PointerEvent (so clientX would be dropped); a MouseEvent subclass carries the coordinates and pointerId.
globalThis.PointerEvent = class PointerEvent extends MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
};

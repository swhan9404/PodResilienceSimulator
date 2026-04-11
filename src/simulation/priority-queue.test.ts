import { describe, it, expect } from 'vitest';
import { MinHeap } from './priority-queue';
import type { SimEvent } from './types';

describe('MinHeap', () => {
  it('pops items in ascending order', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(5);
    heap.push(3);
    heap.push(7);
    heap.push(1);

    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(7);
  });

  it('peek returns minimum without removal', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(10);
    heap.push(5);
    heap.push(15);

    expect(heap.peek()).toBe(5);
    expect(heap.size).toBe(3);
    expect(heap.peek()).toBe(5);
  });

  it('isEmpty returns true for empty heap, false after push', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.isEmpty()).toBe(true);

    heap.push(1);
    expect(heap.isEmpty()).toBe(false);

    heap.pop();
    expect(heap.isEmpty()).toBe(true);
  });

  it('size returns correct count after push/pop', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.size).toBe(0);

    heap.push(1);
    heap.push(2);
    heap.push(3);
    expect(heap.size).toBe(3);

    heap.pop();
    expect(heap.size).toBe(2);
  });

  it('throws on pop of empty heap', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(() => heap.pop()).toThrow();
  });

  it('throws on peek of empty heap', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(() => heap.peek()).toThrow();
  });

  it('works with SimEvent objects ordered by time', () => {
    const heap = new MinHeap<SimEvent>((a, b) => a.time - b.time);
    heap.push({ time: 100, type: 'REQUEST_ARRIVAL' });
    heap.push({ time: 50, type: 'LIVENESS_PROBE' });
    heap.push({ time: 200, type: 'POD_RESTART' });
    heap.push({ time: 10, type: 'REQUEST_COMPLETE' });

    expect(heap.pop().time).toBe(10);
    expect(heap.pop().time).toBe(50);
    expect(heap.pop().time).toBe(100);
    expect(heap.pop().time).toBe(200);
  });

  it('handles duplicate time values', () => {
    const heap = new MinHeap<SimEvent>((a, b) => a.time - b.time);
    heap.push({ time: 100, type: 'REQUEST_ARRIVAL' });
    heap.push({ time: 100, type: 'LIVENESS_PROBE' });

    const first = heap.pop();
    const second = heap.pop();

    expect(first.time).toBe(100);
    expect(second.time).toBe(100);
    // Both events come out; order between them is implementation-defined
    const types = [first.type, second.type].sort();
    expect(types).toEqual(['LIVENESS_PROBE', 'REQUEST_ARRIVAL']);
  });

  it('stress test: push 1000 random items, pop all, verify sorted ascending', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    const values: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const val = Math.floor(Math.random() * 100000);
      values.push(val);
      heap.push(val);
    }

    expect(heap.size).toBe(1000);

    const popped: number[] = [];
    while (!heap.isEmpty()) {
      popped.push(heap.pop());
    }

    expect(popped.length).toBe(1000);

    // Verify sorted ascending
    for (let i = 1; i < popped.length; i++) {
      expect(popped[i]).toBeGreaterThanOrEqual(popped[i - 1]);
    }

    // Verify same values (sorted)
    values.sort((a, b) => a - b);
    expect(popped).toEqual(values);
  });
});

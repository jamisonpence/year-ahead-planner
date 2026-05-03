// In-memory store — data persists for the session
// All state lives here and is shared via React callbacks

import type { Event, Task, EventWithTasks } from "@shared/schema";

let memEvents: Event[] = [];
let memTasks: Task[] = [];

function nextId(items: { id: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
}

// ── Events ────────────────────────────────────────────────────────────────────

export function getAllEventsWithTasks(): EventWithTasks[] {
  return [...memEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      ...e,
      tasks: memTasks
        .filter((t) => t.eventId === e.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}

export function createEvent(data: Omit<Event, "id">): Event {
  const event: Event = { ...data, id: nextId(memEvents) };
  memEvents = [...memEvents, event];
  return event;
}

export function updateEvent(id: number, data: Partial<Omit<Event, "id">>): Event | null {
  const idx = memEvents.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated = { ...memEvents[idx], ...data };
  memEvents = memEvents.map((e) => (e.id === id ? updated : e));
  return updated;
}

export function deleteEvent(id: number): boolean {
  const next = memEvents.filter((e) => e.id !== id);
  if (next.length === memEvents.length) return false;
  memEvents = next;
  memTasks = memTasks.filter((t) => t.eventId !== id);
  return true;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function createTask(data: Omit<Task, "id">): Task {
  const task: Task = { ...data, id: nextId(memTasks) };
  memTasks = [...memTasks, task];
  return task;
}

export function updateTask(id: number, data: Partial<Omit<Task, "id">>): Task | null {
  const idx = memTasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const updated = { ...memTasks[idx], ...data };
  memTasks = memTasks.map((t) => (t.id === id ? updated : t));
  return updated;
}

export function deleteTask(id: number): boolean {
  const next = memTasks.filter((t) => t.id !== id);
  if (next.length === memTasks.length) return false;
  memTasks = next;
  return true;
}

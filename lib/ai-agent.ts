import { Task, CalendarEvent, TimeSlot, TaskDurationStats, WorkSegment } from '@/types';
import { endOfLocalCalendarDay } from '@/lib/date-utils';
import { SCHEDULE_MAX_HORIZON_DAYS } from '@/lib/schedule-constants';

/**
 * AI Agent that learns task durations and distributes tasks across calendar
 *
 * Task placement follows the pre–spread-algorithm approach (aligned with commit 9e57a2c):
 * global chunk sort by priority then shorter-first, first-fit into earliest gaps, then split.
 * Due dates cap usable slot ends; findEmptySlots clips long events to the work window.
 */
export class CalendarAIAgent {
  /**
   * Calculate average duration for a task based on historical data
   */
  static calculateTaskDuration(task: Task): number {
    // For work not done yet, always plan from the user's estimate when they set one.
    // Otherwise a short first completion (e.g. 30m) would shrink all future schedules.
    const estRaw = task.estimatedDuration as unknown;
    const estNum =
      typeof estRaw === 'string'
        ? parseInt(estRaw, 10)
        : typeof estRaw === 'number'
          ? estRaw
          : NaN;
    if (!task.completedAt && !Number.isNaN(estNum) && estNum > 0) {
      return estNum;
    }

    if (task.actualDurations.length === 0) {
      if (!Number.isNaN(estNum) && estNum > 0) {
        return estNum;
      }
      return 60;
    }

    const sum = task.actualDurations.reduce((acc, duration) => acc + duration, 0);
    return Math.round(sum / task.actualDurations.length);
  }

  /**
   * Get duration statistics for all tasks
   */
  static getTaskDurationStats(tasks: Task[]): TaskDurationStats[] {
    return tasks.map(task => {
      const durations = task.actualDurations;
      if (durations.length === 0) {
        return {
          taskId: task.id,
          averageDuration: task.estimatedDuration || 60,
          minDuration: task.estimatedDuration || 60,
          maxDuration: task.estimatedDuration || 60,
          completionCount: 0,
        };
      }

      return {
        taskId: task.id,
        averageDuration: Math.round(
          durations.reduce((acc, d) => acc + d, 0) / durations.length
        ),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        completionCount: durations.length,
      };
    });
  }

  /**
   * Split duration into focus-minute chunks (e.g. 120 min, focus 50 → [50, 50, 20])
   */
  static chunkDurationByFocus(duration: number, focusMinutes: number): number[] {
    const chunks: number[] = [];
    let remaining = duration;
    while (remaining > 0) {
      const piece = Math.min(remaining, focusMinutes);
      chunks.push(piece);
      remaining -= piece;
    }
    // Merge a trailing fragment under 15m into the previous chunk (15m is the minimum gap size).
    if (chunks.length >= 2) {
      const tail = chunks[chunks.length - 1];
      if (tail > 0 && tail < 15) {
        chunks[chunks.length - 2] += tail;
        chunks.pop();
      }
    }
    return chunks;
  }

  /**
   * Find all empty time slots in the calendar
   * breakAfterEventsMinutes: gap after each event before next slot can start
   */
  static findEmptySlots(
    existingEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    workStartHour: number = 9,
    workEndHour: number = 18,
    breakAfterEventsMinutes: number = 0
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip weekends (optional - you can make this configurable)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Create time slots for each day
      const dayStart = new Date(currentDate);
      dayStart.setHours(workStartHour, 0, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(workEndHour, 0, 0, 0);

      // Get events for this day
      const dayEvents = existingEvents.filter(event => {
        const eventDate = new Date(event.start);
        return (
          eventDate.getDate() === currentDate.getDate() &&
          eventDate.getMonth() === currentDate.getMonth() &&
          eventDate.getFullYear() === currentDate.getFullYear()
        );
      });

      // Sort events by start time
      dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Find gaps between events, clipping each event to [dayStart, dayEnd) so
      // all-day / long events don't break gap detection inside the work window.
      let currentTime = new Date(dayStart);

      for (const event of dayEvents) {
        // Entirely before this work window
        if (event.end <= dayStart) {
          continue;
        }
        // Entirely after this work window — remaining day is free
        if (event.start >= dayEnd) {
          break;
        }

        const blockStart = event.start < dayStart ? dayStart : event.start;
        const blockEnd = event.end > dayEnd ? dayEnd : event.end;

        if (currentTime < blockStart) {
          const slotEnd = new Date(blockStart);
          const duration = Math.round((slotEnd.getTime() - currentTime.getTime()) / (1000 * 60));

          if (duration >= 15) {
            slots.push({
              start: new Date(currentTime),
              end: slotEnd,
              duration,
            });
          }
        }

        const afterBreak = new Date(blockEnd.getTime() + breakAfterEventsMinutes * 60 * 1000);
        if (afterBreak > currentTime) {
          currentTime = afterBreak;
        }
      }

      // Check for slot after last event
      if (currentTime < dayEnd) {
        const duration = Math.round((dayEnd.getTime() - currentTime.getTime()) / (1000 * 60));
        if (duration >= 15) {
          slots.push({
            start: new Date(currentTime),
            end: new Date(dayEnd),
            duration,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Normalize work segments: clamp to valid ranges, drop invalid segments,
   * and merge overlapping or touching segments so scheduling never double-books.
   */
  private static normalizeWorkSegments(workSegments: WorkSegment[]): WorkSegment[] {
    const fallback: WorkSegment[] = [{ startHour: 9, endHour: 18 }];

    if (!workSegments || workSegments.length === 0) {
      return fallback;
    }

    const segments = workSegments
      .map((seg) => {
        const startHour = Math.max(0, Math.min(23, seg.startHour));
        const endHour = Math.max(0, Math.min(23, seg.endHour));
        return { startHour, endHour };
      })
      .filter((seg) => seg.startHour < seg.endHour)
      .sort((a, b) => a.startHour - b.startHour);

    if (segments.length === 0) {
      return fallback;
    }

    const merged: WorkSegment[] = [];
    for (const seg of segments) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ ...seg });
      } else if (seg.startHour <= last.endHour) {
        // Overlapping or touching segments → merge into a single block
        last.endHour = Math.max(last.endHour, seg.endHour);
      } else {
        merged.push({ ...seg });
      }
    }

    return merged;
  }

  /** True if eventStart falls inside [segment.start, segment.end) using minute precision. */
  private static eventStartWithinWorkSegments(eventStart: Date, segments: WorkSegment[]): boolean {
    const mins = eventStart.getHours() * 60 + eventStart.getMinutes();
    return segments.some((seg) => {
      const startM = seg.startHour * 60;
      const endM = seg.endHour * 60;
      return mins >= startM && mins < endM;
    });
  }

  /** End of the task's due calendar day (local). Scheduled work must end by this instant. */
  private static getTaskDueDeadline(task: Task): Date | null {
    if (!task.dueDate) return null;
    return endOfLocalCalendarDay(task.dueDate);
  }

  /**
   * End of the date range passed to {@link findEmptySlots} / {@link distributeTasks}.
   * Always includes at least `minHorizonDays` after `rangeStart` (default two weeks) so tasks
   * without a due still see a reasonable window. If any task has a `dueDate`, extends through the
   * latest due (end of that local day), capped at `maxHorizonDays` to bound work in `findEmptySlots`.
   */
  static computeScheduleEndDate(
    tasks: Task[],
    rangeStart: Date = new Date(),
    minHorizonDays: number = 14,
    maxHorizonDays: number = SCHEDULE_MAX_HORIZON_DAYS
  ): Date {
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);

    const minEnd = new Date(start);
    minEnd.setDate(minEnd.getDate() + minHorizonDays);
    minEnd.setHours(23, 59, 59, 999);

    let latestDueMs = 0;
    for (const t of tasks) {
      const d = this.getTaskDueDeadline(t);
      if (d) {
        latestDueMs = Math.max(latestDueMs, d.getTime());
      }
    }

    const capEnd = new Date(start);
    capEnd.setDate(capEnd.getDate() + maxHorizonDays);
    capEnd.setHours(23, 59, 59, 999);

    const mergedMs = Math.max(minEnd.getTime(), latestDueMs || minEnd.getTime());
    const merged = new Date(mergedMs);
    return merged.getTime() > capEnd.getTime() ? capEnd : merged;
  }

  private static taskColor(task: Task): string {
    return task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#10b981';
  }

  /**
   * Distribute tasks across available calendar slots
   * breakAfterEventsMinutes: gap after each event/task before next can be scheduled
   * focusMinutes: max chunk size (tasks longer than this get split)
   */
  static distributeTasks(
    tasks: Task[],
    existingEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    workSegments: WorkSegment[] = [{ startHour: 9, endHour: 18 }],
    breakAfterEventsMinutes: number = 0,
    focusMinutes: number = 50
  ): CalendarEvent[] {
    const seen = new Set<string>();
    const unique = tasks.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    const taskChunks: {
      task: Task;
      duration: number;
      partIndex: number;
      totalParts: number;
      priority: number;
    }[] = [];
    for (const task of unique) {
      const fullDuration = this.calculateTaskDuration(task);
      const priority = task.priority === 'high' ? 3 : task.priority === 'medium' ? 2 : 1;
      const chunks = this.chunkDurationByFocus(fullDuration, focusMinutes);
      chunks.forEach((duration, partIndex) => {
        taskChunks.push({
          task,
          duration,
          partIndex,
          totalParts: chunks.length,
          priority,
        });
      });
    }

    // Sort by priority (high first), then by duration (shorter first for better fit)
    taskChunks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.duration - b.duration;
    });

    const normalizedSegments = this.normalizeWorkSegments(workSegments);

    let emptySlots: TimeSlot[] = [];
    for (const segment of normalizedSegments) {
      const segmentSlots = this.findEmptySlots(
        existingEvents,
        startDate,
        endDate,
        segment.startHour,
        segment.endHour,
        breakAfterEventsMinutes
      );
      emptySlots.push(...segmentSlots);
    }

    const now = new Date();
    const futureSlots: TimeSlot[] = [];

    for (const slot of emptySlots) {
      if (slot.end <= now) {
        continue;
      }

      const slotStart = slot.start < now ? new Date(now) : slot.start;
      const duration = Math.round(
        (slot.end.getTime() - slotStart.getTime()) / (1000 * 60)
      );

      if (duration >= 15) {
        futureSlots.push({
          start: slotStart,
          end: slot.end,
          duration,
        });
      }
    }

    emptySlots = futureSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    const scheduledEvents: CalendarEvent[] = [];
    let scheduleIdSeq = 0;
    const nextId = (taskId: string, partIndex: number, slotIdx: number, tag: string) =>
      `scheduled-${taskId}-${++scheduleIdSeq}-s${slotIdx}-p${partIndex}-${tag}`;

    for (const { task, duration, partIndex, totalParts } of taskChunks) {
      const dueEnd = this.getTaskDueDeadline(task);
      let scheduled = false;
      const displayTitle =
        totalParts > 1 ? `${task.title} (Part ${partIndex + 1}/${totalParts})` : task.title;

      for (let i = 0; i < emptySlots.length; i++) {
        const slot = emptySlots[i];
        if (dueEnd && dueEnd.getTime() <= slot.start.getTime()) {
          continue;
        }
        const slotEndCap =
          dueEnd && dueEnd.getTime() < slot.end.getTime() ? dueEnd : slot.end;
        const slotDuration = Math.round(
          (slotEndCap.getTime() - slot.start.getTime()) / (1000 * 60)
        );

        if (slotDuration < duration || slotDuration < 15) {
          continue;
        }

        const eventStart = new Date(slot.start);
        const eventEnd = new Date(eventStart.getTime() + duration * 60 * 1000);
        if (dueEnd && eventEnd.getTime() > dueEnd.getTime()) {
          continue;
        }

        scheduledEvents.push({
          id: nextId(task.id, partIndex, i, 'fit'),
          title: displayTitle,
          start: eventStart,
          end: eventEnd,
          taskId: task.id,
          isScheduled: true,
          color: this.taskColor(task),
        });

        const slotAfterBreak = new Date(
          eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
        );
        if (slotAfterBreak >= slot.end) {
          emptySlots.splice(i, 1);
        } else {
          const remainingTime = Math.round(
            (slot.end.getTime() - slotAfterBreak.getTime()) / (1000 * 60)
          );
          if (remainingTime < 15) {
            emptySlots.splice(i, 1);
          } else {
            emptySlots[i] = {
              start: slotAfterBreak,
              end: slot.end,
              duration: remainingTime,
            };
          }
        }

        scheduled = true;
        break;
      }

      if (!scheduled && duration > 0) {
        const splitEvents = this.splitTaskAcrossSlots(
          task,
          displayTitle,
          duration,
          emptySlots,
          breakAfterEventsMinutes,
          dueEnd,
          nextId,
          partIndex
        );
        scheduledEvents.push(...splitEvents);
      }
    }

    const tasksById = new Map<string, Task>();
    for (const task of unique) {
      tasksById.set(task.id, task);
    }

    const eventsByTaskId = new Map<string, CalendarEvent[]>();
    for (const event of scheduledEvents) {
      if (!event.taskId) continue;
      const group = eventsByTaskId.get(event.taskId) || [];
      group.push(event);
      eventsByTaskId.set(event.taskId, group);
    }

    for (const [taskId, taskEvents] of eventsByTaskId.entries()) {
      const task = tasksById.get(taskId);
      if (!task) continue;

      taskEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
      const totalPartsFinal = taskEvents.length;

      for (let index = 0; index < taskEvents.length; index++) {
        const event = taskEvents[index];
        event.title =
          totalPartsFinal > 1
            ? `${task.title} (Part ${index + 1}/${totalPartsFinal})`
            : task.title;
      }
    }

    const nowFinal = new Date();
    const constrainedEvents = scheduledEvents.filter((event) => {
      if (event.start < nowFinal) return false;

      return this.eventStartWithinWorkSegments(event.start, normalizedSegments);
    });

    return constrainedEvents;
  }

  /**
   * Split a task across multiple slots if it doesn't fit in one
   */
  private static splitTaskAcrossSlots(
    task: Task,
    displayTitle: string,
    duration: number,
    emptySlots: TimeSlot[],
    breakAfterEventsMinutes: number = 0,
    dueEnd: Date | null = null,
    nextId: (taskId: string, partIndex: number, slotIdx: number, tag: string) => string,
    partIndex: number
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    let remainingDuration = duration;
    let subPart = 1;

    for (let i = 0; i < emptySlots.length && remainingDuration > 0; ) {
      const slot = emptySlots[i];
      if (dueEnd && dueEnd.getTime() <= slot.start.getTime()) {
        i++;
        continue;
      }
      const slotEndCap =
        dueEnd && dueEnd.getTime() < slot.end.getTime() ? dueEnd : slot.end;
      const slotDuration = Math.round(
        (slotEndCap.getTime() - slot.start.getTime()) / (1000 * 60)
      );

      if (slotDuration < 15) {
        emptySlots.splice(i, 1);
        continue;
      }

      const durationToUse = Math.min(remainingDuration, slotDuration);
      const eventStart = new Date(slot.start);
      const eventEnd = new Date(eventStart.getTime() + durationToUse * 60 * 1000);

      events.push({
        id: nextId(task.id, partIndex, i, `sp${subPart}`),
        title: displayTitle,
        start: eventStart,
        end: eventEnd,
        taskId: task.id,
        isScheduled: true,
        color: this.taskColor(task),
      });

      remainingDuration -= durationToUse;
      subPart++;

      const slotAfterBreak = new Date(
        eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
      );
      if (slotAfterBreak >= slot.end) {
        emptySlots.splice(i, 1);
      } else {
        const remainingTime = Math.round(
          (slot.end.getTime() - slotAfterBreak.getTime()) / (1000 * 60)
        );
        if (remainingTime < 15) {
          emptySlots.splice(i, 1);
        } else {
          emptySlots[i] = {
            start: slotAfterBreak,
            end: slot.end,
            duration: remainingTime,
          };
          i++;
        }
      }
    }

    return events;
  }

  /**
   * Update task with actual completion duration
   */
  static recordTaskCompletion(task: Task, actualDuration: number): Task {
    return {
      ...task,
      actualDurations: [...task.actualDurations, actualDuration],
      completedAt: new Date(),
    };
  }
}

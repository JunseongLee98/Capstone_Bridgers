import { Task, CalendarEvent, TimeSlot, TaskDurationStats, WorkSegment } from '@/types';
import { endOfLocalCalendarDay } from '@/lib/date-utils';
import { SCHEDULE_MAX_HORIZON_DAYS } from '@/lib/schedule-constants';

/**
 * AI Agent that learns task durations and distributes tasks across calendar
 */
export class CalendarAIAgent {
  /**
   * Calculate average duration for a task based on historical data
   */
  static calculateTaskDuration(task: Task): number {
    // For work not done yet, always plan from the user's estimate when they set one.
    // Otherwise a short first completion (e.g. 30m) would shrink all future schedules.
    if (
      !task.completedAt &&
      task.estimatedDuration != null &&
      task.estimatedDuration > 0
    ) {
      return task.estimatedDuration;
    }

    if (task.actualDurations.length === 0) {
      return task.estimatedDuration && task.estimatedDuration > 0 ? task.estimatedDuration : 60;
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
      chunks.push(Math.min(remaining, focusMinutes));
      remaining -= focusMinutes;
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

  private static localDayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  /**
   * Find a gap to place up to `remainingMinutes`.
   * If `spreadDayLoads` is set, pick the day with the fewest minutes already assigned to this task
   * (then earliest start) so work spreads toward the due date instead of packing one day.
   * If null, earliest feasible gap wins (used for ordered AI plan steps).
   */
  private static findBestPlacementGap(
    emptySlots: TimeSlot[],
    minStart: Date,
    dueEnd: Date | null,
    remainingMinutes: number,
    spreadDayLoads: Map<string, number> | null
  ): {
    index: number;
    useMinutes: number;
    eventStart: Date;
    eventEnd: Date;
    dayKey: string;
  } | null {
    if (!spreadDayLoads) {
      for (let i = 0; i < emptySlots.length; i++) {
        const slot = emptySlots[i];
        const effStart = new Date(Math.max(slot.start.getTime(), minStart.getTime()));
        const slotEndCap =
          dueEnd && dueEnd.getTime() < slot.end.getTime() ? dueEnd : slot.end;
        if (effStart.getTime() >= slotEndCap.getTime()) {
          continue;
        }

        const slotAvail = Math.round(
          (slotEndCap.getTime() - effStart.getTime()) / (1000 * 60)
        );
        if (slotAvail < 15) {
          continue;
        }

        const useMinutes = Math.min(remainingMinutes, slotAvail);
        if (useMinutes < 15) {
          continue;
        }

        const eventStart = new Date(effStart);
        const eventEnd = new Date(eventStart.getTime() + useMinutes * 60 * 1000);
        const dayKey = this.localDayKey(eventStart);
        return { index: i, useMinutes, eventStart, eventEnd, dayKey };
      }
      return null;
    }

    let best:
      | {
          index: number;
          useMinutes: number;
          eventStart: Date;
          eventEnd: Date;
          dayKey: string;
          load: number;
        }
      | null = null;

    for (let i = 0; i < emptySlots.length; i++) {
      const slot = emptySlots[i];
      const effStart = new Date(Math.max(slot.start.getTime(), minStart.getTime()));
      const slotEndCap =
        dueEnd && dueEnd.getTime() < slot.end.getTime() ? dueEnd : slot.end;
      if (effStart.getTime() >= slotEndCap.getTime()) {
        continue;
      }

      const slotAvail = Math.round(
        (slotEndCap.getTime() - effStart.getTime()) / (1000 * 60)
      );
      if (slotAvail < 15) {
        continue;
      }

      const useMinutes = Math.min(remainingMinutes, slotAvail);
      if (useMinutes < 15) {
        continue;
      }

      const eventStart = new Date(effStart);
      const eventEnd = new Date(eventStart.getTime() + useMinutes * 60 * 1000);
      const dayKey = this.localDayKey(eventStart);
      const load = spreadDayLoads.get(dayKey) ?? 0;

      if (
        !best ||
        load < best.load ||
        (load === best.load && eventStart.getTime() < best.eventStart.getTime())
      ) {
        best = { index: i, useMinutes, eventStart, eventEnd, dayKey, load };
      }
    }

    if (!best) {
      return null;
    }
    return {
      index: best.index,
      useMinutes: best.useMinutes,
      eventStart: best.eventStart,
      eventEnd: best.eventEnd,
      dayKey: best.dayKey,
    };
  }

  /**
   * Distribute tasks across available calendar slots
   * breakAfterEventsMinutes: gap after each event/task before next can be scheduled
   * focusMinutes: max chunk size (tasks longer than this get split)
   *
   * - Respects task.dueDate: nothing extends past end of due day; truncates chunks to fit.
   * - Tasks with planStepOrder (AI steps) are scheduled in step order; later steps never before earlier.
   * - Parts of the same task stay chronological via per-task cursor.
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

    const priorityRank = (t: Task) =>
      t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1;

    const withPlan = unique
      .filter((t) => t.planStepOrder != null)
      .sort((a, b) => (a.planStepOrder! - b.planStepOrder!));
    const withoutPlan = unique
      .filter((t) => t.planStepOrder == null)
      .sort((a, b) => {
        const pr = priorityRank(b) - priorityRank(a);
        if (pr !== 0) return pr;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    const taskOrder = [...withPlan, ...withoutPlan];

    type Chunk = {
      task: Task;
      duration: number;
      partIndex: number;
      totalParts: number;
      usesPlanOrder: boolean;
    };

    const taskChunks: Chunk[] = [];
    for (const task of taskOrder) {
      const fullDuration = this.calculateTaskDuration(task);
      const usesPlanOrder = task.planStepOrder != null;
      const chunks = this.chunkDurationByFocus(fullDuration, focusMinutes);
      chunks.forEach((duration, partIndex) => {
        taskChunks.push({
          task,
          duration,
          partIndex,
          totalParts: chunks.length,
          usesPlanOrder,
        });
      });
    }

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
      const duration = Math.round((slot.end.getTime() - slotStart.getTime()) / (1000 * 60));

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
    const nextScheduleEventId = (taskId: string, tag: string) =>
      `scheduled-${taskId}-${++scheduleIdSeq}-${tag}`;

    let globalCursor = new Date(now);
    const perTaskNextStart = new Map<string, Date>();

    let prevPlanTaskId: string | null = null;
    let prevPlanTaskScheduledSomething = false;
    let abandonRemainingPlanSteps = false;

    let spreadDayLoads: Map<string, number> | null = null;
    let spreadLoadsTaskId: string | null = null;

    for (const { task, duration, partIndex, totalParts, usesPlanOrder } of taskChunks) {
      if (usesPlanOrder) {
        spreadDayLoads = null;
        spreadLoadsTaskId = null;
        if (prevPlanTaskId !== null && prevPlanTaskId !== task.id) {
          if (!prevPlanTaskScheduledSomething) {
            abandonRemainingPlanSteps = true;
          }
          prevPlanTaskScheduledSomething = false;
        }
        prevPlanTaskId = task.id;
        if (abandonRemainingPlanSteps) {
          continue;
        }
      } else {
        prevPlanTaskId = null;
        prevPlanTaskScheduledSomething = false;
        abandonRemainingPlanSteps = false;
      }

      const useSpread = !usesPlanOrder;
      if (useSpread) {
        if (spreadLoadsTaskId !== task.id) {
          spreadDayLoads = new Map<string, number>();
          spreadLoadsTaskId = task.id;
        }
      }

      const dueEnd = this.getTaskDueDeadline(task);

      const displayTitle =
        totalParts > 1 ? `${task.title} (Part ${partIndex + 1}/${totalParts})` : task.title;

      let placementFrag = 0;
      const applyPlacement = (eventStart: Date, eventEnd: Date, slotIndex: number, slot: TimeSlot) => {
        placementFrag += 1;
        scheduledEvents.push({
          id: nextScheduleEventId(task.id, `s${slotIndex}-p${partIndex}-f${placementFrag}`),
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
          emptySlots.splice(slotIndex, 1);
        } else {
          const remainingTime = Math.round(
            (slot.end.getTime() - slotAfterBreak.getTime()) / (1000 * 60)
          );
          if (remainingTime < 15) {
            emptySlots.splice(slotIndex, 1);
          } else {
            emptySlots[slotIndex] = {
              start: slotAfterBreak,
              end: slot.end,
              duration: remainingTime,
            };
          }
        }
        const after = new Date(eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000);
        perTaskNextStart.set(task.id, after);
        if (usesPlanOrder) {
          globalCursor = new Date(Math.max(globalCursor.getTime(), after.getTime()));
        }
      };

      // Keep placing until this focus-chunk's minutes are exhausted. Previously we placed
      // min(chunk, slot) once then moved on, which dropped the remainder and under-scheduled.
      let remainingChunk = duration;
      let chunkHadPlacement = false;

      while (remainingChunk >= 15) {
        const minStartFresh = new Date(
          Math.max(
            now.getTime(),
            perTaskNextStart.get(task.id)?.getTime() ?? 0,
            usesPlanOrder ? globalCursor.getTime() : 0
          )
        );

        let placedThisRound = false;
        const gap = this.findBestPlacementGap(
          emptySlots,
          minStartFresh,
          dueEnd,
          remainingChunk,
          useSpread ? spreadDayLoads : null
        );

        if (gap) {
          applyPlacement(
            gap.eventStart,
            gap.eventEnd,
            gap.index,
            emptySlots[gap.index]
          );
          if (useSpread && spreadDayLoads) {
            spreadDayLoads.set(
              gap.dayKey,
              (spreadDayLoads.get(gap.dayKey) ?? 0) + gap.useMinutes
            );
          }
          remainingChunk -= gap.useMinutes;
          placedThisRound = true;
          chunkHadPlacement = true;
        }

        if (!placedThisRound) {
          const splitResult = this.splitTaskAcrossSlots(
            task,
            displayTitle,
            remainingChunk,
            emptySlots,
            breakAfterEventsMinutes,
            dueEnd,
            minStartFresh,
            partIndex,
            this.taskColor(task),
            nextScheduleEventId,
            useSpread ? spreadDayLoads : null
          );
          scheduledEvents.push(...splitResult.events);
          if (splitResult.lastEnd) {
            const after = new Date(
              splitResult.lastEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
            );
            perTaskNextStart.set(task.id, after);
            if (usesPlanOrder) {
              globalCursor = new Date(Math.max(globalCursor.getTime(), after.getTime()));
            }
          }
          if (splitResult.events.length > 0) {
            chunkHadPlacement = true;
          }
          remainingChunk = splitResult.remainingMinutes;
          break;
        }
      }

      const placed = chunkHadPlacement;
      if (usesPlanOrder && placed) {
        prevPlanTaskScheduledSomething = true;
      }
    }

    const tasksById = new Map<string, Task>();
    for (const task of tasks) {
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
      if (task.planStepOrder != null) {
        continue;
      }

      taskEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
      const totalParts = taskEvents.length;

      for (let index = 0; index < taskEvents.length; index++) {
        const event = taskEvents[index];
        event.title =
          totalParts > 1
            ? `${task.title} (Part ${index + 1}/${totalParts})`
            : task.title;
      }
    }

    const nowFinal = new Date();
    const constrainedEvents = scheduledEvents.filter((event) => {
      if (event.start < nowFinal) {
        return false;
      }
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
    breakAfterEventsMinutes: number,
    dueEnd: Date | null,
    minStart: Date,
    partIndex: number,
    color: string,
    nextScheduleEventId: (taskId: string, tag: string) => string,
    spreadDayLoads: Map<string, number> | null = null
  ): { events: CalendarEvent[]; lastEnd: Date | null; remainingMinutes: number } {
    const events: CalendarEvent[] = [];
    let remainingDuration = duration;
    let subPart = 1;
    let lastEnd: Date | null = null;
    let cursor = new Date(minStart.getTime());

    while (remainingDuration > 0) {
      const gap = this.findBestPlacementGap(
        emptySlots,
        cursor,
        dueEnd,
        remainingDuration,
        spreadDayLoads
      );
      if (!gap) {
        break;
      }

      const i = gap.index;
      const slotRow = emptySlots[i];

      events.push({
        id: nextScheduleEventId(task.id, `s${i}-p${partIndex}-sp${subPart}`),
        title: displayTitle,
        start: gap.eventStart,
        end: gap.eventEnd,
        taskId: task.id,
        isScheduled: true,
        color,
      });

      lastEnd = gap.eventEnd;
      remainingDuration -= gap.useMinutes;
      subPart++;

      if (spreadDayLoads) {
        spreadDayLoads.set(
          gap.dayKey,
          (spreadDayLoads.get(gap.dayKey) ?? 0) + gap.useMinutes
        );
      }

      const slotAfterBreak = new Date(
        gap.eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
      );
      if (slotAfterBreak >= slotRow.end) {
        emptySlots.splice(i, 1);
      } else {
        const remainingTime = Math.round(
          (slotRow.end.getTime() - slotAfterBreak.getTime()) / (1000 * 60)
        );
        if (remainingTime < 15) {
          emptySlots.splice(i, 1);
        } else {
          emptySlots[i] = {
            start: slotAfterBreak,
            end: slotRow.end,
            duration: remainingTime,
          };
        }
      }

      cursor = new Date(
        gap.eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
      );
    }

    return { events, lastEnd, remainingMinutes: remainingDuration };
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


import { Task, CalendarEvent, TimeSlot, TaskDurationStats } from '@/types';

/**
 * AI Agent that learns task durations and distributes tasks across calendar
 */
export class CalendarAIAgent {
  /**
   * Calculate average duration for a task based on historical data
   */
  static calculateTaskDuration(task: Task): number {
    if (task.actualDurations.length === 0) {
      // If no historical data, use estimate or default
      return task.estimatedDuration || 60; // default 1 hour
    }

    // Calculate average from actual durations
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

      // Find gaps between events
      let currentTime = new Date(dayStart);

      for (const event of dayEvents) {
        if (currentTime < event.start) {
          // Found an empty slot
          const slotEnd = new Date(event.start);
          const duration = Math.round((slotEnd.getTime() - currentTime.getTime()) / (1000 * 60));
          
          if (duration >= 15) { // Only consider slots >= 15 minutes
            slots.push({
              start: new Date(currentTime),
              end: slotEnd,
              duration,
            });
          }
        }
        // Move current time to end of this event + break before next slot.
        // Use max() so overlapping events don't move currentTime backwards.
        const afterBreak = new Date(event.end.getTime() + breakAfterEventsMinutes * 60 * 1000);
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
   * Distribute tasks across available calendar slots
   * breakAfterEventsMinutes: gap after each event/task before next can be scheduled
   * focusMinutes: max chunk size (tasks longer than this get split)
   */
  static distributeTasks(
    tasks: Task[],
    existingEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    workStartHour: number = 9,
    workEndHour: number = 18,
    breakAfterEventsMinutes: number = 0,
    focusMinutes: number = 50
  ): CalendarEvent[] {
    // Expand tasks into focus-minute chunks
    const taskChunks: { task: Task; duration: number; partIndex: number; totalParts: number; priority: number }[] = [];
    for (const task of tasks) {
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

    // Find all empty slots with custom work hours and break
    const emptySlots = this.findEmptySlots(
      existingEvents,
      startDate,
      endDate,
      workStartHour,
      workEndHour,
      breakAfterEventsMinutes
    );
    
    // Sort slots by start time
    emptySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    const scheduledEvents: CalendarEvent[] = [];

    // Try to fit each task chunk into available slots
    for (const { task, duration, partIndex, totalParts } of taskChunks) {
      let scheduled = false;
      const displayTitle =
        totalParts > 1 ? `${task.title} (Part ${partIndex + 1}/${totalParts})` : task.title;

      // Try to find a slot that fits this chunk
      for (let i = 0; i < emptySlots.length; i++) {
        const slot = emptySlots[i];
        const slotDuration = Math.round(
          (slot.end.getTime() - slot.start.getTime()) / (1000 * 60)
        );

        if (slotDuration < duration || slotDuration < 15) {
          // Skip tiny or too-small slots
          continue;
        }

        const eventStart = new Date(slot.start);
        const eventEnd = new Date(eventStart.getTime() + duration * 60 * 1000);

        scheduledEvents.push({
          id: `scheduled-${task.id}-${Date.now()}-${i}-p${partIndex}`,
          title: displayTitle,
          start: eventStart,
          end: eventEnd,
          taskId: task.id,
          isScheduled: true,
          color:
            task.priority === 'high'
              ? '#ef4444'
              : task.priority === 'medium'
              ? '#f59e0b'
              : '#10b981',
        });

        // Shrink or remove the slot after scheduling this chunk, respecting break
        const slotAfterBreak = new Date(
          eventEnd.getTime() + breakAfterEventsMinutes * 60 * 1000
        );
        if (slotAfterBreak >= slot.end) {
          // No time left in this slot
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

      // If task chunk doesn't fit in any single slot, try to split it across multiple
      if (!scheduled && duration > 0) {
        const splitEvents = this.splitTaskAcrossSlots(
          task,
          displayTitle,
          duration,
          emptySlots,
          breakAfterEventsMinutes
        );
        scheduledEvents.push(...splitEvents);
      }
    }

    // Ensure parts for the same task are numbered in chronological order.
    // This avoids cases where a later part label (e.g. Part 8/8) appears
    // in an earlier time slot than Part 1/8 due to how chunks were filled.
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

      // Sort task's events by their actual time
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

    return scheduledEvents;
  }

  /**
   * Split a task across multiple slots if it doesn't fit in one
   */
  private static splitTaskAcrossSlots(
    task: Task,
    displayTitle: string,
    duration: number,
    emptySlots: TimeSlot[],
    breakAfterEventsMinutes: number = 0
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    let remainingDuration = duration;
    let partIndex = 1;

    for (let i = 0; i < emptySlots.length && remainingDuration > 0; ) {
      const slot = emptySlots[i];
      const slotDuration = Math.round(
        (slot.end.getTime() - slot.start.getTime()) / (1000 * 60)
      );

      if (slotDuration < 15) {
        emptySlots.splice(i, 1);
        continue;
      }

      const durationToUse = Math.min(remainingDuration, slotDuration);
      const eventStart = new Date(slot.start);
      const eventEnd = new Date(eventStart.getTime() + durationToUse * 60 * 1000);

      events.push({
        id: `scheduled-${task.id}-${Date.now()}-${i}-part${partIndex}`,
        title: displayTitle,
        start: eventStart,
        end: eventEnd,
        taskId: task.id,
        isScheduled: true,
        color:
          task.priority === 'high'
            ? '#ef4444'
            : task.priority === 'medium'
            ? '#f59e0b'
            : '#10b981',
      });

      remainingDuration -= durationToUse;
      partIndex++;

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


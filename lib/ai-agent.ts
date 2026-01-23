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
   * Find all empty time slots in the calendar
   */
  static findEmptySlots(
    existingEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    workStartHour: number = 9,
    workEndHour: number = 17 
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
        // Move current time to end of this event
        currentTime = new Date(event.end);
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
   */
  static distributeTasks(
    tasks: Task[],
    existingEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    workStartHour: number = 9,
    workEndHour: number = 17
  ): CalendarEvent[] {
    // Calculate durations for all tasks
    const taskDurations = tasks.map(task => ({
      task,
      duration: this.calculateTaskDuration(task),
      priority: task.priority === 'high' ? 3 : task.priority === 'medium' ? 2 : 1,
    }));

    // Sort by priority (high first), then by duration (shorter first for better fit)
    taskDurations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.duration - b.duration;
    });

    // Find all empty slots with custom work hours
    const emptySlots = this.findEmptySlots(existingEvents, startDate, endDate, workStartHour, workEndHour);
    
    // Sort slots by start time
    emptySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    const scheduledEvents: CalendarEvent[] = [];
    const usedSlots: boolean[] = new Array(emptySlots.length).fill(false);

    // Try to fit each task into available slots
    for (const { task, duration } of taskDurations) {
      let scheduled = false;

      // Try to find a slot that fits
      for (let i = 0; i < emptySlots.length; i++) {
        if (usedSlots[i]) continue;

        const slot = emptySlots[i];
        
        // Check if task fits in this slot
        if (slot.duration >= duration) {
          const eventEnd = new Date(slot.start);
          eventEnd.setMinutes(eventEnd.getMinutes() + duration);

          scheduledEvents.push({
            id: `scheduled-${task.id}-${Date.now()}-${i}`,
            title: task.title,
            start: new Date(slot.start),
            end: eventEnd,
            taskId: task.id,
            isScheduled: true,
            color: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#10b981',
          });

          // Mark slot as used
          usedSlots[i] = true;
          
          // If slot has remaining time, create a new slot
          const remainingTime = slot.duration - duration;
          if (remainingTime >= 15) {
            emptySlots.push({
              start: eventEnd,
              end: slot.end,
              duration: remainingTime,
            });
            usedSlots.push(false);
          }

          scheduled = true;
          break;
        }
      }

      // If task doesn't fit in any single slot, try to split it
      if (!scheduled) {
        const splitEvents = this.splitTaskAcrossSlots(task, duration, emptySlots, usedSlots);
        scheduledEvents.push(...splitEvents);
      }
    }

    return scheduledEvents;
  }

  /**
   * Split a task across multiple slots if it doesn't fit in one
   */
  private static splitTaskAcrossSlots(
    task: Task,
    duration: number,
    emptySlots: TimeSlot[],
    usedSlots: boolean[]
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    let remainingDuration = duration;
    let taskPart = 1;

    for (let i = 0; i < emptySlots.length && remainingDuration > 0; i++) {
      if (usedSlots[i]) continue;

      const slot = emptySlots[i];
      const durationToUse = Math.min(remainingDuration, slot.duration);

      const eventEnd = new Date(slot.start);
      eventEnd.setMinutes(eventEnd.getMinutes() + durationToUse);

      events.push({
        id: `scheduled-${task.id}-${Date.now()}-${i}-part${taskPart}`,
        title: `${task.title} (Part ${taskPart})`,
        start: new Date(slot.start),
        end: eventEnd,
        taskId: task.id,
        isScheduled: true,
        color: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#10b981',
      });

      usedSlots[i] = true;
      remainingDuration -= durationToUse;
      taskPart++;
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


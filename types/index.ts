export interface Task {
  id: string;
  title: string;
  description?: string;
  estimatedDuration?: number; // in minutes
  actualDurations: number[]; // historical actual durations in minutes
  priority: 'low' | 'medium' | 'high';
  category?: string;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  /** From AI breakdown `order`: lower = earlier step; used to schedule steps in sequence. */
  planStepOrder?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  taskId?: string; // if this event is associated with a task
  isScheduled: boolean; // true if AI scheduled this, false if user created
  color?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // in minutes
}

export interface TaskDurationStats {
  taskId: string;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  completionCount: number;
}

// A contiguous block of work hours within a day, expressed in 24h clock hours.
// Example: { startHour: 6, endHour: 9 } represents 6:00–9:00.
export interface WorkSegment {
  startHour: number;
  endHour: number;
}

// Configuration for daily work hours. Supports multiple segments per day,
// e.g. [{ startHour: 6, endHour: 9 }, { startHour: 18, endHour: 21 }].
export interface WorkHoursConfig {
  segments: WorkSegment[];
}


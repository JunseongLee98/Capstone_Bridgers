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


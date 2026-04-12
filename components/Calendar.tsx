'use client';

import React, { useState, useMemo } from 'react';
import { Calendar as BigCalendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import { format } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { CalendarEvent } from '@/types';

interface CalendarProps {
  events: CalendarEvent[];
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
}

const localizer = momentLocalizer(moment);

interface TimeSlotWrapperProps {
  children: React.ReactElement;
  value: Date;
}

// Custom wrapper to visually indicate past time and current time within today
function TimeSlotWrapper({ children, value }: TimeSlotWrapperProps) {
  const now = new Date();

  const isSameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();

  const isPastToday = isSameDay && value < now;

  // Treat each 30-minute bucket as a slot and highlight the one that contains "now"
  const slotMinutes = value.getMinutes();
  const currentBucketStart = Math.floor(now.getMinutes() / 30) * 30;
  const isCurrentSlot =
    isSameDay &&
    value.getHours() === now.getHours() &&
    slotMinutes === currentBucketStart;

  const baseClassName = (children.props as any).className || '';
  const tintedClassName = isPastToday ? `${baseClassName} bg-gray-100` : baseClassName;

  const slotContent = React.cloneElement(children, {
    className: tintedClassName,
  });

  if (!isCurrentSlot) {
    return slotContent;
  }

  return (
    <div className="relative">
      {slotContent}
      <div className="pointer-events-none absolute inset-x-0 top-0 border-t-2 border-red-500" />
    </div>
  );
}

export default function Calendar({ events, onSelectSlot, onSelectEvent }: CalendarProps) {
  const [currentView, setCurrentView] = useState<View>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const formattedEvents = useMemo(() => {
    return events.map(event => ({
      ...event,
      title: event.title,
      start: event.start,
      end: event.end,
    }));
  }, [events]);

  // Determine the earliest event start time (by time-of-day) to auto-scroll near it
  const scrollTargetTime = useMemo(() => {
    if (!events || events.length === 0) {
      return new Date(1970, 0, 1, 6, 0, 0);
    }

    let earliest = events[0].start;
    for (const ev of events) {
      if (ev.start < earliest) {
        earliest = ev.start;
      }
    }

    const hours = earliest.getHours();
    const minutes = earliest.getMinutes();
    return new Date(1970, 0, 1, hours, minutes, 0, 0);
  }, [events]);

  const eventStyleGetter = (event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: event.color || '#3174ad',
        borderRadius: '4px',
        opacity: 1,
        color: '#111827', // near-black for strong contrast
        border: '1px solid rgba(15, 23, 42, 0.12)',
        fontWeight: 500,
        display: 'block',
      },
    };
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-800">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
      </div>
      <div className="flex-1 min-h-0">
        <BigCalendar
          localizer={localizer}
          events={formattedEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          view={currentView}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          selectable
          eventPropGetter={eventStyleGetter}
          defaultDate={new Date()}
          // Allow viewing the full day while auto-scrolling near the user's typical start time.
          min={new Date(1970, 0, 1, 0, 0, 0)}
          max={new Date(1970, 0, 1, 23, 59, 0)}
          scrollToTime={scrollTargetTime}
          components={{
            timeSlotWrapper: TimeSlotWrapper as React.ComponentType<any>,
          }}
        />
      </div>
    </div>
  );
}


'use client';

import { useState, useMemo } from 'react';
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

  const eventStyleGetter = (event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: event.color || '#3174ad',
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
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
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentView('month')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentView === 'month'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setCurrentView('week')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentView === 'week'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setCurrentView('day')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentView === 'day'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Day
          </button>
        </div>
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
        />
      </div>
    </div>
  );
}


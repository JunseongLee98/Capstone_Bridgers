# Cadence

AI-powered calendar app that helps students learn and manage time. The AI agent automatically detects how long tasks take on average and distributes work evenly across available calendar slots.

## Chrome Extension (Standalone) Plan

A full plan for converting Cadence into a **standalone Chrome extension** (no backend) that works with Google Calendar—including optional injection into calendar.google.com—is in **[CHROME_EXTENSION_PLAN.md](./CHROME_EXTENSION_PLAN.md)**. It covers architecture, phased conversion (shell → storage → Google Calendar → ICS → AI → content script), manifest and build, and an implementation checklist.

## Features

- 📅 **Interactive Calendar**: View your schedule in month, week, or day view
- ✅ **Task Management**: Create, edit, and track tasks with priorities and estimated durations
- 🤖 **AI Agent**: 
  - Learns from your task completion times
  - Automatically calculates average durations
  - Distributes tasks across empty calendar slots
  - Prioritizes high-priority tasks first
- 💾 **Data Persistence**: All tasks and events are saved locally in your browser

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## How It Works

1. **Create Tasks**: Add tasks with titles, descriptions, estimated durations, and priorities
2. **Complete Tasks**: When you finish a task, mark it as complete and enter the actual duration
3. **AI Learning**: The AI agent tracks your actual completion times and calculates averages
4. **Auto-Schedule**: Click "Distribute Tasks on Calendar" to automatically schedule all incomplete tasks across available time slots

## Project Structure

```
cadence/
├── app/              # Next.js app directory
│   ├── page.tsx      # Main page component
│   ├── layout.tsx    # Root layout
│   └── globals.css   # Global styles
├── components/       # React components
│   ├── Calendar.tsx  # Calendar view component
│   ├── TaskManager.tsx  # Task management UI
│   └── AIAgentPanel.tsx # AI agent controls
├── lib/              # Utility libraries
│   ├── ai-agent.ts   # AI agent logic
│   └── storage.ts    # LocalStorage utilities
└── types/            # TypeScript type definitions
    └── index.ts      # Shared types
```

## Technologies

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Big Calendar** - Calendar component
- **Lucide React** - Icons

## Documentation

- **[CHROME_EXTENSION_PLAN.md](./CHROME_EXTENSION_PLAN.md)** – Plan for converting Cadence into a standalone Chrome extension (no backend, optional Google Calendar injection).

## Usage Tips

- Tasks are color-coded by priority (red=high, yellow=medium, green=low)
- AI-scheduled events are automatically colored based on task priority
- You can manually create events by clicking and dragging on the calendar
- The AI agent only schedules tasks for the next 2 weeks
- Work hours are set to 9 AM - 5 PM (weekdays only) 

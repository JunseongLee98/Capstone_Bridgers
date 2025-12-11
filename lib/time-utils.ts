/**
 * Format minutes into human-readable hours and minutes string
 * Examples:
 * - 90 → "1 hour 30 minutes"
 * - 615 → "10 hours 15 minutes"
 * - 45 → "45 minutes"
 * - 60 → "1 hour"
 * - 120 → "2 hours"
 */
export function formatMinutesToHoursMinutes(minutes: number): string {
  if (minutes < 0) minutes = 0;
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const parts: string[] = [];
  
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  
  if (mins > 0) {
    parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  }
  
  // If it's 0 minutes, return "0 minutes"
  if (parts.length === 0) {
    return '0 minutes';
  }
  
  return parts.join(' ');
}

/**
 * Parse a human-readable time string back to minutes
 * Not currently used but available for future use
 */
export function parseHoursMinutesToMinutes(timeString: string): number {
  // This could parse strings like "1h 30m" or "1 hour 30 minutes"
  // For now, we'll keep it simple and just use numeric input
  return 0;
}


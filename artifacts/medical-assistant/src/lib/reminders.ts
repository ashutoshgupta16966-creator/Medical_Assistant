import type { ScanAnalysis } from '@workspace/api-client-react';

export interface ReminderFrequency {
  label: string;
  times: number[];
  intervalHours?: number;
}

export function detectReminderFrequency(analysis: ScanAnalysis): ReminderFrequency | null {
  const text = `${analysis.dosage} ${analysis.usage}`.toLowerCase();
  if (/\b(?:every|each)\s+(\d+)\s*hours?\b/.test(text)) {
    const intervalHours = Number(text.match(/\b(?:every|each)\s+(\d+)\s*hours?\b/)?.[1]);
    if (intervalHours >= 2 && intervalHours <= 24) {
      return { label: `Every ${intervalHours} hours`, times: [], intervalHours };
    }
  }
  if (/\b(?:three times|3 times|thrice|tid)\s+(?:a|per)?\s*day\b|\bthree times daily\b/.test(text)) {
    return { label: 'Three times a day', times: [8, 14, 20] };
  }
  if (/\b(?:twice|two times|2 times|bid)\s+(?:a|per)?\s*day\b|\btwice daily\b|\bmorning and evening\b/.test(text)) {
    return { label: 'Twice a day', times: [9, 21] };
  }
  if (/\b(?:once|one time|1 time)\s+(?:a|per)?\s*day\b|\bonce daily\b|\bevery morning\b/.test(text)) {
    return { label: 'Once a day', times: [9] };
  }
  return null;
}

export function getNextReminderTimes(frequency: ReminderFrequency, now = new Date()): Date[] {
  if (frequency.intervalHours) {
    return [new Date(now.getTime() + frequency.intervalHours * 60 * 60 * 1000)];
  }

  const reminders: Date[] = [];
  for (const hour of frequency.times) {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    reminders.push(next);
  }
  return reminders;
}
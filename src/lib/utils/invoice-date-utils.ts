/** Convert a date string (YYYY-MM-DD) to IST calendar date for consistent timezone handling. */
export function toISTDate(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00+05:30`);
  return date;
}

/** Get today's date in IST as YYYY-MM-DD. Optional currentTime for testing. */
export function getTodayIST(currentTime?: Date): string {
  const now = currentTime ?? new Date();
  // Use UTC time and adjust for IST offset (+05:30)
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istTime = new Date(utcTime + istOffset);
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calculate days until due from a due date (can be negative if already past). Optional currentTime for testing. */
export function getDaysUntilDue(dueDate: string, currentTime?: Date): number {
  const due = toISTDate(dueDate);
  const today = toISTDate(getTodayIST(currentTime));
  const diffMs = due.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Check if an invoice is due this week (0-7 days from today). Optional currentTime for testing. */
export function isDueThisWeek(dueDate: string, currentTime?: Date): boolean {
  const daysUntilDue = getDaysUntilDue(dueDate, currentTime);
  return daysUntilDue >= 0 && daysUntilDue <= 7;
}

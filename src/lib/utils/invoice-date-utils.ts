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

/** Check if a date falls within a named range (Today, This week, etc.). Uses IST calendar logic. */
export function isDateInRange(dateStr: string, bucket: string, currentTime?: Date): boolean {
  const today = getTodayIST(currentTime);

  if (bucket === "Today") {
    return dateStr === today;
  }

  const dateParts = dateStr.split("-").map(Number);
  const todayParts = today.split("-").map(Number);
  const dateY = dateParts[0] ?? 0;
  const dateM = dateParts[1] ?? 0;
  const todayY = todayParts[0] ?? 0;
  const todayM = todayParts[1] ?? 0;

  if (bucket === "This week") {
    const dateToIst = toISTDate(dateStr);
    const todayToIst = toISTDate(today);
    const diffMs = todayToIst.getTime() - dateToIst.getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return daysAgo >= 0 && daysAgo <= 7;
  }

  if (bucket === "This month") {
    return dateY === todayY && dateM === todayM;
  }

  if (bucket === "Last month") {
    let lastMonth = todayM - 1;
    let lastYear = todayY;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastYear--;
    }
    return dateY === lastYear && dateM === lastMonth;
  }

  if (bucket === "This quarter") {
    const todayQuarter = Math.floor((todayM - 1) / 3);
    const dateQuarter = Math.floor((dateM - 1) / 3);

    if (dateY !== todayY || dateQuarter !== todayQuarter) {
      return false;
    }

    // Calculate quarter start (months are 1-indexed, quarters are 0-indexed)
    const quarterStartMonth = todayQuarter * 3 + 1;
    const quarterStartDate = `${todayY}-${String(quarterStartMonth).padStart(2, "0")}-01`;

    return dateStr >= quarterStartDate && dateStr <= today;
  }

  return false;
}

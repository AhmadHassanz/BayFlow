export function moneyPkr(amount: number) {
  return `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount)}`;
}

export function localDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function calendarDates(timezone: string, now = new Date()) {
  const today = localDate(timezone, now);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function appointmentTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('en-PK', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
}

export function appointmentDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('en-PK', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(instant));
}

export function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}

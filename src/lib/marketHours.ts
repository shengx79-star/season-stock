/**
 * A-share market hours detection (Beijing time, UTC+8)
 * Morning: 09:30–11:30
 * Afternoon: 13:00–15:00
 * Weekdays only
 */

export function isAShareMarketOpen(): boolean {
  const now = new Date();
  // Convert to Beijing time
  const bjOffset = 8 * 60; // UTC+8 in minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const bjMinutes = (utcMinutes + bjOffset) % (24 * 60);

  // Day of week in Beijing time
  const bjDate = new Date(now.getTime() + bjOffset * 60 * 1000);
  const dow = bjDate.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;

  const morningOpen  = 9 * 60 + 30;  // 09:30
  const morningClose = 11 * 60 + 30; // 11:30
  const afternoonOpen  = 13 * 60;    // 13:00
  const afternoonClose = 15 * 60;    // 15:00

  return (bjMinutes >= morningOpen && bjMinutes < morningClose) ||
         (bjMinutes >= afternoonOpen && bjMinutes < afternoonClose);
}

export function getPollInterval(): number | null {
  return isAShareMarketOpen() ? 300_000 : null;
}

/** Format Beijing time as HH:MM:SS */
export function formatBJTime(date: Date): string {
  const bjOffset = 8 * 60;
  const bjDate = new Date(date.getTime() + bjOffset * 60 * 1000);
  const h = bjDate.getUTCHours().toString().padStart(2, '0');
  const m = bjDate.getUTCMinutes().toString().padStart(2, '0');
  const s = bjDate.getUTCSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

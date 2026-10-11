/** Returns the half-open local-time range for a calendar day. */
export function getLocalDayRange(day) {
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

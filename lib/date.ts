export function thisMonday(date = new Date()) {
  const day = date.getDay();
  const diff = (day === 0 ? 6 : day - 1) * 24 * 60 * 60 * 1000;
  const newDate = new Date(date.getTime() - diff);
  newDate.setHours(0);
  newDate.setMinutes(0);
  newDate.setSeconds(0);
  newDate.setMilliseconds(0);
  return newDate;
}

export function dateShiftBy(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

export function getDateFromCoord({ day, hour, minute }, anchorDate): Date {
  const anchor = thisMonday(anchorDate);
  const ms = (day * 24 + hour) * 60 * 60 * 1000 + minute * 60 * 1000;
  return dateShiftBy(anchor, ms);
}

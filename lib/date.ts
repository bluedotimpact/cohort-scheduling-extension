import { BDDateTime } from "./parse";

export function thisMondayUtc(date = new Date()) {
  const day = date.getUTCDay();
  const diff = ((day + 6) % 7) * 24 * 60 * 60 * 1000;
  const newDate = new Date(date.getTime() - diff);
  newDate.setUTCHours(0);
  newDate.setUTCMinutes(0);
  newDate.setUTCSeconds(0);
  newDate.setUTCMilliseconds(0);
  return newDate;
}

export function dateShiftBy(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

export function getDateFromCoord({ day, hour, minute }: BDDateTime, anchorDate: Date): Date {
  const anchor = thisMondayUtc(anchorDate);
  const ms = (day * 24 + hour) * 60 * 60 * 1000 + minute * 60 * 1000;
  return dateShiftBy(anchor, ms);
}

export function dateToCoord(date: Date) {
  const anchor = thisMondayUtc(date);
  const ms = date.getTime() - anchor.getTime();
  const day = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hour = Math.floor(ms / (60 * 60 * 1000)) % 24;
  const minute = Math.floor(ms / (60 * 1000)) % 60;
  return { day, hour, minute };
}

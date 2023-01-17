import { BDDateTime } from "./parse";

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

export function dateShiftBy(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

export function getDateFromCoord({ day, hour, minute }: BDDateTime, anchorDate: Date): Date {
  const anchor = thisMonday(anchorDate);
  const ms = (day * 24 + hour) * 60 * 60 * 1000 + minute * 60 * 1000;
  return dateShiftBy(anchor, ms);
}

export function dateToCoord(date: Date) {
  const anchor = thisMonday(date);
  const ms = date.getTime() - anchor.getTime();
  const day = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hour = Math.floor(ms / (60 * 60 * 1000)) % 24;
  const minute = Math.floor(ms / (60 * 1000)) % 60;
  return { day, hour, minute };
}

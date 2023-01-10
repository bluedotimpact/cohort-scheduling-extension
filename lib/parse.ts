import { MINUTE_IN_HOUR, UNIT_MINUTES } from "./constants";

// TODO: can this just be removed?
//@ts-ignore
Number.prototype.round = function (places) {
  //@ts-ignore
  return +(Math.round(this + "e+" + places) + "e-" + places);
};

// BlueDot representations of date/time
export interface BDDate {
  day: number,
}
export interface BDTime {
  hour: number,
  minute: number,
}
export interface BDDateTime extends BDDate, BDTime {}

export type Interval = [number, number]

const dayMapping = {
  M: 0,
  T: 1,
  W: 2,
  R: 3,
  F: 4,
  S: 5,
  U: 6,
};

export const dayMappingInverted = {
  0: "M",
  1: "T",
  2: "W",
  3: "R",
  4: "F",
  5: "S",
  6: "U",
};

/**
 * @param time String in format HH:mm
 * @returns Number representing hours from midnight
 * @example parseTime("09:30") === 9.5
 */
function parseTime(time: string): number {
  let [hour, minute] = time.split(":");
  return parseInt(hour) + parseInt(minute) / 60;
}

export function parseDayTime(daytime: string): number {
  const multiplier = MINUTE_IN_HOUR / UNIT_MINUTES;

  const [, d, t] = daytime.match(/^([MTWRFSU])(\d+:\d+)$/);
  return (dayMapping[d] * 24 + parseTime(t)) * multiplier;
}

function parseInterval(interval: string, multiplier: number): Interval {
  const [, d1, t1, d2, t2] =
    interval.match(/(M|T|W|R|F|S|U)(\d+:\d+) (M|T|W|R|F|S|U)(\d+:\d+)/) || [];

  let [b, e] = [
    [d1, t1],
    [d2, t2],
  ].map(([d, t]) => {
    return (dayMapping[d] * 24 + parseTime(t)) * multiplier;
  });

  if (b > e) {
    e = 7 * 24 * multiplier;
  }
  return [b, e];
}

export function parseTimeAvString(timeAv: string): Interval[] {
  if (!timeAv || timeAv.length === 0) return [];
  const multiplier = MINUTE_IN_HOUR / UNIT_MINUTES;

  return timeAv.split(", ").map((ts) => parseInterval(ts, multiplier));
}

export function unparseNumber(n: number): BDDateTime {
  const multiplier = MINUTE_IN_HOUR / UNIT_MINUTES;
  n = n / multiplier;
  const day = Math.floor(n / 24);
  n -= day * 24;
  const hour = Math.floor(n);
  n -= hour;
  const minute = n * 60;
  return {
    day: day,
    hour: hour,
    minute: minute,
  };
}

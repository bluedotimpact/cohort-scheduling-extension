import { UNITS_IN_HOUR } from "./constants";
import { Brand } from "./util";

/**
 * Represents the start of a unit of time, based on a weekly cycle
 * Units are MINUTES_IN_UNIT length
 * @example
 * 0 = Monday at 00:00 UTC
 * 1 = Monday at 00:30 UTC (assuming MINUTES_IN_UNIT = 30)
 * 24 = Tuesday at 00:00 UTC (assuming MINUTES_IN_UNIT = 30)
 */
export type Unit = Brand<number, 'Unit'>

// BlueDot representations of date/time
export interface BDDate {
  day: number,
}
export interface BDTime {
  hour: number,
  minute: number,
}
export interface BDDateTime extends BDDate, BDTime {}

export type Interval = [Unit, Unit]

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

const isDay = (d: string): d is keyof typeof dayMapping => {
  return d in dayMapping
}

/**
 * @param time String in format eHH:mm
 * @returns Number representing hours from midnight on Monday
 * @example parseDayTime("T09:30") === (24 + 9.5) * UNITS_IN_HOUR
 */
export function parseDayTime(daytime: string): Unit {
  const match = daytime.match(/^([MTWRFSU])(\d\d):(\d\d)$/);
  if (!match) throw new Error(`Invalid daytime string: ${daytime}`)
  if (!isDay(match[1])) throw new Error(`Invalid daytime string (invalid day): ${daytime}`)
  const hours = dayMapping[match[1]] * 24 + parseInt(match[2]) + parseInt(match[3]) / 60
  return hours * UNITS_IN_HOUR as Unit;
}

/**
 * @param interval String in format eHH:mm eHH:mm
 * Should not
 * @returns Pair of numbers representing start and end units
 * @example parseInterval("M14:00 T09:30") === [14 * UNITS_IN_HOUR, (24 + 9.5) * UNITS_IN_HOUR]
 */
export function parseInterval(interval: string): Interval {
  if (!/^[MTWRFSU]\d\d:\d\d [MTWRFSU]\d\d:\d\d$/.test(interval)) {
    console.log(interval)
    throw new Error(`Invalid interval string: ${interval}`)
  }
  const [daytime1, daytime2] = interval.split(' ')
  const beginning = parseDayTime(daytime1)
  let end = parseDayTime(daytime2)

  // If b > e, we have looped around the week
  // e.g. U23:00 M00:00
  // So the end of the interval should be the end of the week
  if (beginning > end) {
    if (end !== 0) {
      console.warn(`Wrapping around time [${beginning}, ${end}]. This shouldn't happen with good data.`)
    }

    end = 7 * 24 * UNITS_IN_HOUR as Unit;
  }
  return [beginning, end];
}

export function parseTimeAvString(timeAv: string | undefined): Interval[] {
  if (!timeAv) return [];
  return timeAv.split(", ").map((ts) => parseInterval(ts.trim()));
}

export function unparseNumber(n: Unit | number): BDDateTime {
  let x = n / UNITS_IN_HOUR;
  const day = Math.floor(x / 24);
  x -= day * 24;
  const hour = Math.floor(x);
  x -= hour;
  const minute = x * 60;
  return {
    day: day,
    hour: hour,
    minute: minute,
  };
}

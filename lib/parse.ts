import { MINUTE_IN_HOUR } from "./constants";

//@ts-ignore
Number.prototype.round = function (places) {
  //@ts-ignore
  return +(Math.round(this + "e+" + places) + "e-" + places);
};

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
  6: "U"
}

function parseTime(time) {
  let [hour, minute] = time.split(":");
  return parseInt(hour) + parseInt(minute) / 60;
}

function parseInterval(interval, multiplier) {
  const [a, d1, t1, d2, t2] =
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

export function parseTimeAvString(timeAv, { increment }) {
  if (!timeAv) return null;
  const multiplier = MINUTE_IN_HOUR / increment;

  return timeAv.split(", ").map((ts) => parseInterval(ts, multiplier));
}

export function unparseNumber(n, multiplier) {
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

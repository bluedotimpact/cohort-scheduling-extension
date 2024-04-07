import React from "react";
import { MINUTES_IN_UNIT } from "../../lib/constants";
import { Interval, WeeklyTime, format, isInInterval } from "weekly-availabilities";

const dayLabels = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

/**
 * @returns [0, 1, 2, 3, ..., n - 1]
 */
const zeroUntilN = (n: number): number[] => new Array(n).fill(0).map((_, i) => i);

export interface TimeAvWidgetProps {
  availabilities: {
    intervals: Interval[],
    class: string,
    opacity?: number,
  }[]
}

export function TimeAvWidget({ availabilities }: TimeAvWidgetProps) {
  const unitsPerHour = 60 / MINUTES_IN_UNIT;
  const unitIndexes = zeroUntilN(7 * 24 * unitsPerHour);

  const cellHeight = 2;
  const leftColumnWidth = 12;
  const unitsPerLabel = 2;

  return (
    <div>
      <div className="flex">
        <div className={"w-" + leftColumnWidth}></div>
        <div className="grid w-full text-sm grid-cols-7">
          {dayLabels.map((d) => {
            return (
              <div key={d} className="h-8 mx-auto">
                {d}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex text-xs">
        <div className={"w-" + leftColumnWidth}>
          {zeroUntilN(24 * unitsPerHour + 1)
            .filter((value) => {
              return value % unitsPerLabel == 0;
            })
            .map((unitTime) => {
              return (
                <div
                  key={unitTime}
                  className={
                    "flex justify-end px-1 h-" + unitsPerLabel * cellHeight
                  }
                >
                  <div className="-translate-y-2">
                    {format((unitTime * MINUTES_IN_UNIT) as WeeklyTime).slice(1)}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="w-full">
          <div
            className="grid grid-flow-col border-t border-l border-solid border-gray-800"
            style={{ gridTemplateRows: "repeat(48, minmax(0, 1fr))" }}
          >
            {unitIndexes.map((number) => {
              const relevantAvailabilities = availabilities.filter(a =>
                a.intervals.some(interval => isInInterval(interval, number * MINUTES_IN_UNIT as WeeklyTime))
              )

              const isEven = Math.floor(number) % unitsPerLabel == 0;
              return (
                <div
                  key={number}
                  className="h-2 relative border-r border-b border-gray-800 border-r-solid" style={{ borderBottomStyle: isEven ? "dotted" : "solid" }} >
                  {relevantAvailabilities.map((a, i) => (
                    <div key={i} className={"absolute inset-0 w-full h-full " + a.class} style={{ opacity: a.opacity }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

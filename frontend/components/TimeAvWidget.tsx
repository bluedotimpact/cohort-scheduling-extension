import React from "react";
import { MINUTE_IN_HOUR, UNIT_MINUTES } from "../../lib/constants";
import { prettyPrintTime } from "../../lib/format";
import { unparseNumber } from "../../lib/parse";
import { isWithin } from "../../lib/util";

const dayLabels = {
  0: "Mon",
  1: "Tue",
  2: "Wed",
  3: "Thu",
  4: "Fri",
  5: "Sat",
  6: "Sun",
};

export function TimeAvWidget({ timeAv, increment }) {
  const multiplier = MINUTE_IN_HOUR / increment;

  const allNumbers = [...Array(7 * 24 * multiplier).keys()];

  const cellHeight = 2;
  const leftColumnWidth = 12;
  const labelFreq = 2;

  return (
    <div>
      <div className="flex">
        <div className={"w-" + leftColumnWidth}></div>
        <div className="grid w-full text-sm grid-cols-7">
          {[...Array(7).keys()].map((d) => {
            return (
              <div key={d} className="h-8 mx-auto">
                {dayLabels[d]}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex text-xs">
        <div className={"w-" + leftColumnWidth}>
          {[...Array(24 * multiplier + 1).keys()]
            .filter((value) => {
              return value % labelFreq == 0;
            })
            .map((time) => {
              return (
                <div
                  key={time}
                  className={
                    "flex justify-end px-1 h-" + labelFreq * cellHeight
                  }
                >
                  <div className="-translate-y-2">
                    {prettyPrintTime(unparseNumber(time))}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="w-full">
          <div
            className="grid grid-flow-col border-t border-l border-solid border-gray-800"
            style={{ "grid-template-rows": "repeat(48, minmax(0, 1fr))" }}
          >
            {allNumbers.map((number, i) => (
              <div
                className={
                  "h-2 " +
                  (timeAv?.some((interval) => isWithin(interval, number))
                    ? "bg-green-500"
                    : "bg-red-50") +
                  " " +
                  "border-r border-b border-gray-800 border-r-solid"
                }
                style={
                  Math.floor(number) % labelFreq == 0
                    ? { borderBottomStyle: "dotted" }
                    : { borderBottomStyle: "solid" }
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export function TimeAvWidgetOverlay({
  primaryTimeAv,
  primaryClass,
  secondaryTimeAv = [],
  secondaryClass = "",
  tertiaryTimeAv = [],
  tertiaryClass = "",
}) {
  const multiplier = MINUTE_IN_HOUR / UNIT_MINUTES;

  const allNumbers = [...Array(7 * 24 * multiplier).keys()];

  const cellHeight = 2;
  const leftColumnWidth = 12;
  const labelFreq = 2;

  return (
    <div>
      <div className="flex">
        <div className={"w-" + leftColumnWidth}></div>
        <div className="grid w-full text-sm grid-cols-7">
          {[...Array(7).keys()].map((d) => {
            return (
              <div key={d} className="h-8 mx-auto">
                {dayLabels[d]}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex text-xs">
        <div className={"w-" + leftColumnWidth}>
          {[...Array(24 * multiplier + 1).keys()]
            .filter((value) => {
              return value % labelFreq == 0;
            })
            .map((time) => {
              return (
                <div
                  key={time}
                  className={
                    "flex justify-end px-1 h-" + labelFreq * cellHeight
                  }
                >
                  <div className="-translate-y-2">
                    {prettyPrintTime(unparseNumber(time))}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="w-full">
          <div
            className="grid grid-flow-col border-t border-l border-solid border-gray-800"
            style={{ "grid-template-rows": "repeat(48, minmax(0, 1fr))" }}
          >
            {allNumbers.map((number, i) => {
              const isPrimary = primaryTimeAv?.some((interval) =>
                isWithin(interval, number)
              );
              const isSecondary = secondaryTimeAv?.some((interval) =>
                isWithin(interval, number)
              );
              const isTertiary = tertiaryTimeAv?.some((interval) =>
                isWithin(interval, number)
              );

              const isEven = Math.floor(number) % labelFreq == 0;
              return (
                <div
                  className={
                    "h-2 relative border-r border-b border-gray-800 border-r-solid " +
                    (isPrimary ? primaryClass : "bg-red-50")
                  }
                  style={{ borderBottomStyle: isEven ? "dotted" : "solid" }}
                >
                  {isSecondary && (
                    <div
                      className={
                        "absolute inset-0 w-full h-full " + secondaryClass
                      }
                    />
                  )}
                  {isTertiary && (
                    <div
                      className={
                        "absolute inset-0 w-full h-full " + tertiaryClass
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

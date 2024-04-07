import { Icon } from "@airtable/blocks/ui";
import React from "react";

export const FixedNumberInput = ({ value, increment, decrement, render }: {
  value: number,
  increment: () => void,
  decrement: () => void,
  render: (value: number) => React.ReactNode,
}) => {
  return (
    <div className="flex items-center">
      <div className="flex flex-col">
        <button onClick={increment}>
          <Icon name="chevronUp" size={12}></Icon>
        </button>
        <button onClick={decrement}>
          <Icon name="chevronDown" size={12}></Icon>
        </button>
      </div>
      <div className="w-2" />
      <div className="px-3 py-1 rounded bg-[hsl(0,0%,95%)] text-[hsl(0,0%,40%)] pointer-events-none">
        {render(value)}
      </div>
    </div>
  );
};

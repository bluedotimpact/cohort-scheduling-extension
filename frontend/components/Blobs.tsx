import React from "react";

interface BlobProps {
  name: string,
  className?: string,
  tier?: 1 | 2 | 3 | undefined,
}

const tierColors: Record<number, string> = {
  1: 'bg-green-100',
  2: 'bg-yellow-100',
  3: 'bg-gray-100',
};

export const PersonBlob: React.FC<BlobProps> = (props) => {
  const bgColor = props.tier ? tierColors[props.tier] : 'bg-blue-50';
  return (
    <div className={"rounded px-1 " + bgColor + " " + (props.className ?? "")}>
      {props.name}
    </div>
  );
};

export const CohortBlob: React.FC<BlobProps> = (props) => {
  return (
    <div className={"rounded px-1 bg-purple-50 " + props.className}>
      {props.name}
    </div>
  );
};

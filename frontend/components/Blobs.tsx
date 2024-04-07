import React from "react";

interface BlobProps {
  name: string,
  className?: string,
}

export const PersonBlob: React.FC<BlobProps> = (props) => {
  return (
    <div className={"rounded px-1 bg-blue-50 " + props.className}>
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

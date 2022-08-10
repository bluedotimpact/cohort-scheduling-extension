import React from "react";

export const PersonBlob = (props) => {
  return (
    <div className={"rounded px-1 bg-blue-50 h-5 " + props.className}>
      {props.name}
    </div>
  );
};

export const CohortBlob = (props) => {
  return (
    <div className={"rounded px-1 bg-purple-50 h-5 " + props.className}>
      {props.name}
    </div>
  );
};

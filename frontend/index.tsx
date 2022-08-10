import {
    Icon,
    initializeBlock,
    loadScriptFromURLAsync
} from "@airtable/blocks/ui";
import { Tab } from "@headlessui/react";
import React, { Fragment } from "react";
import Algorithm from "./algorithm";
import View from "./view";

function MyTabLink({ icon, label }) {
  return (
    <Tab as={Fragment}>
      {({ selected }) => (
        <button
          className={
            "flex px-2 py-1 " + (selected ? "text-slate-50" : "text-slate-400")
          }
        >
          <Icon name={icon} size={16} />
          <span className="ml-1 tracking-widest uppercase text-xs font-medium">
            {label}
          </span>
        </button>
      )}
    </Tab>
  );
}

function App() {
  return (
    <Tab.Group>
      <Tab.List className="h-8 p-1 w-full flex items-center bg-slate-500">
        <MyTabLink icon="shapes" label="Algorithm" />
        <MyTabLink icon="show1" label="View" />
      </Tab.List>
      <Tab.Panels className="p-4 bg-slate-50 min-h-screen h-full">
        <Tab.Panel>
          <Algorithm />
        </Tab.Panel>
        <Tab.Panel>
          <View />
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  );
}

loadScriptFromURLAsync("https://cdn.tailwindcss.com").then(() => {
  initializeBlock(() => <App />);
});

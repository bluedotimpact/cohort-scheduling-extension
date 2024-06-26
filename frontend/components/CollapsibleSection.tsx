import { Heading, Icon } from "@airtable/blocks/ui";
import { Disclosure, Transition } from "@headlessui/react";
import React from "react";

interface CollapsibleSectionProps {
  defaultOpen?: boolean,
  title: string,
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = (props) => {
  return (
    <Disclosure defaultOpen={props.defaultOpen ?? false}>
      {({ open }) => (
        <div>
          <Disclosure.Button>
            <Heading size="xsmall" className="flex">
              <div className="flex items-center">
                <Icon
                  name="caret"
                  className={"transition-all " + (open ? "" : "-rotate-90")}
                />
              </div>
              <div className="w-1" />
              {props.title}
            </Heading>
          </Disclosure.Button>
          <Transition
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Disclosure.Panel className={"pl-6"}>
              {props.children}
            </Disclosure.Panel>
          </Transition>
        </div>
      )}
    </Disclosure>
  );
};

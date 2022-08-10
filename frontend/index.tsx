import { initializeBlock, loadScriptFromURLAsync } from "@airtable/blocks/ui";
import React from "react";

function App() {
  return <div className="text-green-800">Hello world 🚀</div>;
}

loadScriptFromURLAsync("https://cdn.tailwindcss.com").then(() => {
  initializeBlock(() => <App />);
});

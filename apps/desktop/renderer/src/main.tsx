import React from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "./providers/query-provider";
import { App } from "./app/App";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import VrayApp from "../app/vray-app";
import "../app/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <VrayApp />
  </React.StrictMode>,
);

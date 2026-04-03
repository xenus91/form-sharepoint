// main.jsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ItemViewer from "./ItemViewer.jsx";
import ManagerPreview from "./ManagerPreview.jsx";
import "./index.css";
import NotificationsProvider from "./NotificationsProvider";

function hasIdParam() {
  const usp = new URLSearchParams(window.location.search || "");
  return usp.has("ID") || usp.has("Id") || usp.has("id");
}

function hasManagerPreviewParam() {
  const usp = new URLSearchParams(window.location.search || "");
  return usp.get("managerPreview") === "1";
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <NotificationsProvider>
      {hasManagerPreviewParam() ? <ManagerPreview /> : hasIdParam() ? <ItemViewer /> : <App />}
    </NotificationsProvider>
  </StrictMode>
);

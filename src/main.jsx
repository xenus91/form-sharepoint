// main.jsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import App from "./App.jsx";
import ItemViewer from "./ItemViewer.jsx";
import "./index.css";
import NotificationsProvider from "./NotificationsProvider";

function hasIdParam() {
  const usp = new URLSearchParams(window.location.search || "");
  return usp.has("ID") || usp.has("Id") || usp.has("id");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        {hasIdParam() ? <ItemViewer /> : <App />}
      </NotificationsProvider>
    </QueryClientProvider>
  </StrictMode>
);

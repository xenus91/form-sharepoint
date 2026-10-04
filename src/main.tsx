// main.jsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import App from "./App.jsx";
import ItemViewer from "./ItemViewer.jsx";
import "./index.css";
import NotificationsProvider from "./NotificationsProvider";


// Метка сборки: помогает отличить «не починилось» от «браузер открыл старую сборку».
// Если этой строки нет в консоли при загрузке — работает старый бандл (нужен
// перезапуск dev-сервера / жёсткая перезагрузка страницы).
// eslint-disable-next-line no-console
console.info(
  "[form-sharepoint] ct-detect v7: название и описание задачи в шапке/теле формы, " +
  "кнопки результирующего выбора для OutcomeChoice и из метаданных списка, " +
  "чип человека — только имя (свойства по клику), поля 40 px без «съехавших» подписей",
);


function hasIdParam() {
  const usp = new URLSearchParams(window.location.search || "");
  return usp.has("ID") || usp.has("Id") || usp.has("id");
}

// Метка сборки — всегда в консоли: по ней видно, какой бандл реально загружен.
declare const __BUILD_TIME__: string;
declare const __BUILD_ID__: string;
try {
  const stamp = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";
  const id = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";
  // eslint-disable-next-line no-console
  console.info(`[app] build ${stamp}${id ? ` (#${id})` : ""}`);
} catch {}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        {hasIdParam() ? <ItemViewer /> : <App />}
      </NotificationsProvider>
    </QueryClientProvider>
  </StrictMode>
);

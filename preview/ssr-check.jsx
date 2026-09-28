// preview/ssr-check.jsx — серверный рендер сцены: ловим runtime-ошибки карточек без браузера.
import React from "react";
import { renderToString } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material";
import CardsScene, { tasks } from "./CardsScene";

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });

export function run() {
  const html = renderToString(
    <ThemeProvider theme={theme}>
      <CardsScene />
    </ThemeProvider>
  );
  return { html, ids: tasks.map((t) => t.Id) };
}

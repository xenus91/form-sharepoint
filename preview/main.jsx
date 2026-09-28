// preview/main.jsx — точка входа браузерного предпросмотра (npm run preview:cards).
import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material";
import CardsScene from "./CardsScene";

const theme = createTheme({
  palette: {
    primary: { main: "#171c8f" },
    error: { main: "#e53935" },
    background: { default: "#ffffff" },
    text: { primary: "#0F123D" },
  },
  shape: { borderRadius: 28 },
  typography: {
    fontFamily: `'Poppins','Inter','Segoe UI',Roboto,Arial,sans-serif`,
    button: { textTransform: "none", fontWeight: 600 },
  },
});

createRoot(document.getElementById("root")).render(
  <ThemeProvider theme={theme}>
    <CardsScene />
  </ThemeProvider>
);

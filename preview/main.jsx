// preview/main.jsx — точка входа браузерного предпросмотра (npm run preview:cards).
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material";
import CardsScene from "./CardsScene";
import TableScene from "./TableScene";
import RelatedScene from "./RelatedScene";

// ?scene=table — табличный режим #tasks (шапка, поиск, кнопки на строке),
// ?scene=related — диалог «Связанная заявка»; по умолчанию — карточки.
const scene = new URLSearchParams(window.location.search).get("scene");

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
    {scene === "table" ? <TableScene /> : scene === "related" ? <RelatedScene /> : <CardsScene />}
  </ThemeProvider>
);

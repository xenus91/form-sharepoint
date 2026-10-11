// preview/main.jsx — точка входа браузерного предпросмотра (npm run preview:cards).
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material";
import CardsScene from "./CardsScene";
import TableScene from "./TableScene";
import RelatedScene from "./RelatedScene";

// ?scene=table — табличный режим #tasks (шапка, поиск, кнопки на строке),
// ?scene=related — диалог «Связанная заявка»; по умолчанию — карточки.
const params = new URLSearchParams(window.location.search);
const scene = params.get("scene");
// ?scene=table&tab=completed — таблица завершённых (с колонкой «Результирующий выбор»).
const completedTab = params.get("tab") === "completed";

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
    {scene === "table"
      ? <TableScene completedMode={completedTab} />
      : scene === "related" ? <RelatedScene /> : <CardsScene />}
  </ThemeProvider>
);

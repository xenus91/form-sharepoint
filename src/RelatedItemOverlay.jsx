// src/RelatedItemOverlay.jsx
//
// Связанный элемент задачи (RelatedItems → ProblemsPallet) — встроенная панель
// ВНУТРИ текущей страницы, а не переход на отдельный адрес.
//
// Почему панель, а не полноэкранный слой: первый вариант рисовал чёрный блок на
// 100% viewport, и отличить его от перехода на другую страницу было нельзя —
// выглядело ровно как «открылся отдельный url». Здесь список задач остаётся
// видимым за затемнением, у панели свои рамка и шапка, поэтому сразу понятно,
// что это окно поверх списка.
//
// Приложение при этом смонтировано непрерывно (см. AppWithOverlay), так что
// возврат к списку мгновенный и задачи не перечитываются.
//
// Адрес ?ID=<Id> сохраняется: на него ставит скрепка на карточке
// (tasks/relatedAttachments.js → openRelatedItem), по нему работают кнопка
// «назад» браузера и прямая ссылка на элемент.
import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import ItemViewer from "./ItemViewer";
import { clearRelatedId, readRelatedId } from "./tasks/relatedAttachments";

export default function RelatedItemOverlay() {
  const [relatedId, setRelatedId] = useState(readRelatedId);

  // Скрепка шлёт popstate после pushState, кнопка «назад» браузера — тоже.
  useEffect(() => {
    const read = () => setRelatedId(readRelatedId());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const close = useCallback(() => {
    clearRelatedId();
    setRelatedId(null);
  }, []);

  // Esc закрывает панель — как обычное модальное окно.
  useEffect(() => {
    if (!relatedId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [relatedId, close]);

  if (!relatedId) return null;

  return (
    <Box
      data-testid="related-item-overlay"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 0, sm: 2 },
      }}
    >
      {/* Затемнение: список задач за panel'ью остаётся виден. */}
      <Box
        data-testid="related-item-backdrop"
        onClick={close}
        sx={{ position: "absolute", inset: 0, bgcolor: "rgba(9,11,38,0.62)" }}
      />

      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: { xs: "100%", sm: "min(1180px, 94vw)" },
          height: { xs: "100%", sm: "92vh" },
          bgcolor: "#000",
          overflow: "hidden",
          borderRadius: { xs: 0, sm: "14px" },
          border: { xs: "none", sm: "1px solid rgba(255,255,255,0.16)" },
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
        }}
      >
        {/* Шапка панели — по ней видно, что это окно внутри страницы. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.5,
            flexShrink: 0,
            bgcolor: "#101338",
            color: "#fff",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <IconButton
            onClick={close}
            size="small"
            aria-label="Вернуться к задачам"
            data-testid="related-view-back"
            sx={{ color: "#fff" }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "0.9rem" }} noWrap>
            {`Связанный элемент № ${relatedId}`}
          </Typography>
          <IconButton
            onClick={close}
            size="small"
            aria-label="Закрыть"
            data-testid="related-view-close"
            sx={{ color: "#fff" }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Тело: ItemViewer заполняет панель (он растянется на весь viewport,
            только если контейнер и есть viewport — прямая ссылка ?ID=). */}
        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {/* key — смена Id перезагружает элемент, а не переиспользует состояние */}
          <ItemViewer key={relatedId} />
        </Box>
      </Box>
    </Box>
  );
}

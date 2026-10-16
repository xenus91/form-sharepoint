// src/RelatedItemOverlay.jsx
//
// Связанный элемент задачи (RelatedItems → ProblemsPallet) поверх текущего
// экрана — БЕЗ перехода на отдельную страницу.
//
// Почему отдельный компонент рядом с <App/>, а не ветка внутри него:
// раньше в main.tsx стояло `hasIdParam() ? <ItemViewer/> : <App/>`, и адрес
// ?ID=<Id> выключал приложение целиком — список задач размонтировался, а при
// возврате загружался заново. Теперь <App/> остаётся смонтированным всё время,
// а просмотрщик ложится сверху, поэтому возврат мгновенный и список не
// перевыгружается.
//
// Адрес ?ID=<Id> при этом сохраняется: на него ставит скрепка на карточке
// (tasks/relatedAttachments.js → openRelatedItem), по нему же работает кнопка
// «назад» браузера и прямая ссылка на элемент.
import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
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

  if (!relatedId) return null;

  return (
    <Box
      data-testid="related-item-overlay"
      sx={{ position: "fixed", inset: 0, zIndex: 2000, bgcolor: "#000", overflow: "hidden" }}
    >
      <IconButton
        onClick={close}
        aria-label="Вернуться к задачам"
        data-testid="related-view-back"
        sx={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 2100,
          color: "#fff",
          bgcolor: "rgba(0,0,0,0.45)",
          "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
        }}
      >
        <ArrowBackIcon />
      </IconButton>
      {/* key — смена Id перезагружает элемент, а не переиспользует состояние */}
      <ItemViewer key={relatedId} />
    </Box>
  );
}

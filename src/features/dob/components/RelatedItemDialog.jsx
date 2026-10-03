/* eslint-disable react/prop-types */
// src/features/dob/components/RelatedItemDialog.jsx
// Read-only диалог «Связанная заявка»: показывает данные связанного элемента
// (RelatedItems → список заявок ДОБ) так, как они заполнены в SharePoint.
//
// Зачем: из формы задачи (#dob_tasks/<id>?list=03fc1b92-…, список RequestsTask)
// не нужно уходить в раздел «Заявки ДОБ», чтобы увидеть, на какую заявку
// ссылается задача — данные приходят сюда, только для чтения, полями по типу
// контента элемента.
//
// Ничего не сохраняет: только GET + рендер.

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useQuery } from "@tanstack/react-query";
import { getDobFields, getDobItemForView } from "../api/dobApi";
import { DOB_LIST_GUID } from "../api/dobClient";
import { buildViewFields, contentTypeNameOf, formatDateTime } from "../lib/dobFormFields";
import { relatedItemRoute } from "../lib/relatedItem";

/** Одно поле элемента — только чтение. */
function FieldBox({ field }) {
  const { view } = field;
  const wide = view.kind === "html";
  return (
    <Box
      data-testid="related-field"
      data-internal={field.internal}
      sx={{
        gridColumn: { xs: "1 / -1", md: wide ? "1 / -1" : "auto" },
        minWidth: 0,
        border: "1px solid #eceff4",
        borderLeft: "3px solid #171c8f22",
        borderRadius: 1,
        p: 1,
        bgcolor: "#fbfbfd",
      }}
    >
      <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}>
        {field.title}
      </Typography>
      {view.kind === "html" ? (
        <Box
          className="dob-view-html"
          sx={{
            fontSize: 13,
            lineHeight: 1.45,
            overflowWrap: "anywhere",
            "& img": { maxWidth: "100%", height: "auto", borderRadius: 1 },
            "& table": { borderCollapse: "collapse", width: "100%", my: 0.5 },
            "& td, & th": { border: "1px solid #e0e0e0", px: 0.75, py: 0.5, fontSize: 12.5 },
            "& p": { my: 0.5 },
          }}
          // HTML уже очищен sanitizeHtmlForView (см. lib/dobFormFields)
          dangerouslySetInnerHTML={{ __html: view.html || "" }}
        />
      ) : view.kind === "link" ? (
        <Link href={view.href || "#"} target="_blank" rel="noreferrer" sx={{ fontSize: 13, overflowWrap: "anywhere" }}>
          {view.text || view.href}
        </Link>
      ) : (
        <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {view.text || "—"}
        </Typography>
      )}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{listId:string,itemId:number}|null} props.relatedRef — ссылка на связанный элемент
 * @param {string|number} [props.taskId] — Id задачи, из которой открыли (для заголовка)
 */
export default function RelatedItemDialog({ open, onClose, relatedRef = null, taskId = null }) {
  const listId = relatedRef?.listId || DOB_LIST_GUID;
  const itemId = relatedRef?.itemId || null;
  const [showEmpty, setShowEmpty] = useState(false);

  const {
    data: fields,
    isLoading: fieldsLoading,
    error: fieldsError,
  } = useQuery({
    queryKey: ["dob-fields", listId],
    queryFn: () => getDobFields(listId),
    enabled: open && !!itemId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: item,
    isLoading: itemLoading,
    isFetching: itemFetching,
    error: itemError,
    refetch,
  } = useQuery({
    queryKey: ["dob-related-item", listId, itemId],
    queryFn: () => getDobItemForView(itemId, listId),
    enabled: open && !!itemId,
    staleTime: 60 * 1000,
  });

  const viewFields = useMemo(
    () => buildViewFields(fields || [], item || {}, { showEmpty }),
    [fields, item, showEmpty]
  );

  const contentType = contentTypeNameOf(item);
  const loading = (fieldsLoading || itemLoading) && !item;
  const error = itemError || fieldsError;
  const errorMessage = error?.response?.data?.error?.message?.value || error?.message || String(error || "");
  const filledCount = useMemo(
    () => buildViewFields(fields || [], item || {}, { showEmpty: false }).length,
    [fields, item]
  );

  const openForm = () => {
    const route = relatedItemRoute({ listId, itemId });
    if (route) {
      try {
        window.location.hash = route;
      } catch (_e) {
        void _e;
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", gap: 1, pr: 6, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#171c8f" }}>
            Связанная заявка #{itemId ?? "—"}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.75 }}>
            <Chip size="small" color="primary" variant="outlined" label="Только просмотр" />
            {contentType && <Chip size="small" variant="outlined" label={`Тип контента: ${contentType}`} />}
            {item?.Title && <Chip size="small" variant="outlined" label={String(item.Title)} />}
            {item && <Chip size="small" variant="outlined" label={`Заполнено полей: ${filledCount}`} />}
          </Stack>
        </Box>
        <IconButton onClick={onClose} aria-label="Закрыть" size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {taskId !== null && taskId !== undefined && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Данные связанной заявки (связь с записью #{taskId}). Поля показаны по типу контента
            элемента и недоступны для изменения — форма только для просмотра.
          </Alert>
        )}

        {!itemId && (
          <Alert severity="warning">У задачи нет связанной заявки (поле RelatedItems пустое).</Alert>
        )}

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 3, justifyContent: "center" }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">Загружаем связанную заявку…</Typography>
          </Box>
        )}

        {!!error && !loading && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => refetch()}>
                Повторить
              </Button>
            }
          >
            Не удалось загрузить связанную заявку: {String(errorMessage).slice(0, 400)}
          </Alert>
        )}

        {!loading && !error && item && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1, flexWrap: "wrap" }}>
              <FormControlLabel
                control={<Switch size="small" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />}
                label={<Typography variant="caption">Показать пустые поля</Typography>}
                sx={{ mr: 0 }}
              />
              {itemFetching && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <CircularProgress size={12} /> обновление…
                </Typography>
              )}
            </Box>

            {viewFields.length === 0 ? (
              <Alert severity="info">У связанной заявки не заполнено ни одно поле — включите «Показать пустые поля».</Alert>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                  gap: 1,
                }}
              >
                {viewFields.map((f) => (
                  <FieldBox key={f.internal} field={f} />
                ))}
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Создано: {item?.Author?.Title || "—"} · {formatDateTime(item?.Created) || "—"}
              {"  |  "}
              Изменено: {item?.Editor?.Title || "—"} · {formatDateTime(item?.Modified) || "—"}
            </Typography>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 0.5 }}>Закрыть</Button>
        {!!itemId && (
          <Button
            onClick={openForm}
            variant="contained"
            startIcon={<OpenInNewIcon />}
            sx={{ borderRadius: 0.5, backgroundImage: "linear-gradient(180deg,#171c8f 0%,#10146a 100%)" }}
          >
            Открыть форму заявки
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

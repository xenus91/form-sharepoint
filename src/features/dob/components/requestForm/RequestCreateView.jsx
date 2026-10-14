// src/features/dob/components/requestForm/RequestCreateView.jsx
// Страница роута #dob_requests/new — создание заявки.
//
// Сценарий (требование 2026-10-12):
//   1) выбираем тип контента списка заявок (Requests на сайте ДОБ);
//   2) список полей формы меняется под выбранный тип (поля — из FieldLinks типа);
//   3) «Создать» пишет элемент в список (createDobItem) и возвращает в список заявок.
//
// Форма вынесена в отдельные компоненты (RequestTypePicker /
// RequestFormFields / RequestFieldControl / useRequestForm) — страница здесь
// только раскладывает их и показывает состояние.
import { useCallback } from "react";
import PropTypes from "prop-types";
import {
  Alert, AppBar, Box, Button, CircularProgress, IconButton, Stack, Toolbar, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "../../../../NotificationsProvider";
import { DOB_REQUESTS_HASH } from "../../lib/dobRoute";
import { contentTypeDisplayName } from "../../lib/requestFields";
import { useRequestForm } from "./useRequestForm";
import RequestTypePicker from "./RequestTypePicker";
import RequestFormFields from "./RequestFormFields";
import DcEmailLinkDialog from "./DcEmailLinkDialog";

export default function RequestCreateView({ onOpenMenu, userProfile = null }) {
  const qc = useQueryClient();
  const { notify } = useNotifications();
  // userProfile → значения по умолчанию: DC ← Office, InitiatingDepartment ← Department.
  const form = useRequestForm({ userProfile });

  const back = useCallback(() => { window.location.hash = DOB_REQUESTS_HASH; }, []);

  const handleCreate = useCallback(async () => {
    const item = await form.submit();
    if (!item) return;
    notify(`Заявка #${item?.Id ?? item?.ID ?? ""} создана`, { severity: "success" });
    try { qc.invalidateQueries({ queryKey: ["dob"] }); } catch (_e) { void _e; }
    back();
  }, [form, notify, qc, back]);

  // Диалог DcEmail: сначала сохраняем рассылку, затем создаём заявку (порядок
  // обеспечивает useRequestForm.saveDcEmailAndCreate).
  const handleDcEmailSave = useCallback(async (groups) => {
    const item = await form.saveDcEmailAndCreate(groups);
    if (!item) return;
    notify(`Заявка #${item?.Id ?? item?.ID ?? ""} создана`, { severity: "success" });
    try { qc.invalidateQueries({ queryKey: ["dob"] }); } catch (_e) { void _e; }
    back();
  }, [form, notify, qc, back]);

  return (
    <Box sx={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "#fff" }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid rgba(23,28,143,0.1)" }}>
        <Toolbar variant="dense" sx={{ gap: 1.5 }}>
          <IconButton onClick={onOpenMenu} size="small" aria-label="Открыть меню"><MenuIcon /></IconButton>
          <IconButton onClick={back} size="small" aria-label="Назад к списку заявок"><ArrowBackIcon /></IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1f2347" }}>Новая заявка</Typography>
            <Typography variant="caption" color="text.secondary">
              Список Requests (сайт ДОБ) · поля формы зависят от типа заявки
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            startIcon={form.saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
            disabled={form.saving || !form.ctId}
            onClick={handleCreate}
            data-testid="request-create-submit"
          >
            {form.isUploading ? "Загрузка изображений…" : "Создать"}
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", p: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={2} sx={{ maxWidth: 860, mx: "auto" }}>
          <RequestTypePicker
            contentTypes={form.contentTypes}
            value={form.ctId}
            onChange={form.selectContentType}
            ctLabelOf={contentTypeDisplayName}
            error={form.problems.includes("Выберите тип заявки")}
          />

          {!form.ctId && (
            <Typography variant="body2" color="text.secondary" data-testid="request-form-hint">
              {form.loadingTypes
                ? "Загружаем типы заявок…"
                : (form.typesError || "Не удалось получить типы контента списка — проверьте доступ к списку Requests.")}
            </Typography>
          )}

          {form.loadingFields && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Загружаем поля типа контента…</Typography>
            </Box>
          )}
          {form.fieldsError && <Alert severity="warning">{form.fieldsError}</Alert>}

          {form.ctId && !form.loadingFields && (
            <RequestFormFields
              controls={form.controls}
              values={form.values}
              invalidNames={form.invalidNames}
              onChange={form.setValue}
              isUploading={form.isUploading}
            />
          )}

          {form.problems.length > 0 && (
            <Alert severity="error" data-testid="request-form-problems">
              {form.problems.map((p) => <Box key={p}>{p}</Box>)}
            </Alert>
          )}
          {form.error && <Alert severity="error">{form.error}</Alert>}
        </Stack>
      </Box>

      <DcEmailLinkDialog
        open={form.needsDcEmail}
        office={form.dcEmailOffice}
        department={form.dcEmailDepartment}
        offDepKey={form.dcEmailKey}
        saving={form.dcEmailSaving}
        error={form.dcEmailError}
        onCancel={form.cancelDcEmail}
        onSubmit={handleDcEmailSave}
      />
    </Box>
  );
}

RequestCreateView.propTypes = {
  onOpenMenu: PropTypes.func,
  // Профиль текущего пользователя (userOffice, userDepartment) — для полей по умолчанию.
  userProfile: PropTypes.shape({
    userOffice: PropTypes.string,
    userDepartment: PropTypes.string,
  }),
};

/* eslint-disable react/prop-types */
// Поиск и выбор группы для поля AssignedTo задачи через SharePoint People Picker.

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import PersonFieldAutocomplete from "./PersonFieldAutocomplete";
import { parseAssignees } from "../lib/assignees";
import { isGroupPrincipalType } from "../../../tasks/principalTypes";
import { searchAssignedToGroups } from "../../../tasks/userSearch";

const NO_GROUP_POSITIONS = async () => ({});

export default function AssignedToEditDialog({
  open = false,
  task = null,
  onClose = () => {},
  onSave,
}) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const currentAssignees = useMemo(() => parseAssignees(task), [task]);
  const currentLabel = currentAssignees
    .map((person) => person.title || (person.id ? `Id ${person.id}` : ""))
    .filter(Boolean)
    .join(", ") || "не назначена";
  const sameSingleAssignee = currentAssignees.length === 1
    && Number(currentAssignees[0].id) === Number(selected?.Id);
  const canSave = Number.isFinite(Number(selected?.Id))
    && Number(selected?.Id) > 0
    && isGroupPrincipalType(selected?.PrincipalType)
    && !sameSingleAssignee;

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, task?.Id]);

  const close = () => {
    if (!saving) onClose?.();
  };

  const save = async () => {
    if (!canSave || saving || typeof onSave !== "function") return;
    setSaving(true);
    try {
      const saved = await onSave(selected);
      if (saved === true || saved?.ok === true) onClose?.();
    } catch (_e) {
      // Ошибки сохранения уведомляет мутация владельца; оставляем диалог открытым,
      // чтобы можно было повторить попытку, не теряя выбранную группу.
      void _e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="sm"
      fullWidth
      data-testid="assigned-to-edit-dialog"
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ fontWeight: 800 }}>Изменить группу задачи</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Сейчас назначено: <b>{currentLabel}</b>. Выберите другую группу — текущее назначение будет заменено.
          </Typography>
          <PersonFieldAutocomplete
            label="Новая группа"
            placeholder="Введите название группы или учётную запись"
            minimumQueryText="Введите минимум 2 символа названия или учётной записи"
            noOptionsText="Группы не найдены"
            value={selected}
            onChange={setSelected}
            multiple={false}
            disabled={saving}
            search={searchAssignedToGroups}
            getPositions={NO_GROUP_POSITIONS}
          />
          <Typography variant="caption" color="text.secondary">
            В поиске показываются только группы и рассылки; пользователи исключены.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={close} disabled={saving} color="inherit">Отмена</Button>
        <Button
          onClick={save}
          disabled={!canSave || saving}
          variant="contained"
          data-testid="assigned-to-save"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Сохраняю…" : "Сохранить назначение"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

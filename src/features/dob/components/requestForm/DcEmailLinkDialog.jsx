/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/DcEmailLinkDialog.jsx
// Диалог «укажите рассылку для связи офиса и департамента».
//
// Показывается, если при создании заявки в списке DcEmail нет элемента на
// Office + Department текущего пользователя. Пользователь выбирает рассылку
// (ТОЛЬКО группы, многократный выбор); по «Сохранить и создать заявку» сначала
// создаётся элемент DcEmail, затем — заявка в Requests (порядок обеспечивает
// useRequestForm.saveDcEmailAndCreate).

import { useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from "@mui/material";
import GroupFieldAutocomplete from "../../../tasks/components/GroupFieldAutocomplete";
import { searchDobGroups } from "../../lib/dcEmailApi";

export default function DcEmailLinkDialog({
  open = false,
  office = "",
  department = "",
  offDepKey = "",
  saving = false,
  error = "",
  onCancel,
  onSubmit,
}) {
  const [groups, setGroups] = useState([]);
  const [touched, setTouched] = useState(false);

  const nothingSelected = groups.length === 0;

  const handleSubmit = () => {
    setTouched(true);
    if (nothingSelected) return;
    onSubmit?.(groups);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle data-testid="dcemail-dialog-title">Укажите рассылку для связи офиса и департамента</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Для офиса «{office || "—"}» и департамента «{department || "—"}» ещё нет рассылки в списке
            DcEmail{offDepKey ? ` (ключ: ${offDepKey})` : ""}. Выберите группы, которые нужно связать
            с этим сочетанием офиса и департамента.
          </Typography>
          <GroupFieldAutocomplete
            label="Рассылка (группы)"
            value={groups}
            onChange={(next) => { setGroups(next); if (next.length) setTouched(false); }}
            multiple
            required
            search={searchDobGroups}
            error={touched && nothingSelected}
            helperText={touched && nothingSelected ? "Выберите хотя бы одну группу" : ""}
            placeholder="Название группы"
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving} data-testid="dcemail-cancel">Отмена</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          data-testid="dcemail-save"
        >
          {saving ? "Сохраняем…" : "Сохранить и создать заявку"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

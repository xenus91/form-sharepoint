/* eslint-disable react/prop-types */
// Поиск и выбор группы для поля AssignedTo задачи через SharePoint People Picker.

import { useCallback, useEffect, useMemo, useState } from "react";
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
import apiClient from "../../../api";
import { parseAssignees } from "../lib/assignees";
import { isGroupPrincipalType } from "../../../tasks/principalTypes";
import { searchAssignedToGroups } from "../../../tasks/userSearch";

const NO_GROUP_POSITIONS = async () => ({});
const PROFILE_ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };

function normalizeOfficeSearchTerm(value) {
  const office = String(value ?? "").trim();
  if (!office || office.toLowerCase() === "не указано") return "";
  return office.replace(/[-‐‑‒–—]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeForOfficeMatch(value) {
  return String(value ?? "")
    .replace(/[-‐‑‒–—_]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function groupMatchesOffice(group, officeValue) {
  const office = normalizeForOfficeMatch(officeValue);
  if (!office || !group) return false;
  return [group.Title, group.LoginName, group.Email].some((value) => {
    const searchableText = normalizeForOfficeMatch(value);
    return ` ${searchableText} `.includes(` ${office} `);
  });
}

function readOfficeFromProfile(response) {
  const profile = response?.data?.d ?? response?.data ?? {};
  const rawProperties = profile?.UserProfileProperties;
  const properties = Array.isArray(rawProperties)
    ? rawProperties
    : (Array.isArray(rawProperties?.results) ? rawProperties.results : []);
  const office = properties.find((property) => String(property?.Key || "").trim().toLowerCase() === "office")?.Value
    || profile?.Office
    || profile?.userOffice
    || "";
  return normalizeOfficeSearchTerm(office);
}

export default function AssignedToEditDialog({
  open = false,
  task = null,
  onClose = () => {},
  onSave,
  currentUserOffice = "",
}) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [officeSearchTerm, setOfficeSearchTerm] = useState("");
  const [officeStatus, setOfficeStatus] = useState("idle");
  const currentAssignees = useMemo(() => parseAssignees(task), [task]);
  const currentLabel = currentAssignees
    .map((person) => person.title || (person.id ? `Id ${person.id}` : ""))
    .filter(Boolean)
    .join(", ") || "не назначена";
  const sameSingleAssignee = currentAssignees.length === 1
    && Number(currentAssignees[0].id) === Number(selected?.Id);
  const canSave = Number.isFinite(Number(selected?.Id))
    && Number(selected?.Id) > 0
    && officeStatus === "ready"
    && groupMatchesOffice(selected, officeSearchTerm)
    && isGroupPrincipalType(selected?.PrincipalType)
    && !sameSingleAssignee;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const providedOffice = normalizeOfficeSearchTerm(currentUserOffice);
    setSelected(null);
    setOfficeSearchTerm("");
    setOfficeStatus(providedOffice ? "ready" : "loading");

    if (providedOffice) {
      setOfficeSearchTerm(providedOffice);
      return () => { alive = false; };
    }

    apiClient.get("/SP.UserProfiles.PeopleManager/GetMyProperties", PROFILE_ACCEPT)
      .then((response) => {
        if (!alive) return;
        const office = readOfficeFromProfile(response);
        setOfficeSearchTerm(office);
        setOfficeStatus(office ? "ready" : "missing");
      })
      .catch(() => {
        if (!alive) return;
        setOfficeSearchTerm("");
        setOfficeStatus("error");
      });

    return () => { alive = false; };
  }, [open, task?.Id, currentUserOffice]);

  const searchOfficeGroups = useCallback(async (query, options) => {
    if (officeStatus !== "ready" || !officeSearchTerm) return [];
    const results = await searchAssignedToGroups(query, options);
    return (Array.isArray(results) ? results : [])
      .filter((group) => isGroupPrincipalType(group?.PrincipalType)
        && groupMatchesOffice(group, officeSearchTerm));
  }, [officeSearchTerm, officeStatus]);

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
            minimumQueryText={officeStatus === "loading"
              ? "Загружаю офис сотрудника…"
              : officeStatus === "error"
                ? "Не удалось загрузить офис сотрудника"
                : officeStatus === "missing"
                  ? "В профиле сотрудника не заполнен Office"
                  : "Введите минимум 2 символа названия или учётной записи"}
            noOptionsText={officeSearchTerm ? `Группы офиса ${officeSearchTerm} не найдены` : "Поиск недоступен без Office"}
            value={selected}
            onChange={setSelected}
            multiple={false}
            disabled={saving || officeStatus !== "ready"}
            search={searchOfficeGroups}
            getPositions={NO_GROUP_POSITIONS}
          />
          <Typography variant="caption" color="text.secondary">
            {officeStatus === "ready"
              ? `Фильтр Office (не изменяется): ${officeSearchTerm}. Показываются только группы этого офиса.`
              : officeStatus === "loading"
                ? "Определяю Office сотрудника для ограничения списка групп…"
                : officeStatus === "missing"
                  ? "Без заполненного Office выбор группы отключён, чтобы не назначить задачу другому РЦ."
                  : officeStatus === "error"
                    ? "Не удалось определить Office; выбор группы отключён во избежание назначения другому РЦ."
                    : ""}
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
          sx={{
            textTransform: "none",
            fontWeight: 700,
            color: "#fff",
            "&:hover": { color: "#fff" },
            "&.Mui-disabled": { color: "#fff" },
          }}
        >
          {saving ? "Сохраняю…" : "Сохранить назначение"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

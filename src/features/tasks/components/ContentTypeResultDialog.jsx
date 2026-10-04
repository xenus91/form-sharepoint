// src/features/tasks/components/ContentTypeResultDialog.jsx
// Диалог закрытия задачи: форма строится ИСКЛЮЧИТЕЛЬНО по типу контента и типам
// колонок SharePoint (см. tasks/contentTypeFields.js).
//
//   • DobSearchResult (и любой «Результирующий выбор») — кнопки результата;
//   • DescriptionCheckResult (Note) — рич-текст (RichEditor), обязательность из SP;
//   • ErrorTypeValidation (Choice) — автокомплит с подстановкой своего значения;
//   • ErrorCountValidation (Number) — числовое поле «Кол-во ошибок»;
//   • Guilty (Пользователь или группа) — автокомплит по учётной записи,
//     многократный выбор, подпись «Имя — Должность».
//
// Обязательные поля (Required=true в SharePoint) не дают отправить форму:
// показываем список того, что нужно заполнить. Значения уходят в completeTask
// (Result + поля типа контента + Status/PercentComplete=1).

/* eslint-disable react/prop-types */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Autocomplete, Box, Checkbox, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import RichEditor from "../../dob/components/RichEditor";
import PersonFieldAutocomplete from "./PersonFieldAutocomplete";
import { toDisplayImages, toStorageImages } from "../../dob/lib/attachmentUrl";
import { removeImgByFileName } from "../../dob/lib/richImages";
import { getDobContentTypeFields } from "../../dob/api/dobApi";
import {
  FORM_ACTIONS_SX,
  FORM_FIELD_FULL_SX,
  FORM_FIELD_GRID_SX,
  FORM_FIELD_WIDE_SX,
  FORM_INVALID_SECTION_SX,
  FORM_NUMBER_FIELD_SX,
  FORM_PRIMARY_BUTTON_SX,
  FORM_SECONDARY_BUTTON_SX,
  FORM_SECTION_BAR_SX,
  FORM_SECTION_HEAD_SX,
  FORM_SECTION_SX,
  FORM_SECTION_TITLE_SX,
  RESULT_TOGGLE_GROUP_SX,
} from "../../dob/lib/formStyles";
import {
  buildContentTypeForm,
  normalizeChoiceValue,
  normalizeChoiceValues,
  fetchContentTypeFields,
  plainText,
  validateRequiredFields,
} from "../../../tasks/contentTypeFields";

/**
 * Контрол не заполнен? Логика та же, что в validateRequiredFields (rich-текст
 * сравниваем по тексту без тегов, множественный выбор — по длине списка), но
 * результат нужен по каждому полю: подсветить ИМЕННО незаполненные блоки.
 */
function isControlEmpty(control, value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return normalizeChoiceValues(value).length === 0;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "object") return Object.keys(value).length === 0;
  const text = control?.kind === "richtext" ? plainText(value) : String(value).trim();
  return text.length === 0;
}

function readTaskValue(task, internal) {
  if (!task || !internal) return undefined;
  // Карточка/строка несут исходный элемент SharePoint в raw — поля типа контента
  // (DescriptionCheckResult, Guilty и т.п.) легче всего достать оттуда.
  const sources = [task, task.raw];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    if (source[internal] !== undefined) return source[internal];
    if (source[`OData__${internal}`] !== undefined) return source[`OData__${internal}`];
  }
  return undefined;
}

function asUserList(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : [raw]);
  return list
    .map((u) => {
      if (!u) return null;
      if (typeof u === "object") {
        const id = Number(u.Id ?? u.ID);
        return {
          Id: Number.isFinite(id) ? id : undefined,
          Title: String(u.Title || u.Name || "").trim(),
          LoginName: String(u.LoginName || "").trim(),
          Email: String(u.Email || u.EMail || "").trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

const toISODate = (value) => {
  if (!value) return "";
  try {
    if (typeof value === "string" && value.startsWith("/Date(")) {
      const ms = Number(String(value).replace(/[^0-9]/g, ""));
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().slice(0, 10);
  } catch (_e) {
    void _e;
    return "";
  }
};

export default function ContentTypeResultDialog({
  open = false,
  task = null,
  contentTypeId = "",
  contentTypeName = "",
  resultFieldInternalName = "",
  resultChoices = [],
  initialResult = "",
  confirmTexts = null,
  submitLabel = "",
  cancelLabel = "",
  submitting = false,
  onSubmit,
  onClose,
  // inline: та же форма, но не в модальном окне — её показывает форма ДОБ
  // (страница #dob_tasks/<id>), чтобы задача «Результат проверки ООБ» закрывалась
  // кнопками результата прямо на экране задачи.
  inline = false,
  // submitRef: страница (#dob_tasks/<id>) кладёт в него submit формы — кнопка
  // «Сохранить» в шапке страницы работает так же, как в форме заявки ДОБ.
  submitRef = null,
  // listGuid — список ЗАДАЧИ: поля типа контента читаем у него (а не у основного
  // списка) и, если в FieldLinks нет колонки результата, берём её из метаданных
  // списка (resultField) — иначе форма оставалась без кнопок результата.
  listGuid = "",
  resultField = null,
  // Картинки в rich-тексте сохраняются ВЛОЖЕНИЯМИ задачи (их может быть сколько
  // угодно): страница даёт свои обработчики загрузки/прогресса.
  onUploadImage = null,
  onDeleteImage = null,
  isUploading = false,
  // Значения формы «наружу» — страница следит за картинками в rich-тексте
  // (удалили картинку из текста → вложение тоже удаляем).
  onValuesChange = null,
  // «Пульт» для страницы-владельца формы (#dob_tasks/<id>): попросить убрать
  // картинку удалённого вложения из rich-текста. Значения формы живут ВНУТРИ
  // диалога, поэтому снаружи их можно изменить только так — иначе каскад
  // «удалили вложение из блока вложений» не доходил бы до текста.
  valuesControlRef = null,
  // Блок вложений задачи показывается ВНУТРИ rich-поля (внутри рамки CKEditor):
  // картинки из текста лежат вложениями, удалять их удобно рядом с текстом.
  richFooter = null,
  // Ошибка валидации «наружу» — страница показывает snackbar с предупреждением.
  onValidationError = null,
}) {
  const [result, setResult] = React.useState(initialResult || "");
  const [values, setValues] = React.useState({});
  // Актуальные значения — для setValue/«пульта»: React-состояние доступно только
  // в следующем рендере, а обработчики редактора приходят пачками.
  const valuesRef = React.useRef(values);
  // Колбэк наружу держим в ref: у вызывающей стороны он может быть inline-функцией
  // (новая на каждом рендере), и если бы он был в зависимостях эффекта инициализации,
  // получился бы цикл «эффект → onValuesChange → ререндер родителя → эффект».
  const onChangeRef = React.useRef(onValuesChange);
  React.useEffect(() => { onChangeRef.current = onValuesChange; }, [onValuesChange]);
  const [problems, setProblems] = React.useState([]);
  const [touched, setTouched] = React.useState(false);
  // Прокрутка к первому незаполненному блоку при ошибке валидации.
  const contentRef = React.useRef(null);

  const fieldsQ = useQuery({
    queryKey: ["ct-fields", contentTypeId, listGuid || "main"],
    // Поля читаем у ТОГО списка, в котором лежит задача (у внешних списков свои
    // типы контента и свои колонки).
    queryFn: () => (listGuid
      ? getDobContentTypeFields(contentTypeId, listGuid)
      : fetchContentTypeFields(contentTypeId)),
    enabled: Boolean((open || inline) && contentTypeId),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const form = React.useMemo(
    () => buildContentTypeForm(fieldsQ.data || [], {
      resultFieldInternalNames: [
        resultFieldInternalName,
        resultField?.internalName,
      ].filter(Boolean),
      fallbackResultField: resultField,
    }),
    [fieldsQ.data, resultFieldInternalName, resultField],
  );

  // Инициализация значений из задачи + результата из Behaviour/карточки
  React.useEffect(() => {
    if (!open && !inline) return;
    const next = {};
    for (const control of form.controls) {
      const raw = readTaskValue(task, control.internalName);
      if (control.kind === "person") next[control.internalName] = asUserList(raw);
      else if (control.kind === "boolean") next[control.internalName] = raw === true || raw === 1 || String(raw).toLowerCase() === "true";
      else if (control.kind === "number") next[control.internalName] = raw === undefined || raw === null ? "" : String(raw);
      else if (control.kind === "date") next[control.internalName] = toISODate(raw);
      else if (control.kind === "multichoice") next[control.internalName] = normalizeChoiceValues(raw);
      // Rich-текст: в SharePoint хранится серверный путь вложения, а в редакторе
      // картинка должна открываться (dev — через прокси, prod — origin).
      else if (control.kind === "richtext") next[control.internalName] = toDisplayImages(raw === undefined || raw === null ? "" : String(raw));
      else if (control.kind === "select" || control.kind === "choice" || control.kind === "autocomplete") {
        next[control.internalName] = normalizeChoiceValue(raw);
      } else next[control.internalName] = raw === undefined || raw === null ? "" : String(raw);
    }
    valuesRef.current = next;
    setValues(next);
    setProblems([]);
    setTouched(false);
    // Владелец формы (страница #dob_tasks/<id>) следит за картинками в тексте:
    // сообщаем ему стартовые значения, чтобы он видел ПОСЛЕДУЮЩИЕ удаления.
    onChangeRef.current?.(next);
  }, [open, inline, task, form.controls]);

  React.useEffect(() => {
    if (open || inline) setResult(initialResult || "");
  }, [open, inline, initialResult]);

  const choices = React.useMemo(() => {
    const list = (Array.isArray(resultChoices) ? resultChoices : []).map((c) => String(c)).filter(Boolean);
    if (list.length > 0) return list;
    if (form.resultBlock?.choices?.length) return form.resultBlock.choices;
    return (resultField?.choices || []).map((c) => String(c)).filter(Boolean);
  }, [resultChoices, form.resultBlock, resultField]);

  const setValue = (internal, value) => {
    const next = { ...valuesRef.current, [internal]: value };
    valuesRef.current = next;
    setValues(next);
    // ВАЖНО: onValuesChange вызываем ЗДЕСЬ, а не внутри setValues(updater):
    // React выполняет updater во время рендера, и обновление родителя попадало
    // в рендер («Cannot update a component (DobTaskEditView) while rendering a
    // different component (ContentTypeResultDialog)»).
    onChangeRef.current?.(next);
    if (touched && problems.length > 0) setProblems([]);
  };

  // Каскадное удаление: страница просит убрать из rich-текста картинку файла,
  // вложение которого удалили (или наоборот — см. removedImgSrcs в RichEditor).
  React.useEffect(() => {
    if (!valuesControlRef) return undefined;
    valuesControlRef.current = {
      removeImagesByFileName: (fileName) => {
        const prev = valuesRef.current || {};
        let changed = false;
        const next = { ...prev };
        for (const [key, value] of Object.entries(prev)) {
          if (typeof value !== "string" || !value.includes("<img")) continue;
          const cleaned = removeImgByFileName(value, fileName);
          if (cleaned !== value) {
            next[key] = cleaned;
            changed = true;
          }
        }
        if (!changed) return;
        valuesRef.current = next;
        setValues(next);
        onChangeRef.current?.(next);
      },
    };
    return () => {
      if (valuesControlRef) valuesControlRef.current = null;
    };
  }, [valuesControlRef]);

  const handleSubmit = React.useCallback(() => {
    setTouched(true);
    const found = validateRequiredFields(form.controls, values, form.resultBlock, result);
    if (!result) found.unshift("Выберите результат проверки");
    if (found.length > 0) {
      setProblems(found);
      // Страница (#dob_tasks/<id>) показывает snackbar с предупреждением — форма
      // сама про ошибку молчит только списком под полями.
      onValidationError?.(found);
      return;
    }
    const payload = {};
    for (const control of form.controls) {
      const value = values[control.internalName];
      if (control.kind === "person") {
        const list = asUserList(value).filter((u) => u.Id != null);
        if (list.length > 0 || (control.required && list.length === 0)) {
          payload[control.internalName] = { __userIds: list.map((u) => u.Id), __userMulti: control.multiple };
        }
        continue;
      }
      if (control.kind === "boolean") {
        payload[control.internalName] = value === true;
        continue;
      }
      if (control.kind === "number") {
        const text = String(value ?? "").trim();
        if (text === "") {
          if (control.required) payload[control.internalName] = null;
          continue;
        }
        const num = Number(text.replace(",", "."));
        payload[control.internalName] = Number.isFinite(num) ? num : text;
        continue;
      }
      // Выбор: MultiChoice SharePoint принимает строкой «a;#b», одиночный — строкой.
      if (control.kind === "multichoice") {
        const list = normalizeChoiceValues(value);
        if (list.length === 0) {
          if (control.required) payload[control.internalName] = "";
          continue;
        }
        payload[control.internalName] = list.join(";#");
        continue;
      }
      const text = (control.kind === "select" || control.kind === "choice" || control.kind === "autocomplete")
        ? normalizeChoiceValue(value)
        : String(value ?? "");
      if (text.trim() === "" && !control.required) continue;
      payload[control.internalName] = text;
    }
    // resultField — имя колонки результата (нужно форме ДОБ, чтобы записать MERGE)
    // Наружу отдаём значения в виде для ХРАНЕНИЯ: ссылки на вложения — серверным
    // путём (`/sites/…`), а не адресом dev-прокси `/dob-api/…`.
    const stored = {};
    for (const [key, value] of Object.entries(payload)) {
      stored[key] = typeof value === "string" ? toStorageImages(value) : value;
    }
    onSubmit?.({ result, values: stored, resultField: form.resultBlock?.internalName || resultFieldInternalName || "" });
  }, [form, values, result, resultFieldInternalName, onSubmit, onValidationError]);

  // Отдаём submit наружу (кнопка «Сохранить» в шапке страницы — как у заявки ДОБ).
  React.useEffect(() => {
    if (!submitRef) return undefined;
    submitRef.current = handleSubmit;
    return () => { submitRef.current = null; };
  }, [submitRef, handleSubmit]);

  // Главный рич-текст («Описание результата проверки») показываем отдельной
  // секцией сразу после результата: это основное поле формы, а не «остальное».
  const mainControl = React.useMemo(
    () => form.controls.find((c) => c.kind === "richtext") || null,
    [form.controls],
  );
  const gridControls = React.useMemo(
    () => form.controls.filter((c) => c !== mainControl),
    [form.controls, mainControl],
  );

  // Незаполненные обязательные поля — после попытки сохранить (touched). Нужны,
  // чтобы акцентировать конкретные поля И блоки (результат / описание / остальные).
  const missingControls = React.useMemo(() => {
    if (!touched) return [];
    return form.controls.filter((c) => c.required && isControlEmpty(c, values[c.internalName]));
  }, [touched, form.controls, values]);
  const resultInvalid = touched && !result && (choices.length > 0 || Boolean(form.resultBlock?.required));
  const mainInvalid = missingControls.includes(mainControl);
  const otherInvalid = missingControls.some((c) => c !== mainControl);

  // Ошибка валидации: прокручиваем к первому незаполненному блоку — в длинной
  // форме «Остальные поля» уезжают за экран и ошибку не видно.
  React.useEffect(() => {
    if (problems.length === 0) return;
    const root = contentRef.current;
    if (!root || typeof root.querySelector !== "function") return;
    const node = root.querySelector('[data-ct-invalid="true"]');
    if (!node || typeof node.scrollIntoView !== "function") return;
    try {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      node.scrollIntoView();
    }
  }, [problems]);

  const title = confirmTexts?.title || `Закрытие задачи #${task?.Id ?? ""}`.trim();
  const message = confirmTexts?.message || "";

  const body = (
    <>
        {message && (
          <Typography variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>{message}</Typography>
        )}
        {fieldsQ.isLoading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Загружаю поля типа контента…</Typography>
          </Box>
        )}
        {fieldsQ.isError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Не удалось получить поля типа контента — форма построена по частичным данным.
          </Alert>
        )}

        {!fieldsQ.isLoading && (
          <Stack spacing={1.25} ref={contentRef}>
            {choices.length > 0 && (
              <Box
                sx={{ ...FORM_SECTION_SX, ...(resultInvalid ? FORM_INVALID_SECTION_SX : null) }}
                data-testid="ct-result-block"
                data-ct-invalid={resultInvalid ? "true" : undefined}
              >
                <Box sx={FORM_SECTION_HEAD_SX}>
                  <Box sx={FORM_SECTION_BAR_SX} />
                  <Typography variant="subtitle1" sx={FORM_SECTION_TITLE_SX}>
                    {form.resultBlock?.title || "Результат"}
                    {form.resultBlock?.required ? " *" : ""}
                  </Typography>
                </Box>
                {/* Результирующий выбор — группа кнопок (button group), как в форме ДОБ */}
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={result || null}
                  disabled={submitting}
                  onChange={(_e, next) => {
                    if (next === null) return;
                    setResult(next);
                    if (problems.length) setProblems([]);
                  }}
                  sx={RESULT_TOGGLE_GROUP_SX}
                >
                  {choices.map((choice) => (
                    <ToggleButton key={choice} value={choice} data-testid={`ct-result-choice-${choice}`}>
                      {choice}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            )}

            {mainControl && (
              <Box
                sx={{ ...FORM_SECTION_SX, ...(mainInvalid ? FORM_INVALID_SECTION_SX : null) }}
                data-testid="ct-main-field"
                data-ct-invalid={mainInvalid ? "true" : undefined}
              >
                <Box sx={FORM_SECTION_HEAD_SX}>
                  <Box sx={FORM_SECTION_BAR_SX} />
                  <Typography variant="subtitle1" sx={FORM_SECTION_TITLE_SX}>
                    {mainControl.title}{mainControl.required ? " *" : ""}
                  </Typography>
                </Box>
                <RichEditor
                  value={values[mainControl.internalName] || ""}
                  readOnly={submitting}
                  onChange={(html) => setValue(mainControl.internalName, html)}
                  onUploadImage={onUploadImage}
                  onDeleteImage={onDeleteImage}
                  isUploading={isUploading}
                  invalid={mainInvalid}
                  footer={richFooter}
                />
                {mainControl.description && (
                  <Typography variant="caption" color="text.secondary">{mainControl.description}</Typography>
                )}
              </Box>
            )}

            {gridControls.length > 0 && (
              <Box
                sx={{ ...FORM_SECTION_SX, ...(otherInvalid ? FORM_INVALID_SECTION_SX : null) }}
                data-testid="ct-other-fields"
                data-ct-invalid={otherInvalid ? "true" : undefined}
              >
                <Box sx={FORM_SECTION_HEAD_SX}>
                  <Box sx={FORM_SECTION_BAR_SX} />
                  <Typography variant="subtitle1" sx={FORM_SECTION_TITLE_SX}>Остальные поля</Typography>
                </Box>
                <Box sx={FORM_FIELD_GRID_SX}>
                {gridControls.map((control) => {
              const value = values[control.internalName];
              // Подсветка ИМЕННО незаполненного обязательного поля (после попытки
              // сохранить) — список problems объясняет, что именно не так.
              const invalid = missingControls.includes(control);
              const helper = control.description || (invalid ? "Обязательное поле" : "");
              // ВАЖНО: key НЕ кладём в общий объект — React требует передавать его
              // напрямую в JSX (<TextField key=… {...common} />), иначе варнинг
              // «A props object containing a "key" prop is being spread into JSX».
              const common = { size: "small", fullWidth: true, disabled: submitting };

              if (control.kind === "richtext") {
                return (
                  <Box key={control.internalName} sx={FORM_FIELD_FULL_SX}>
                    <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700, color: invalid ? "#c62828" : "text.primary" }}>
                      {control.title}{control.required ? " *" : ""}
                    </Typography>
                    <RichEditor
                      value={value || ""}
                      readOnly={submitting}
                      onChange={(html) => setValue(control.internalName, html)}
                      onUploadImage={onUploadImage}
                      onDeleteImage={onDeleteImage}
                      isUploading={isUploading}
                      invalid={Boolean(invalid)}
                      footer={richFooter}
                    />
                    {control.description && (
                      <Typography variant="caption" color="text.secondary">{control.description}</Typography>
                    )}
                    {invalid && (
                      <Typography variant="caption" sx={{ display: "block", color: "#c62828", fontWeight: 600 }}>
                        Обязательное поле
                      </Typography>
                    )}
                  </Box>
                );
              }

              if (control.kind === "person") {
                return (
                  // «Пользователь или группа» — широкая ячейка, чтобы имя и чипы
                  // не выезжали за края формы.
                  <Box key={control.internalName} sx={FORM_FIELD_WIDE_SX}>
                    <PersonFieldAutocomplete
                      label={control.title}
                      value={value || []}
                      onChange={(next) => setValue(control.internalName, next)}
                      multiple={control.multiple !== false}
                      required={control.required}
                      disabled={submitting}
                      error={Boolean(invalid)}
                      helperText={helper}
                    />
                  </Box>
                );
              }

              // Поле выбора без свободного ввода — настоящий select (как в форме ДОБ).
              if (control.kind === "select") {
                return (
                  <TextField
                    key={control.internalName}
                    select
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    value={normalizeChoiceValue(value)}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  >
                    <MenuItem value=""><em>— не выбрано —</em></MenuItem>
                    {(control.choices || []).map((choice) => (
                      <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                    ))}
                  </TextField>
                );
              }

              // Многократный выбор: с FillInChoice — автокомплит (можно ввести своё),
              // без — select с множественным выбором.
              if (control.kind === "multichoice") {
                const selected = normalizeChoiceValues(value);
                if (control.allowFillIn === true) {
                  return (
                    <Autocomplete
                      key={control.internalName}
                      multiple
                      freeSolo
                      disableCloseOnSelect
                      disabled={submitting}
                      options={control.choices || []}
                      value={selected}
                      onChange={(_e, next) => setValue(
                        control.internalName,
                        (Array.isArray(next) ? next : []).map((v) => String(v)).filter(Boolean),
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={`${control.title}${control.required ? " *" : ""}`}
                          error={Boolean(invalid)}
                          helperText={helper}
                          size="small"
                          fullWidth
                        />
                      )}
                    />
                  );
                }
                return (
                  <TextField
                    key={control.internalName}
                    select
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    value={selected}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                    SelectProps={{ multiple: true, renderValue: (sel) => (Array.isArray(sel) ? sel : []).join(", ") }}
                  >
                    {(control.choices || []).map((choice) => (
                      <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                    ))}
                  </TextField>
                );
              }

              if (control.kind === "autocomplete" || control.kind === "choice") {
                const freeSolo = control.kind === "autocomplete" && control.allowFillIn !== false;
                return (
                  <Autocomplete
                    key={control.internalName}
                    freeSolo={freeSolo}
                    multiple={control.multiple === true}
                    disabled={submitting}
                    options={control.choices}
                    value={control.multiple
                      ? normalizeChoiceValues(value)
                      : normalizeChoiceValue(value)}
                    onChange={(_e, next) => setValue(control.internalName, next)}
                    onInputChange={freeSolo ? (_e, next, reason) => { if (reason === "input" && typeof value === "string") setValue(control.internalName, next); } : undefined}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`${control.title}${control.required ? " *" : ""}`}
                        error={Boolean(invalid)}
                        helperText={helper}
                        size="small"
                        fullWidth
                      />
                    )}
                  />
                );
              }

              if (control.kind === "number") {
                return (
                  // Высота — как у остальных однострочных полей (см. FORM_NUMBER_FIELD_SX):
                  // у <input type="number"> свой внутренний размер из-за «спиннера».
                  <TextField
                    key={control.internalName}
                    {...common}
                    sx={FORM_NUMBER_FIELD_SX}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    type="number"
                    value={value ?? ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  />
                );
              }

              if (control.kind === "date") {
                return (
                  <TextField
                    key={control.internalName}
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    type="date"
                    value={value || ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                    InputLabelProps={{ shrink: true }}
                  />
                );
              }

              if (control.kind === "boolean") {
                return (
                  <FormControlLabel
                    key={control.internalName}
                    control={(
                      <Checkbox
                        checked={value === true}
                        disabled={submitting}
                        onChange={(e) => setValue(control.internalName, e.target.checked)}
                      />
                    )}
                    label={`${control.title}${control.required ? " *" : ""}`}
                  />
                );
              }

              if (control.kind === "multiline") {
                return (
                  <TextField
                    key={control.internalName}
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    multiline
                    minRows={2}
                    maxRows={6}
                    value={value || ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  />
                );
              }

              return (
                <TextField
                  key={control.internalName}
                  {...common}
                  label={`${control.title}${control.required ? " *" : ""}`}
                  value={value || ""}
                  onChange={(e) => setValue(control.internalName, e.target.value)}
                  error={Boolean(invalid)}
                  helperText={helper}
                />
              );
                })}
                </Box>
              </Box>
            )}

            {form.controls.length === 0 && !fieldsQ.isLoading && (
              <Alert severity="info">
                В типе контента нет полей, доступных для заполнения — выберите результат и сохраните.
              </Alert>
            )}

            {problems.length > 0 && (
              <Alert severity="warning" data-testid="ct-result-dialog-problems">
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                  Заполните обязательные поля (настроены в SharePoint):
                </Typography>
                {problems.map((p) => (
                  <Typography key={p} variant="body2">• {p}</Typography>
                ))}
              </Alert>
            )}

          </Stack>
        )}
    </>
  );

  const actions = (
    <>
      <Button onClick={onClose} disabled={submitting} variant="outlined" sx={FORM_SECONDARY_BUTTON_SX}>
        {cancelLabel || "Отмена"}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={submitting || fieldsQ.isLoading}
        variant="contained"
        startIcon={submitting ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : null}
        sx={{ ...FORM_PRIMARY_BUTTON_SX, minWidth: 140 }}
        data-testid="ct-result-dialog-save"
      >
        {submitLabel || "Сохранить"}
      </Button>
    </>
  );

  // ⭐ Страница формы (#dob_tasks/<id>) — тот же формат, что у заявки ДОБ:
  // секции с заголовками, компактные поля и кнопки внизу, без «диалоговой» рамки.
  if (inline) {
    return (
      <Box
        data-testid="ct-result-dialog"
        sx={{ width: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}
      >
        {body}
        <Box sx={FORM_ACTIONS_SX}>{actions}</Box>
      </Box>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { borderRadius: 1 }, "data-testid": "ct-result-dialog" }}
    >
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        {title}
        {contentTypeName && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 500 }}>
            {contentTypeName}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>{body}</DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25 }}>{actions}</DialogActions>
    </Dialog>
  );
}

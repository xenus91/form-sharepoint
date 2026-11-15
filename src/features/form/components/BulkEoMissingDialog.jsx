import { useEffect, useMemo, useRef, useState } from "react";
/* eslint-disable react/prop-types */
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SendIcon from "@mui/icons-material/Send";
import {
  EO_NUMBER_PATTERN,
  matchRecipientCode,
  parseBulkEoInput,
} from "../lib/bulkEoParser";
import { fetchBulkRecipientOptions, recipientOptionLabel } from "../lib/bulkRecipientLookup";
import { createBulkProblemsPalletItems } from "../lib/bulkSubmit";
import { EO_MISSING_LOCATION, EO_MISSING_PROBLEM } from "../lib/eoMissingRoute";

const formatOperationDate = (value) => {
  if (!value) return "Не выбрана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не выбрана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date).replace(" г.", "");
};

const requestCountLabel = (count) => {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} заявок`;
  const mod10 = count % 10;
  if (mod10 === 1) return `${count} заявка`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} заявки`;
  return `${count} заявок`;
};

const retryCountLabel = (count) => {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} строк`;
  const mod10 = count % 10;
  if (mod10 === 1) return `${count} строку`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} строки`;
  return `${count} строк`;
};

const getDuplicateRowIds = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const eo = String(row?.eoNumber ?? "").trim();
    if (!EO_NUMBER_PATTERN.test(eo)) continue;
    const ids = groups.get(eo) || [];
    ids.push(row.id);
    groups.set(eo, ids);
  }
  const duplicates = new Map();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const rowNumbers = ids.map((id) => rows.findIndex((row) => row.id === id) + 1);
    ids.forEach((id, index) => {
      const otherRows = rowNumbers.filter((_, otherIndex) => otherIndex !== index);
      duplicates.set(id, `Эта ЕО повторяется в строке${otherRows.length > 1 ? "ах" : "е"} ${otherRows.join(", ")}.`);
    });
  }
  return duplicates;
};

const getRowIssues = (row, duplicateMessage = "") => {
  const issues = [];
  if (!String(row?.eoNumber ?? "").trim()) {
    issues.push("Не распознан номер ЕО.");
  } else if (!EO_NUMBER_PATTERN.test(String(row.eoNumber).trim())) {
    issues.push("Номер ЕО должен состоять из 17 или 18 цифр.");
  }
  if (!row?.recipientId) {
    issues.push(row?.recipientCode
      ? `Не сопоставлен получатель ${row.recipientCode}.`
      : "Не распознан код получателя.");
  }
  if (duplicateMessage) issues.push(duplicateMessage);
  return issues;
};

const recipientOptionId = (recipient) => recipient?.id ?? recipient?.ID ?? recipient?.Id;

/**
 * Диалог массовой отправки заявок «Не найдена».
 * Поток: вставка → проверка/сопоставление получателей → общие параметры → отправка.
 */
export default function BulkEoMissingDialog({
  open,
  onClose,
  choices = [],
  initialProblems = [],
  initialLocation = "",
  dcThu = "",
  operationDateIso = null,
  onCheckEoConflict,
  onCreated,
}) {
  const [step, setStep] = useState("input");
  const [sourceText, setSourceText] = useState("");
  const [rows, setRows] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [parseError, setParseError] = useState("");
  const [recipientOptions, setRecipientOptions] = useState([]);
  const [recipientLoadStatus, setRecipientLoadStatus] = useState("idle");
  const [recipientLoadError, setRecipientLoadError] = useState("");
  const [selectedProblems, setSelectedProblems] = useState([EO_MISSING_PROBLEM]);
  const [location, setLocation] = useState(EO_MISSING_LOCATION);
  const [shipment, setShipment] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendProgress, setSendProgress] = useState({ completed: 0, total: 0 });
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflictReview, setConflictReview] = useState(null);
  const [batchSummary, setBatchSummary] = useState(null);
  const latestInitialValues = useRef({ initialProblems, initialLocation });
  latestInitialValues.current = { initialProblems, initialLocation };

  useEffect(() => {
    if (!open || recipientLoadStatus !== "idle") return;
    setRecipientLoadStatus("loading");
    setRecipientLoadError("");
    fetchBulkRecipientOptions()
      .then((options) => {
        setRecipientOptions(options);
        setRecipientLoadStatus("loaded");
      })
      .catch((error) => {
        console.error("Не удалось загрузить получателей для массовой отправки:", error);
        setRecipientLoadError(error?.message || "Не удалось загрузить список получателей.");
        setRecipientLoadStatus("error");
      });
  }, [open, recipientLoadStatus]);

  useEffect(() => {
    if (!open) return;
    const initial = latestInitialValues.current;
    const incomingProblems = Array.isArray(initial.initialProblems) ? initial.initialProblems : [];
    setStep("input");
    setSourceText("");
    setRows([]);
    setParseWarnings([]);
    setParseError("");
    setSelectedProblems([...new Set([EO_MISSING_PROBLEM, ...incomingProblems].filter(Boolean))]);
    setLocation(
      String(initial.initialLocation || "").toLocaleLowerCase("ru-RU").includes("не найдена")
        ? String(initial.initialLocation)
        : EO_MISSING_LOCATION,
    );
    setShipment("");
    setSendError("");
    setSendProgress({ completed: 0, total: 0 });
    setIsCheckingConflicts(false);
    setConflictReview(null);
    setBatchSummary(null);
  }, [open]);

  const problemOptions = useMemo(() => {
    return [...new Set([
      EO_MISSING_PROBLEM,
      ...(Array.isArray(choices) ? choices : []),
      ...selectedProblems,
    ].map((choice) => String(choice ?? "").trim()).filter(Boolean))];
  }, [choices, selectedProblems]);

  const duplicateMessages = useMemo(() => getDuplicateRowIds(rows), [rows]);
  const pendingRows = rows.filter((row) => !["success", "uncertain"].includes(row.requestStatus));
  const pendingIssues = pendingRows.flatMap((row) => getRowIssues(row, duplicateMessages.get(row.id)));
  const readyToSendRows = pendingRows.filter((row) =>
    getRowIssues(row, duplicateMessages.get(row.id)).length === 0,
  );
  const conflictSignature = JSON.stringify({
    dcThu: String(dcThu || "").trim(),
    problems: [...selectedProblems].sort(),
    eos: readyToSendRows.map((row) => String(row.eoNumber).trim()).sort(),
  });
  const conflictReviewForCurrent = conflictReview?.signature === conflictSignature ? conflictReview : null;
  const isTransportationRequired = /отгружен/i.test(String(location));
  const sendDisabled =
    isSending ||
    isCheckingConflicts ||
    readyToSendRows.length === 0 ||
    readyToSendRows.length !== pendingRows.length ||
    !selectedProblems.includes(EO_MISSING_PROBLEM) ||
    !String(location || "").trim() ||
    (isTransportationRequired && !String(shipment || "").trim()) ||
    !String(dcThu || "").trim() ||
    !operationDateIso;

  const handleParse = () => {
    const result = parseBulkEoInput(sourceText);
    setParseWarnings(result.warnings);
    setParseError("");
    if (result.rows.length === 0) {
      setParseError(result.warnings[0] || "Не удалось распознать ни одной пары.");
      return;
    }

    const batchKey = Date.now();
    const mappedRows = result.rows.map((row, index) => {
      const match = matchRecipientCode(row.recipientCode, recipientOptions);
      return {
        ...row,
        id: `${batchKey}-${index + 1}`,
        recipientId: match.recipient ? recipientOptionId(match.recipient) : "",
        recipientMatchStatus: match.status,
        requestStatus: "ready",
        requestMessage: "",
        itemId: null,
      };
    });
    setRows(mappedRows);
    setStep("review");
    setBatchSummary(null);
    setSendError("");
  };

  const updateRow = (rowId, update) => {
    setRows((previous) => previous.map((row) => row.id === rowId
      ? { ...row, ...update, requestStatus: row.requestStatus === "failed" ? "ready" : row.requestStatus, requestMessage: "" }
      : row));
    setBatchSummary(null);
  };

  const handleRecipientChange = (row, recipient) => {
    if (!recipient) {
      updateRow(row.id, { recipientId: "", recipientMatchStatus: "missing" });
      return;
    }
    const code = String(
      recipient.scNumberText || recipient.SCNumberText || recipient.scNumber || recipient.SCNumber || row.recipientCode || "",
    ).trim();
    updateRow(row.id, {
      recipientId: recipientOptionId(recipient),
      recipientCode: code,
      recipientMatchStatus: "manual",
    });
  };

  const handleRemoveRow = (rowId) => {
    setRows((previous) => previous.filter((row) => row.id !== rowId));
    setBatchSummary(null);
  };

  const handleProblemsChange = (event) => {
    const rawValue = event.target.value;
    const values = typeof rawValue === "string" ? rawValue.split(",") : rawValue;
    setSelectedProblems([...new Set([EO_MISSING_PROBLEM, ...(values || [])])]);
  };

  const handleSend = async () => {
    if (sendDisabled) return;
    setIsSending(true);
    setSendError("");
    setBatchSummary(null);
    setSendProgress({ completed: 0, total: readyToSendRows.length });
    const previouslyCreated = rows.filter((row) => row.requestStatus === "success").length;
    const previouslyUncertain = rows.filter((row) => row.requestStatus === "uncertain").length;
    try {
      if (typeof onCheckEoConflict === "function" && !conflictReviewForCurrent) {
        setIsCheckingConflicts(true);
        const conflicts = [];
        for (const row of readyToSendRows) {
          const existing = await onCheckEoConflict(row.eoNumber);
          if (existing) conflicts.push({ rowId: row.id, eoNumber: row.eoNumber, existing });
        }
        setConflictReview({ signature: conflictSignature, conflicts });
        setIsCheckingConflicts(false);
        if (conflicts.length > 0) return;
      }

      const results = await createBulkProblemsPalletItems({
        rows: readyToSendRows,
        dcThu,
        operationDateIso,
        problems: selectedProblems,
        location,
        shipment: isTransportationRequired ? shipment : "",
        onRowResult: (result) => {
          setRows((previous) => previous.map((row) => row.id === result.rowId
            ? {
              ...row,
              requestStatus: result.status,
              requestMessage: result.message,
              itemId: result.itemId,
            }
            : row));
          setSendProgress((previous) => ({ ...previous, completed: previous.completed + 1 }));
        },
      });

      const newlyCreatedCount = results.filter((result) => result.status === "success").length;
      const failedCount = results.filter((result) => result.status === "failed").length;
      const uncertainCount = previouslyUncertain + results.filter((result) => result.status === "uncertain").length;
      setBatchSummary({
        createdCount: previouslyCreated + newlyCreatedCount,
        failedCount,
        uncertainCount,
      });
      if (newlyCreatedCount > 0 && typeof onCreated === "function") onCreated(newlyCreatedCount);
    } catch (error) {
      console.error("Ошибка массовой отправки:", error);
      setSendError(error?.message || "Не удалось начать отправку. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setIsCheckingConflicts(false);
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending && !isCheckingConflicts && typeof onClose === "function") onClose();
  };

  const requestRowsToSend = readyToSendRows.length;
  const hasAttemptedRows = rows.some((row) => row.requestStatus !== "ready");
  const allRowsFinished = rows.length > 0 && pendingRows.length === 0;
  const title = step === "input"
    ? "Массовая отправка потерянных ЕО"
    : step === "review"
      ? "Проверьте распознанные пары"
      : "Параметры для всех заявок";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="bulk-eo-dialog-title"
      PaperProps={{ sx: { borderRadius: 2, maxHeight: "calc(100% - 32px)" } }}
    >
      <DialogTitle id="bulk-eo-dialog-title" sx={{ pr: 6, fontWeight: 800 }}>
        {title}
        <IconButton
          aria-label="Закрыть массовую отправку"
          onClick={handleClose}
          disabled={isSending}
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {step === "input" && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Вставьте пары «код получателя → номер ЕО». Подойдут отдельные строки и копирование двух колонок из Excel; пустые строки и ячейки пропускаются.
            </Typography>
            <TextField
              multiline
              minRows={8}
              maxRows={14}
              fullWidth
              autoFocus
              label="Данные из ТСД или Excel"
              helperText="Распознаются код получателя до 6 цифр и ЕО из 17–18 цифр. Если Excel показывает ЕО в научной записи, задайте столбцу формат «Текст»."
              placeholder={'0294\n808117004022047365\n\n0294\n808117004022002852'}
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value);
                setParseError("");
              }}
              disabled={isSending}
              inputProps={{ "data-testid": "bulk-eo-source" }}
            />
            {recipientLoadStatus === "loading" && (
              <Alert icon={<CircularProgress size={18} />} severity="info">
                Загружаем получателей для автоматического сопоставления…
              </Alert>
            )}
            {recipientLoadStatus === "error" && (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => setRecipientLoadStatus("idle")}>Повторить</Button>}
              >
                {recipientLoadError || "Список получателей недоступен."}
              </Alert>
            )}
            {recipientLoadStatus === "loaded" && recipientOptions.length === 0 && (
              <Alert severity="warning">В SCList нет получателей для сопоставления.</Alert>
            )}
            {parseError && <Alert severity="warning">{parseError}</Alert>}
          </Stack>
        )}

        {step === "review" && (
          <Stack spacing={1.5}>
            <Alert severity="info">
              Найдено пар: <strong>{rows.length}</strong>. Проверьте номер ЕО и сопоставление каждого получателя; неоднозначные коды выберите вручную.
            </Alert>
            {parseWarnings.map((warning, index) => (
              <Alert key={`${warning}-${index}`} severity="warning">{warning}</Alert>
            ))}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, maxHeight: "48vh", overflowY: "auto", pr: 0.5 }}>
              {rows.map((row, index) => {
                const rowIssues = getRowIssues(row, duplicateMessages.get(row.id));
                const selectedRecipient = recipientOptions.find((option) => String(recipientOptionId(option)) === String(row.recipientId)) || null;
                const locked = isSending || ["success", "uncertain"].includes(row.requestStatus);
                return (
                  <Paper key={row.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }} data-testid={`bulk-eo-row-${index + 1}`}>
                    <Stack spacing={1.25}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography variant="subtitle2" fontWeight={800}>#{index + 1}</Typography>
                          {row.sourceLine ? <Typography variant="caption" color="text.secondary">строка {row.sourceLine}</Typography> : null}
                          {row.recipientCode ? <Chip size="small" variant="outlined" label={`Код ${row.recipientCode}`} /> : <Chip size="small" color="warning" label="Код не распознан" />}
                          {row.requestStatus === "success" && <Chip size="small" color="success" label={`Создано #${row.itemId}`} />}
                          {row.requestStatus === "uncertain" && <Chip size="small" color="warning" label="Проверьте в SharePoint" />}
                        </Stack>
                        <IconButton
                          aria-label={`Удалить строку ${index + 1}`}
                          size="small"
                          disabled={locked}
                          onClick={() => handleRemoveRow(row.id)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                        <TextField
                          label="Номер ЕО"
                          size="small"
                          fullWidth
                          value={row.eoNumber}
                          disabled={locked}
                          error={!EO_NUMBER_PATTERN.test(String(row.eoNumber ?? "").trim())}
                          onChange={(event) => updateRow(row.id, { eoNumber: event.target.value.replace(/\D/g, "") })}
                          inputProps={{ inputMode: "numeric", "aria-label": `Номер ЕО, строка ${index + 1}` }}
                        />
                        <Autocomplete
                          options={recipientOptions}
                          value={selectedRecipient}
                          disabled={locked || recipientLoadStatus !== "loaded"}
                          onChange={(_, recipient) => handleRecipientChange(row, recipient)}
                          isOptionEqualToValue={(option, value) => String(recipientOptionId(option)) === String(recipientOptionId(value))}
                          getOptionLabel={recipientOptionLabel}
                          filterSelectedOptions
                          fullWidth
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Получатель"
                              size="small"
                              error={!row.recipientId}
                              helperText={row.recipientId
                                ? row.recipientMatchStatus === "matched" ? "Сопоставлен автоматически" : "Проверьте получателя"
                                : row.recipientMatchStatus === "ambiguous"
                                  ? `Код ${row.recipientCode} найден у нескольких получателей — выберите нужного`
                                  : row.recipientCode ? `Код ${row.recipientCode} не найден — выберите получателя` : "Выберите получателя"}
                            />
                          )}
                        />
                      </Stack>
                      {rowIssues.length > 0 && (
                        <Typography variant="caption" color="error.main">
                          {rowIssues.join(" ")}{row.parseWarning ? ` ${row.parseWarning}` : ""}
                        </Typography>
                      )}
                      {row.requestMessage && (
                        <Alert severity={row.requestStatus === "uncertain" ? "warning" : "error"} sx={{ py: 0 }}>
                          {row.requestMessage}
                        </Alert>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
            {rows.length === 0 && <Alert severity="warning">Все строки удалены. Вернитесь к вставке и распознайте данные заново.</Alert>}
            {recipientLoadStatus === "error" && (
              <Alert severity="error">Список получателей не загрузился, сопоставление невозможно. Закройте диалог и попробуйте снова.</Alert>
            )}
          </Stack>
        )}

        {step === "settings" && (
          <Stack spacing={2}>
            <Alert severity="info">
              Общие параметры применятся ко всем {requestCountLabel(rows.length)}. Для каждой пары будет создан отдельный элемент.
            </Alert>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {rows.map((row, index) => (
                <Chip
                  key={row.id}
                  size="small"
                  variant={row.requestStatus === "success" ? "filled" : "outlined"}
                  color={row.requestStatus === "success" ? "success" : row.requestStatus === "uncertain" ? "warning" : "default"}
                  label={`${index + 1}. ${row.eoNumber || "ЕО не указана"}`}
                />
              ))}
            </Stack>
            <FormControl fullWidth required>
              <InputLabel id="bulk-problems-label">Проблемы для всех заявок</InputLabel>
              <Select
                labelId="bulk-problems-label"
                multiple
                value={selectedProblems}
                onChange={handleProblemsChange}
                label="Проблемы для всех заявок"
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((value) => <Chip key={value} size="small" label={value} />)}
                  </Box>
                )}
              >
                {problemOptions.map((choice) => (
                  <MenuItem key={choice} value={choice} disabled={choice === EO_MISSING_PROBLEM}>
                    <Checkbox checked={selectedProblems.includes(choice)} />
                    <ListItemText primary={choice} />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>«Не найдена» обязательна для этой массовой отправки; при необходимости добавьте другие проблемы.</FormHelperText>
            </FormControl>
            <TextField
              label="Местоположение для всех заявок"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              required
              fullWidth
              disabled={isSending}
              error={!String(location || "").trim()}
            />
            {!String(location || "").trim() && <Alert severity="error">Укажите общее местоположение.</Alert>}
            {isTransportationRequired && (
              <>
                <TextField
                  label="Транспортировка для всех заявок"
                  value={shipment}
                  onChange={(event) => setShipment(event.target.value.replace(/\D/g, ""))}
                  required
                  fullWidth
                  disabled={isSending}
                  error={!String(shipment || "").trim()}
                  inputProps={{ inputMode: "numeric" }}
                />
                {!String(shipment || "").trim() && <Alert severity="error">Введите номер транспортировки для всех заявок.</Alert>}
              </>
            )}
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Stack spacing={0.5}>
                <Typography variant="body2"><strong>РЦ:</strong> {dcThu || "не определён"}</Typography>
                <Typography variant="body2"><strong>Дата начала смены:</strong> {formatOperationDate(operationDateIso)}</Typography>
              </Stack>
            </Paper>
            {!String(dcThu || "").trim() && (
              <Alert severity="error">Не определён РЦ. Закройте диалог, задайте РЦ в главной форме и откройте массовую отправку снова.</Alert>
            )}
            {!operationDateIso && (
              <Alert severity="error">Не выбрана дата начала смены. Выберите её в верхней панели и повторите отправку.</Alert>
            )}
            {conflictReviewForCurrent?.conflicts?.length > 0 && (
              <Alert severity="warning">
                <Typography variant="subtitle2" fontWeight={800}>По некоторым ЕО уже есть заявки с другими проблемами:</Typography>
                <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
                  {conflictReviewForCurrent.conflicts.map((conflict) => {
                    const previousProblems = conflict.existing?.Problems?.results
                      || conflict.existing?.Problems
                      || [];
                    const problemText = Array.isArray(previousProblems)
                      ? previousProblems.join(", ")
                      : String(previousProblems || "другая проблема");
                    return (
                      <li key={`${conflict.rowId}-${conflict.eoNumber}`}>
                        <Typography component="span" variant="body2">
                          ЕО {conflict.eoNumber}: {problemText || "другая проблема"}
                          {conflict.existing?.Location1 ? ` — ${conflict.existing.Location1}` : ""}
                        </Typography>
                      </li>
                    );
                  })}
                </Box>
                <Typography variant="body2">Если вы проверили данные и ЕО действительно не найдена, нажмите «Подтвердить и отправить».</Typography>
              </Alert>
            )}
            {!selectedProblems.includes(EO_MISSING_PROBLEM) && (
              <Alert severity="error">Для массовой отправки требуется проблема «Не найдена».</Alert>
            )}
            {pendingIssues.length > 0 && (
              <Alert severity="warning">
                Перед отправкой исправьте строки с ошибками или вернитесь и удалите их. Готовых строк: {readyToSendRows.length}; требуют исправления: {pendingRows.length - readyToSendRows.length}.
              </Alert>
            )}
            {batchSummary && (
              <Alert severity={batchSummary.failedCount || batchSummary.uncertainCount ? "warning" : "success"}>
                Создано: {batchSummary.createdCount}. Ошибок: {batchSummary.failedCount}. Требуют проверки: {batchSummary.uncertainCount}.
                {batchSummary.failedCount > 0 ? " Можно повторить только строки с подтверждённой ошибкой." : ""}
              </Alert>
            )}
            {sendError && <Alert severity="error">{sendError}</Alert>}
            {isCheckingConflicts && (
              <Alert icon={<CircularProgress size={18} />} severity="info">
                Проверяем недавние заявки по ЕО…
              </Alert>
            )}
            {isSending && !isCheckingConflicts && (
              <Alert icon={<CircularProgress size={18} />} severity="info">
                Отправка: {sendProgress.completed} из {sendProgress.total}.
              </Alert>
            )}
            {allRowsFinished && !isSending && (
              rows.some((row) => row.requestStatus === "uncertain") ? (
                <Alert severity="warning">Отправка завершена, но часть строк требует ручной проверки в SharePoint. Не отправляйте их повторно, пока не проверите результат.</Alert>
              ) : (
                <Alert severity="success">Все заявки созданы. Уже отправленные строки повторно не отправляются.</Alert>
              )
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: "wrap" }}>
        <Button onClick={handleClose} disabled={isSending} color="inherit">
          {allRowsFinished ? "Закрыть" : "Отмена"}
        </Button>
        {step === "input" && (
          <Button
            variant="contained"
            onClick={handleParse}
            disabled={!sourceText.trim() || recipientLoadStatus !== "loaded" || recipientOptions.length === 0}
            endIcon={<ArrowForwardIcon />}
          >
            Распознать
          </Button>
        )}
        {step === "review" && (
          <>
            <Button onClick={() => setStep("input")} startIcon={<ArrowBackIcon />} disabled={isSending}>
              Изменить вставку
            </Button>
            <Button
              variant="contained"
              onClick={() => setStep("settings")}
              disabled={rows.length === 0 || pendingIssues.length > 0 || isSending}
              endIcon={<ArrowForwardIcon />}
            >
              ОК, выбрать проблемы
            </Button>
          </>
        )}
        {step === "settings" && (
          <>
            <Button onClick={() => setStep("review")} startIcon={<ArrowBackIcon />} disabled={isSending}>
              Назад к списку
            </Button>
            {!allRowsFinished && (
              <Button
                variant="contained"
                onClick={handleSend}
                disabled={sendDisabled}
                startIcon={isSending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
              >
                {isCheckingConflicts
                  ? "Проверка…"
                  : isSending
                    ? "Отправка…"
                    : conflictReviewForCurrent?.conflicts?.length > 0
                      ? `Подтвердить и отправить ${requestCountLabel(requestRowsToSend)}`
                      : hasAttemptedRows
                        ? `Повторить ${retryCountLabel(requestRowsToSend)}`
                        : `Отправить ${requestCountLabel(requestRowsToSend)}`}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

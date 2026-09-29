// src/features/tasks/components/TaskCard.jsx
// Extracted from TasksView.jsx — Phase 14 TasksView refactor (§31)
// Pure presentation + inline result/AdditionalActions logic, orchestration stays in TasksView
// ⭐ v8+: promptFields/AA/confirmation/animation — ТОЛЬКО через TaskBehaviour (lookup CT.Name → Title).
// Списки TaskResultDefinitions/TaskPromptFields/TaskActionDefinitions удалены из SP — без legacy-фолбэков.

import React from "react";
import apiClient from "../../../api";
import { getCachedAdditionalActionsDefaultSync } from "../../../tasks/config";
import { fetchResultFieldsMeta, fetchContentTypeResultMap, getResultFieldForTask, getResultChoicesForTask } from "../../../tasks/resultField";
import { resolveTaskBehaviourByName, findContentTypeMeta } from "../../../services/taskBehaviour"; // ⭐ v8: маппинг CT.Name → TaskBehaviour.Title
import { resolveBehaviour, resolveBehaviourCard } from "../../../services/behaviourParser"; // ⭐ v8: парсер/резолвер Behaviour
import { parseRelatedRef, fetchRelatedFields } from "../../../tasks/relatedFields"; // ⭐ поля из связанного элемента (Behaviour.rf)
import { resolveStylingForChoice } from "../../../services/stylingConfig"; // ⭐ v8: парсер/резолвер StylingResultButton → sx
import { formatDueLeft, formatDueDateFull, formatSolveTime } from "../../../tasks/formatters";
import { isCompletedStatus, isNotStartedStatus, isInProgressStatus } from "../../../tasks/status";
import { resolveStylingIcon, isGradient } from "../../../services/stylingConfig";
import { renderStylingIcon } from "../../../services/stylingIcons";
import AdditionalActionsField from "./AdditionalActionsField";
import TaskConfirmNotFoundDialog from "./TaskConfirmNotFoundDialog";
import { ADDITIONAL_ACTIONS_STANDARD } from "../../../tasks/config";
import {
  Box, Paper, Typography, Button, Chip, CircularProgress, Stack, Divider, TextField, IconButton, Tooltip, Autocomplete,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import { keyframes } from "@emotion/react";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

// DBG helper (shared with TasksView)
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch{} };
const __dlogAlways = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.info(...a);}catch{} };
// Forced debug for Phase 17.8 - always log taskResult resolution (user requested)
const __forceTaskDbg = false;


// stripHtml helper (was inline in TasksView, now local)
function stripHtml(html) {
  if (!html) return "";
  const tmp = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "");
  let s = tmp.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  s = s.replace(/\*\*/g, "");
  s = s.replace(/\s*\)+\s*\}+\s*$/, "").replace(/\s+,/g, ",");
  return s;
}

/**
 * Единообразное тело карточки: заголовок (Title) + описание (Body).
 * Если Body начинается с Title — дубль убираем, чтобы не печатать одно и то же дважды.
 * Если Title пуст — заголовком становится первая строка Body.
 *
 * @param {{Title?:string, Body?:string}} task
 * @returns {{title:string, body:string}}
 */
function splitTitleBody(task) {
  const titleText = stripHtml(task?.Title);
  const bodyText = stripHtml(task?.Body);
  const firstLine = (bodyText || "").split("\n")[0].trim();
  const title = titleText || (firstLine ? firstLine.slice(0, 140) : "") || "Без текста";
  if (!bodyText) return { title, body: "" };
  if (titleText) {
    if (bodyText === titleText) return { title, body: "" };
    if (bodyText.startsWith(titleText)) {
      const rest = bodyText.slice(titleText.length).trim();
      if (!rest) return { title, body: "" };
      // Остаток считаем отдельным описанием, только если он начинается как новая фраза
      // (заглавная буква, цифра, кавычка/скобка/тире). Иначе печатаем Body целиком.
      return /^[А-ЯЁA-Z0-9«"'(—–-]/.test(rest) ? { title, body: rest } : { title, body: bodyText };
    }
    return { title, body: bodyText };
  }
  // Заголовка в списке нет — первая строка Body уже стала заголовком, показываем остаток.
  const lines = bodyText.split("\n");
  const rest = lines.slice(1).join("\n").trim();
  if (rest) return { title, body: rest };
  return bodyText.length > title.length ? { title, body: bodyText.slice(title.length).trim() } : { title, body: "" };
}


// ── Значения для Behaviour.rf ───────────────────────────────────────────────────
// Данные для плиток берём из связанного элемента (RelatedItems → ProblemsPallet).
// Если связи нет или запрос не вернул значение — берём поле из САМОЙ задачи:
// enrich.js уже докачивает в неё THU / Recipient / SCNumber / DC_THU.
const PLACEHOLDER_VALUES = new Set(["ео отсутствует", "отсутствует", "нет", "нет данных", "-", "—", "n/a"]);

function cleanValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return cleanValue(value[0]);
  if (typeof value === "object") {
    if (value.results && Array.isArray(value.results)) return cleanValue(value.results[0]);
    if (value.Title !== undefined && value.Title !== null) return cleanValue(value.Title);
    if (value.Value !== undefined && value.Value !== null) return cleanValue(value.Value);
    if (typeof value.StringValue === "string") return cleanValue(value.StringValue);
    return "";
  }
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Читает поле из самой задачи: "THU", "Recipient/SCNumberText", "Recipient_x003a_SCNumberText". */
function readTaskValue(task, path) {
  const rawPath = String(path || "").trim();
  if (!rawPath) return "";
  const [head, tail] = rawPath.split("/");
  const keys = tail
    ? [tail, tail.replace(/Text$/, ""), `${head}_x003a_${tail}`, `${head}_x003A_${tail}`]
    : [head, `${head}Text`, head.replace(/Text$/, "")];
  for (const source of [task, task?.raw]) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = cleanValue(source[key]);
      if (value && !PLACEHOLDER_VALUES.has(value.toLowerCase())) return value;
    }
    if (tail) {
      const node = source[head];
      if (node && typeof node === "object") {
        const value = cleanValue(node[tail]) || cleanValue(node[tail.replace(/Text$/, "")]);
        if (value && !PLACEHOLDER_VALUES.has(value.toLowerCase())) return value;
      }
    }
  }
  return "";
}

const TaskCard = React.memo(function TaskCard({ task, isCompleted, isOverdue, fieldDefaultActions, choices, updatingId, updatingAction, onResultClick, onTakeInWork, onComplete, currentUserId, currentUserTitle, initialAction, resultFieldsMeta: propResultFieldsMeta, ctResultMap: propCtResultMap, taskConfig, pendingAnimation = null }) {
  // ⭐ v8: defaults-принцип. getUiConfig объявлен НИЖЕ getBehaviourRuleForChoice/getButtonSx
  // (зависимости ниже в файле). Реорганизация — поведение из TaskBehaviour,
  // никаких legacy-фолбэков на TaskResultDefinitions/TaskPromptFields.

  // ⭐ v8: резолвер Behaviour rule (маппинг CT.Name → TaskBehaviour.Title) для конкретного choice.
  // Возвращает {promptFields, requiresConfirmed, showAdditionalActions, additionalActionsRequired, source} или null.
  const getBehaviourRuleForChoice = React.useCallback((choiceVal) => {
    const ctId = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
    if (!ctId || !taskConfig?.taskBehaviour || !taskConfig?.ctMetaMap) return null;
    const ctMeta = findContentTypeMeta(ctId, taskConfig.ctMetaMap);
    if (!ctMeta || !ctMeta.name) return null;
    const tb = resolveTaskBehaviourByName(ctMeta.name, taskConfig.taskBehaviour);
    if (!tb || !tb.behaviour || !tb.behaviour.ok) return null;
    return resolveBehaviour(choiceVal, tb.behaviour.value);
  }, [task?.contentTypeId, task?.ContentTypeId, task?.raw, taskConfig?.taskBehaviour, taskConfig?.ctMetaMap]);

  // ⭐ v8: резолвер sx-стилей для кнопки из TaskBehaviour.stylingResultButton (через CT.Name).
  // Возвращает объект для MUI sx или null.
  const getTaskBehaviourConfig = React.useCallback(() => {
    const ctId = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
    if (!ctId || !taskConfig?.taskBehaviour || !taskConfig?.ctMetaMap) return null;
    const ctMeta = findContentTypeMeta(ctId, taskConfig.ctMetaMap);
    if (!ctMeta?.name) return null;
    return resolveTaskBehaviourByName(ctMeta.name, taskConfig.taskBehaviour);
  }, [task?.contentTypeId, task?.ContentTypeId, task?.raw, taskConfig?.taskBehaviour, taskConfig?.ctMetaMap]);

  const getButtonSx = React.useCallback((choiceVal) => {
    const tb = getTaskBehaviourConfig();
    if (!tb?.styling?.ok) return null;
    return resolveStylingForChoice(choiceVal, tb.styling.value);
  }, [getTaskBehaviourConfig]);

  // variant — это проп MUI <Button>, а не CSS: в sx его класть нельзя, поэтому выносим отдельно.
  const getActionStyle = React.useCallback(
    (actionName) => {
      const tb = getTaskBehaviourConfig();
      if (!tb?.stylingActions?.ok) return null;
      const sx = resolveStylingForChoice(actionName, tb.stylingActions.value);
      if (!sx) return null;
      const { variant, ...rest } = sx;
      return { sx: rest, variant: variant || null };
    },
    [getTaskBehaviourConfig]
  );

  const getActionSx = React.useCallback(
    (actionName) => getActionStyle(actionName)?.sx || null,
    [getActionStyle]
  );

  const getActionVariant = React.useCallback(
    (actionName) => getActionStyle(actionName)?.variant || null,
    [getActionStyle]
  );

  // ⭐ Иконки из StylingResultButton / StylingActions (ключ "i").
  const getButtonIcon = React.useCallback(
    (choiceVal) => {
      const tb = getTaskBehaviourConfig();
      if (!tb?.styling?.ok) return null;
      return renderStylingIcon(resolveStylingIcon(choiceVal, tb.styling.value), React.createElement);
    },
    [getTaskBehaviourConfig]
  );

  const getActionIcon = React.useCallback(
    (actionName) => {
      const tb = getTaskBehaviourConfig();
      if (!tb?.stylingActions?.ok) return null;
      return renderStylingIcon(resolveStylingIcon(actionName, tb.stylingActions.value), React.createElement);
    },
    [getTaskBehaviourConfig]
  );

  // ⭐ Карточные поля из связанного элемента: Behaviour.rf (в "_default"/"*"/"_card").
  // Формат: [{ internalName, title, sortOrder }], например [{ f: "THU" }, { f: "Recipient/SCNumberText" }].
  const relatedFieldDefs = React.useMemo(() => {
    const tb = getTaskBehaviourConfig();
    if (!tb?.behaviour?.ok) {
      if (__forceTaskDbg || __DBG_ENABLED__) {
        __dlogAlways("[DBG:TaskCard:relatedFields] нет записи TaskBehaviour для этого типа контента", {
          taskId: task?.Id,
          contentTypeId: String(task?.contentTypeId || task?.ContentTypeId || "").slice(-12),
        });
      }
      return [];
    }
    const card = resolveBehaviourCard(tb.behaviour.value);
    if (__forceTaskDbg || __DBG_ENABLED__) {
      __dlogAlways("[DBG:TaskCard:relatedFields]", {
        taskId: task?.Id,
        matchedBy: tb.matchedBy,
        source: card.source,
        fields: card.relatedFields,
        hasRelatedItems: !!task?.RelatedItems,
      });
    }
    return card.relatedFields;
  }, [getTaskBehaviourConfig, task?.Id, task?.contentTypeId, task?.ContentTypeId, task?.RelatedItems]);

  const relatedRef = React.useMemo(
    () => parseRelatedRef(task?.RelatedItems),
    [task?.RelatedItems]
  );

  const [relatedValues, setRelatedValues] = React.useState(null);
  React.useEffect(() => {
    const dbgOn = __forceTaskDbg || __DBG_ENABLED__;
    if (relatedFieldDefs.length === 0 || !relatedRef) {
      setRelatedValues(null);
      setRelatedLoading(false);
      if (dbgOn && relatedFieldDefs.length > 0) {
        __dlogAlways("[DBG:TaskCard:rf:source]", {
          taskId: task?.Id,
          reason: "нет связи RelatedItems → значения берём из полей самой задачи",
          hasRelatedItems: !!task?.RelatedItems,
          relatedItems: String(task?.RelatedItems || "").slice(0, 200),
          fields: relatedFieldDefs.map((f) => f.internalName),
        });
      }
      return;
    }
    let cancelled = false;
    setRelatedLoading(true);
    if (dbgOn) {
      __dlogAlways("[DBG:TaskCard:rf:request]", {
        taskId: task?.Id,
        listId: relatedRef.listId,
        itemId: relatedRef.itemId,
        fields: relatedFieldDefs.map((f) => f.internalName),
      });
    }
    fetchRelatedFields(relatedRef, relatedFieldDefs).then((values) => {
      if (cancelled) return;
      if (__forceTaskDbg || __DBG_ENABLED__) {
        __dlogAlways("[DBG:TaskCard:rf:response]", {
          taskId: task?.Id,
          itemId: relatedRef.itemId,
          values: Array.isArray(values) ? values.map((v) => ({ f: v.internalName, v: v.value })) : values,
        });
      }
      setRelatedValues(values);
      setRelatedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [relatedFieldDefs, relatedRef, task?.Id, task?.RelatedItems]);

  // Диагностика (?dbg=1): поля настроены, но значений нет — причина видна в консоли.
  React.useEffect(() => {
    if (!(__forceTaskDbg || __DBG_ENABLED__)) return;
    if (relatedFieldDefs.length === 0) return;
    if (Array.isArray(relatedValues) && relatedValues.some((r) => r && r.value)) return;
    __dlogAlways("[DBG:TaskCard:relatedFields:empty]", {
      taskId: task?.Id,
      fields: relatedFieldDefs.map((f) => f.internalName),
      hasRelatedItems: !!task?.RelatedItems,
      relatedItems: String(task?.RelatedItems || "").slice(0, 200),
      relatedRef,
      relatedValues,
    });
  }, [relatedFieldDefs, relatedValues, relatedRef, task?.Id, task?.RelatedItems]);

  const relatedRows = React.useMemo(() => {
    if (relatedFieldDefs.length === 0) return [];
    const zoneByField = new Map(relatedFieldDefs.map((f) => [f.internalName, f.zone || "header"]));
    const rows = [];
    const filled = new Set();
    // 1) значения из связанного элемента
    for (const r of Array.isArray(relatedValues) ? relatedValues : []) {
      if (!r) continue;
      const value = cleanValue(r.value);
      if (!value || PLACEHOLDER_VALUES.has(value.toLowerCase())) continue;
      rows.push({
        internalName: r.internalName,
        title: r.title || r.internalName,
        value,
        source: "related",
        zone: zoneByField.get(r.internalName) || "header",
      });
      filled.add(r.internalName);
    }
    // 2) фолбэк: то же поле есть в самой задаче (обогащение enrich.js)
    for (const f of relatedFieldDefs) {
      if (filled.has(f.internalName)) continue;
      const value = readTaskValue(task, f.internalName);
      if (!value) continue;
      rows.push({
        internalName: f.internalName,
        title: f.title || f.internalName,
        value,
        source: "task",
        zone: f.zone || "header",
      });
    }
    if (__forceTaskDbg || __DBG_ENABLED__) {
      __dlogAlways("[DBG:TaskCard:rf:rows]", {
        taskId: task?.Id,
        rows: rows.map((r) => ({ f: r.internalName, ti: r.title, v: r.value, src: r.source, z: r.zone })),
      });
    }
    return rows;
  }, [relatedValues, relatedFieldDefs, task]);
  // Поля в шапке (по умолчанию) и поля перед описанием ("z": "body").
  const headerRows = React.useMemo(() => relatedRows.filter((r) => r.zone !== "body"), [relatedRows]);
  const bodyRows = React.useMemo(() => relatedRows.filter((r) => r.zone === "body"), [relatedRows]);

  // Диагностика (?dbg=1): что ушло в шапку, а что — перед описанием.
  React.useEffect(() => {
    if (!(__forceTaskDbg || __DBG_ENABLED__)) return;
    if (relatedFieldDefs.length === 0) return;
    const brief = (rows) => rows.map((r) => `${r.title}=${r.value} (${r.source})`);
    __dlogAlways("[DBG:TaskCard:rf:zones]", {
      taskId: task?.Id,
      header: brief(headerRows),
      body: brief(bodyRows),
    });
  }, [headerRows, bodyRows, relatedFieldDefs.length, task?.Id]);
  // Поля настроены, но ещё грузятся — показываем скелетоны, чтобы карточки не «прыгали».
  const [relatedLoading, setRelatedLoading] = React.useState(false);

  // Диагностика (?dbg=1): что именно решил код при нажатии кнопки результата.
  const dbgClick = React.useCallback(
    (choice, decision, rule) => {
      if (!(__forceTaskDbg || __DBG_ENABLED__)) return;
      __dlogAlways("[DBG:click]", {
        taskId: task?.Id,
        choice,
        decision, // "inline-buttons" | "dialog" | "form" | "direct-submit"
        inlineConfirm: rule?.inlineConfirm ?? null,
        requiresConfirmed: rule?.requiresConfirmed ?? null,
        promptFields: rule?.promptFields?.length || 0,
        showAA: rule?.showAdditionalActions ?? null,
        animation: rule?.animation || null,
        ruleSource: rule?.source || null,
      });
    },
    [task?.Id]
  );

  // ⭐ v8: helper для submit — определяет тип анимации и вызывает callback.
  // Приоритет: Behaviour.anim (per choice) → flow default (celebrate для found, sherlock для notFound) → none (extras).
  // Если Behaviour.anim="none" — callback вызывается немедленно, без анимации и задержки.
  const runSubmit = React.useCallback((choiceVal, flowType, submitFn) => {
    const rule = getBehaviourRuleForChoice(choiceVal);
    let anim = rule?.animation || null;
    __dlogAlways("[TaskBehaviour:submit]", { taskId: task?.Id, choice: choiceVal, flowType, rule, animationFromConfig: anim });
    // ⭐ Анимация — ТОЛЬКО из Behaviour.anim. Если ключ не задан — обычный submit
    // без анимации и без задержки (никаких flow default: ни celebrate, ни sherlock).
    if (anim === "celebrate") {
      setCelebrateConfig(rule?.animationConfig || null);
      setShowCelebrate(true);
    } else if (anim === "sherlock") {
      // Текст/эмодзи берём ТОЛЬКО из Behaviour.anim ({"type":"sherlock","title":...,"text":...,"emoji":...}).
      setSherlockConfig(rule?.animationConfig || null);
      setShowSherlock(true);
    }
    if (anim === "none" || !anim) {
      submitFn();
    } else {
      setTimeout(submitFn, 1600);
    }
  }, [getBehaviourRuleForChoice, task?.Id]);

  // ⭐ v8+: defaults-принцип — ТОЛЬКО Behaviour.styling.
  // TaskResultDefinitions.Color/Variant/Gradient и захардкоженный resultConfig.js «найдена»/«не найдена»
  // НЕ применяются для стилей кнопок. Если Behaviour не настроен — возвращаем MUI defaults (variant=contained,
  // color=primary, без gradient).
  const getUiConfig = React.useCallback((choiceVal) => {
    const tbSx = getButtonSx(choiceVal);
    if (tbSx) {
      // bg может быть и градиентом, и плоским цветом: плоский цвет нельзя класть в background-image
      const bgRaw = tbSx.bg || null;
      const gradient = bgRaw && isGradient(bgRaw) ? bgRaw : null;
      return {
        label: undefined,
        variant: tbSx.variant || "contained",
        color: "primary",
        textColor: tbSx.color || null,
        bgColor: bgRaw && !gradient ? bgRaw : null,
        icon: getButtonIcon(choiceVal),
        requiresLocation: false,
        requiresAdditionalActions: false,
        confirm: false,
        gradient,
        _key: "_behaviour",
        _source: "task-behaviour",
      };
    }
    return {
      label: undefined,
      variant: "contained",
      color: "primary",
      requiresLocation: false,
      requiresAdditionalActions: false,
      confirm: false,
      gradient: null,
      _key: "_default",
      _source: "mui-default",
    };
  }, [getButtonSx]);

  // ⭐ v8+: список TaskResultDefinitions удалён в SP — AA/requiresConfirmed управляются
  // ТОЛЬКО через TaskBehaviour (Behaviour.aa / Behaviour.aar / Behaviour.c).
  // Никаких legacy-фолбэков.

  const dueInfo = formatDueLeft(task.DueDate);
  // Заголовок-фолбэк «ТК … • ЕО …» убран: шапка карточки формируется ТОЛЬКО из Behaviour.rf.
  // Нет настроенных полей (или они не загрузились) — шапка пустая, без legacy-подстановок.
  const { title: displayTitle, body: displayBody } = splitTitleBody(task);
  const isUpdating = updatingId === task.Id;
  const isTaking = isUpdating && isNotStartedStatus(task.Status);
  // ⭐ Единый inline-режим: сюда попадает ЛЮБОЙ результат, у которого в Behaviour
  // заданы prompt-поля / доп. действия / подтверждение. Храним сам choice, а не флаг,
  // чтобы форма и подтверждение работали одинаково для «Исправлено» и «Не исправлено».
  const [inlineChoice, setInlineChoice] = React.useState(null);
  // ⭐ NEW: promptFieldValues — object map { fieldInternalName: userValue }
  // Для backward compat: при submit legacy «Сохранить» ниже мы извлекаем .Location1.
  const [promptFieldValues, setPromptFieldValues] = React.useState({});
  // ⭐ NEW: inlineConfirmPending — capture promptValues для передачи в TaskConfirmNotFoundDialog
  // когда RequiresConfirmed=true в SP (sp → inline-mode + confirm-step). Решает кейс «Не исправлено» с комментарием.
  const [inlineConfirmPending, setInlineConfirmPending] = React.useState(null); // { req, acts } | null
  // ⭐ Behaviour.ic: подтверждение двумя кнопками В КАРТОЧКЕ («Создать заявку» / «Отмена»),
  // без диалога и без запроса дополнительных полей.
  const [inlineConfirmOnly, setInlineConfirmOnly] = React.useState(false);
  // Доп. действия по найденной ЕО (AdditionalsActionsRequired + AdditionalActions Multi-Choice Fill-in)
  const [additionalActions, setAdditionalActions] = React.useState(() => {
    // Initial may not have taskConfig yet — use field fallback, will sync via effect when taskConfig loads
    const sync = getCachedAdditionalActionsDefaultSync();
    if (sync !== null) return [...sync];
    if (Array.isArray(fieldDefaultActions)) return [...fieldDefaultActions];
    return [];
  });
  const additionalRequired = additionalActions.length > 0 ? "Да" : "Нет";
  // Helper: defaults from TaskActionDefinitions Default field (per CT) — приоритет над полем AdditionalActions DefaultValue
  const getDefaultsForThisTask = React.useCallback(() => {
    const ctId = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
    const cfg = taskConfig?.ctConfigMap?.get(ctId) || taskConfig?.ctConfigMap?.get("__default");
    if (cfg && cfg.defaultActions !== null && cfg.defaultActions !== undefined) {
      return cfg.defaultActions; // [] = nothing preselected, [values] = preselected
    }
    const sync = getCachedAdditionalActionsDefaultSync();
    if (sync !== null) return sync;
    if (Array.isArray(fieldDefaultActions)) return fieldDefaultActions;
    return []; // user 2026-09-24: if no Default then nothing preselected (was ["Отправить ЕО в OTM"])
  }, [task?.contentTypeId, task?.ContentTypeId, task?.raw, taskConfig, fieldDefaultActions]);
  // Динамическое поле результата для этой задачи (по ContentType) — для открытой задачи всегда свежие choices
  const dynamicFieldMeta = React.useMemo(() => {
    const fromProp = propResultFieldsMeta && propCtResultMap ? getResultFieldForTask(task, propCtResultMap, propResultFieldsMeta) : null;
    if (fromProp) return fromProp;
    // fallback: ищем по raw полям
    if (task.raw) {
      for (const k of Object.keys(task.raw)) {
        if (k.toLowerCase().includes("result") && typeof task.raw[k] === "string") {
          // не хардкодим, просто возвращаем первое
        }
      }
    }
    return null;
  }, [task, propResultFieldsMeta, propCtResultMap]);
  const dynamicInternalName = dynamicFieldMeta?.internalName || "ResultSearchTHU";
  // Эффективные choices для этой задачи: из динамического поля или глобальные choices
  const effectiveChoices = React.useMemo(() => {
    if (dynamicFieldMeta?.choices && dynamicFieldMeta.choices.length > 0) return dynamicFieldMeta.choices;
    return choices;
  }, [dynamicFieldMeta, choices]);
  // Для открытой задачи — подгружаем свежие choices по ContentType с кэшем (forceRefresh уже в родителе, но дублируем для карточки)
  React.useEffect(()=>{ if(!__DBG_ENABLED__) return; try{ const isComp = (()=>{ const k=Object.keys(task.raw||{}); return k.some(kk=>kk.toLowerCase().includes('complete')) || String(task.Title||'').toLowerCase().includes('заверш'); })(); if(isComp) __dlog("[DBG:TaskCard] render completion task", {Id:task.Id, Title:task.Title, Status:task.Status, CT:String(task.ContentTypeId||'').slice(-18), Recipient:task.Recipient||'∅', SCNumber:task.SCNumber||'∅', THU:task.THU||'∅', isCompleted, hasRelated: !!task.RelatedItems, rawKeys: Object.keys(task.raw||{}).filter(k=>k.toLowerCase().includes('result')) }); }catch(_e){void _e;}}, [task.Id, task.Recipient, task.SCNumber, task.Status]);
  const [freshChoices, setFreshChoices] = React.useState(null);
  const [freshField, setFreshField] = React.useState(null);
  React.useEffect(() => {
    if (!isInProgressStatus(task.Status) || isCompleted) {
      setFreshChoices(null);
      setFreshField(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { choices: ch, field } = await getResultChoicesForTask(apiClient, task, { forceRefresh: true });
        if (!cancelled && ch && ch.length > 0) {
          setFreshChoices(ch);
          setFreshField(field);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [task.Id, task.ContentTypeId, task.Status, isCompleted]);
  const displayedChoices = freshChoices || effectiveChoices;
  const displayedFieldMeta = freshField || dynamicFieldMeta;
  // Deep-link (#tasks/id=…&action=found|notfound): открываем inline-форму соответствующего
  // результата. Никаких захардкоженных текстов — форма строится из Behaviour.
  React.useEffect(() => {
    if (!initialAction || isCompleted || !isInProgressStatus(task.Status)) return;
    const list = displayedChoices || choices || [];
    if (!Array.isArray(list) || list.length === 0) return;
    const pick = initialAction === "notfound"
      ? (list.find((ch) => getBehaviourRuleForChoice(ch)?.requiresConfirmed === true) || list[list.length - 1])
      : (list.find((ch) => {
          const r = getBehaviourRuleForChoice(ch);
          return !!r && r.source !== "empty" && r.requiresConfirmed !== true && r.requiresLocation !== true;
        }) || list[0]);
    setInlineChoice(pick || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.Id, initialAction, isCompleted, displayedChoices, choices]);
  const _displayedInternalName = displayedFieldMeta?.internalName || dynamicInternalName; // eslint-disable-line no-unused-vars
  // DEBUG: log taskConfig при изменении (moved after displayedChoices to avoid TDZ)
  React.useEffect(()=>{
    if (__forceTaskDbg || __DBG_ENABLED__) {
      try{
        const ctDbg = String(task?.contentTypeId || task?.ContentTypeId || "").trim();
        __dlogAlways("[DBG:TaskCard:taskConfig]", {
          taskId: task.Id,
          ct: ctDbg,
          hasTaskConfig: !!taskConfig,
          taskBehaviourSize: taskConfig?.taskBehaviour?.size || 0,
          ctMetaResolved: taskConfig?.ctMetaMap?.get?.(ctDbg) || null,
          ctConfig: taskConfig?.ctConfigMap?.get(ctDbg) || null,
          choices, displayedChoices, dynamicInternalName
        });
      }catch(e){ __dlogAlways(e); }
    }
  }, [task.Id, task?.contentTypeId, taskConfig?.taskBehaviour, taskConfig?.ctMetaMap, choices, displayedChoices, dynamicInternalName]);
  React.useEffect(() => {
    const def = getDefaultsForThisTask();
    if (def === null) return;
    // If def is [] and we have hardcoded legacy value, clear it
    const isLegacyHardcoded = additionalActions.length === 1 && additionalActions[0] === "Отправить ЕО в OTM";
    if (def.length === 0 && isLegacyHardcoded) {
      setAdditionalActions([]);
      return;
    }
    if (def.length === 0 && additionalActions.length === 0) return;
    // If task has no selection and def has values, apply def (once)
    if (def.length > 0 && additionalActions.length === 0) {
      setAdditionalActions([...def]);
    } else if (isLegacyHardcoded && def.length > 0 && (def.length !== 1 || def[0] !== "Отправить ЕО в OTM")) {
      setAdditionalActions([...def]);
    } else if (def.length > 0 && additionalActions.length === 0) {
      setAdditionalActions([...def]);
    }
    // If defaults changed while empty, update
  }, [fieldDefaultActions, taskConfig]);
  const [customActionInput, setCustomActionInput] = React.useState("");
  const [additionalError, setAdditionalError] = React.useState("");
  const [showCelebrate, setShowCelebrate] = React.useState(false);
  const [celebrateConfig, setCelebrateConfig] = React.useState(null);
  const [sherlockConfig, setSherlockConfig] = React.useState(null);
  const [showSherlock, setShowSherlock] = React.useState(false);
  // Reset inline modes when task status changes (e.g., after take)
  React.useEffect(() => {
    if (!isInProgressStatus(task.Status)) {
      setInlineChoice(null);
      setInlineConfirmPending(null);
      setInlineConfirmOnly(false);
      setPromptFieldValues({});
      const defReset = getDefaultsForThisTask() || [];
      setAdditionalActions([...defReset]);
      setCustomActionInput("");
      setAdditionalError("");
    }
  }, [task.Status, task.Id, fieldDefaultActions, taskConfig]);
  // Also reset when task changes id
  React.useEffect(() => {
    setInlineChoice(null);
    setInlineConfirmOnly(false);
    setPromptFieldValues({});
    if (Array.isArray(task.AdditionalActions) && task.AdditionalActions.length > 0) {
      setAdditionalActions([...task.AdditionalActions]);
    } else {
      setInlineConfirmPending(null);
      const def = getDefaultsForThisTask() || [];
      setAdditionalActions([...def]);
    }
    setCustomActionInput("");
    setAdditionalError("");
  }, [task.Id, initialAction, isCompleted]);
  React.useEffect(() => {
    if (showCelebrate) {
      const t = setTimeout(() => { setShowCelebrate(false); setCelebrateConfig(null); }, 1600);
      return () => clearTimeout(t);
    }
  }, [showCelebrate]);
  React.useEffect(() => {
    if (showSherlock) {
      const t = setTimeout(() => { setShowSherlock(false); setSherlockConfig(null); }, 1600);
      return () => clearTimeout(t);
    }
  }, [showSherlock]);
  return (
    <Paper
      id={`task-${task.Id}`}
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        pl: { xs: 2, sm: 2.4 },
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        borderRadius: '28px',
        border: "1px solid rgba(23,28,143,0.12)",
        background: isOverdue ? "rgba(229,57,53,0.12)" : isCompleted ? "rgba(46,125,50,0.06)" : "rgba(255,255,255,0.95)",
        backdropFilter: "none",
        overflow: "hidden",
        wordBreak: "break-word",
        position: "relative",
        opacity: isUpdating ? 0.65 : 1,
        pointerEvents: isUpdating ? "none" : "auto",
        transition: "opacity 150ms, box-shadow 180ms ease, border-color 180ms ease",
        // цветовая полоса статуса слева: просрочено / выполнено / в работе
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: "28px 0 0 28px",
          bgcolor: isOverdue ? "#e53935" : isCompleted ? "#2e7d32" : "#171c8f",
          opacity: isCompleted ? 0.5 : 1,
        },
        "&:hover": {
          borderColor: "rgba(23,28,143,0.22)",
          boxShadow: "0 6px 18px rgba(15,18,61,0.10)",
        },
        // content-visibility убран для виртуализованного списка — виртуализатор уже виртуализует,
        // двойная виртуализация оставляла пустое место при закрытии/удалении карточки
        willChange: "transform",
        contain: "layout paint",
      }}
    >
      {__DBG_ENABLED__ && (()=>{ try{ const isCompDbg = (()=>{ const k=Object.keys(task.raw||{}); return k.some(kk=>kk.toLowerCase().includes('complete')) || String(task.Title||'').toLowerCase().includes('заверш'); })(); if(!isCompDbg) return null; }catch{ return null; } return (
        <Box sx={{ position:'absolute', top:4, right:4, zIndex:9, bgcolor:'rgba(255,0,0,0.08)', border:'1px dashed rgba(255,0,0,0.3)', borderRadius:'6px', px:0.6, py:0.2, fontSize:'10px', color:'#b71c1c', pointerEvents:'none', fontFamily:'monospace' }}>
          DBG #{task.Id} C:{String(task.ContentTypeId||'').slice(-8)} R:{task.Recipient?'✓':'∅'} SC:{task.SCNumber?'✓':'∅'}
        </Box>
      );})()}
      {isUpdating && (() => {
        // Никаких текстов под конкретные результаты: оверлей одинаковый для любого действия.
        const action = updatingAction || (isTaking ? "take" : null);
        const isCompleteAction = action === "complete";
        const overlayBg = "rgba(255,255,255,0.82)";
        const spinnerColor = "#5A67D8";
        const titleColor = "#171c8f";
        const titleText = isTaking ? "Беру в работу..." : isCompleteAction ? "Сохранение..." : "Сохранение...";
        const subText = isTaking ? "Подождите, идёт проверка блокировки" : isCompleteAction ? "Отправляю результат и закрываю задачу..." : "Подождите...";
        return (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: overlayBg,
              backdropFilter: "blur(3px)",
              display: "grid",
              placeItems: "center",
              zIndex: 5,
              borderRadius: 1,
              border: "none",
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, p: 2, textAlign: "center" }}>
              <CircularProgress size={32} thickness={4} sx={{ color: spinnerColor }} />
              <Typography variant="body2" sx={{ fontWeight: 800, color: titleColor, textAlign: "center", lineHeight: 1.3 }}>
                {titleText}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", lineHeight: 1.3 }}>
                {subText}
              </Typography>
            </Box>
          </Box>
        );
      })()}
      {(showCelebrate || pendingAnimation?.anim === "celebrate") && (() => {
        const cfgExternal = pendingAnimation?.anim === "celebrate" ? (pendingAnimation.config || null) : null;
        const cfg = cfgExternal || celebrateConfig || null;
        return (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: 1,
            bgcolor: "rgba(232, 245, 233, 0.92)",
            backdropFilter: "blur(3px)",
            border: "1px solid rgba(46,125,50,0.18)",
          }}
        >
          {/* ring centered */}
          <Box
            sx={{
              position: "absolute",
              width: 90,
              height: 90,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "2px solid rgba(46,125,50,0.22)",
              animation: `${celebrateRing} 0.85s ease-out forwards`,
            }}
          />
          {/* central pop emoji like Telegram reaction */}
          <Box
            sx={{
              fontSize: "44px",
              lineHeight: 1,
              filter: "drop-shadow(0 3px 10px rgba(46,125,50,0.30))",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
            }}
          >
            {cfg?.emoji || "🎉"}
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              color: "#1b5e20",
              fontSize: "0.95rem",
              lineHeight: 1.2,
              mt: 1,
              textAlign: "center",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
              animationDelay: "0.08s",
            }}
          >
            {cfg?.title || "Задача исправлена"}
          </Typography>
          <Typography
            sx={{
              color: "#2e7d32",
              fontWeight: 600,
              fontSize: "0.82rem",
              mt: 0.25,
              textAlign: "center",
              opacity: 0.9,
            }}
          >
            {cfg?.text || "Результат сохранён"}
          </Typography>
          {/* floating mini emojis - centered cluster */}
          {["✨", "🌟", "✅", "🎈"].map((em, i) => (
            <Box
              key={i}
              sx={{
                position: "absolute",
                fontSize: i % 2 === 0 ? "18px" : "14px",
                left: `${18 + i * 18}%`,
                top: "50%",
                animation: `${celebrateFloat} 1.2s ease-out ${0.15 + i * 0.09}s forwards`,
                opacity: 0,
              }}
            >
              {em}
            </Box>
          ))}
        </Box>
        );
      })()}
      {(showSherlock || pendingAnimation?.anim === "sherlock") && (() => {
        const cfgExternal = pendingAnimation?.anim === "sherlock" ? (pendingAnimation.config || null) : null;
        const cfg = cfgExternal || sherlockConfig || null;
        return (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: 1,
            bgcolor: "rgba(255, 235, 238, 0.92)",
            backdropFilter: "blur(3px)",
            border: "1px solid rgba(198,40,40,0.18)",
          }}
        >
          {/* ring centered - reddish */}
          <Box
            sx={{
              position: "absolute",
              width: 90,
              height: 90,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "2px solid rgba(198,40,40,0.22)",
              animation: `${celebrateRing} 0.85s ease-out forwards`,
            }}
          />
          {/* central Sherlock icon like Telegram reaction */}
          <Box
            sx={{
              fontSize: "44px",
              lineHeight: 1,
              filter: "drop-shadow(0 3px 10px rgba(198,40,40,0.30))",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
            }}
          >
            {cfg?.emoji || "🕵️"}
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              color: "#b71c1c",
              fontSize: "0.95rem",
              lineHeight: 1.2,
              mt: 1,
              textAlign: "center",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
              animationDelay: "0.08s",
              // текст показываем только если он задан в Behaviour.anim
              ...(cfg?.title ? {} : { display: "none" }),
            }}
          >
            {cfg?.title || ""}
          </Typography>
          <Typography
            sx={{
              color: "#c62828",
              fontWeight: 600,
              fontSize: "0.82rem",
              mt: 0.25,
              textAlign: "center",
              opacity: 0.9,
              // текст показываем только если он задан в Behaviour.anim
              ...(cfg?.text ? {} : { display: "none" }),
            }}
          >
            {cfg?.text || ""}
          </Typography>
          {/* floating mini emojis - detective theme centered cluster */}
          {["🔍", "📋", "❓", "🗂️"].map((em, i) => (
            <Box
              key={i}
              sx={{
                position: "absolute",
                fontSize: i % 2 === 0 ? "18px" : "14px",
                left: `${18 + i * 18}%`,
                top: "50%",
                animation: `${celebrateFloat} 1.2s ease-out ${0.15 + i * 0.09}s forwards`,
                opacity: 0,
              }}
            >
              {em}
            </Box>
          ))}
        </Box>
        );
      })()}
      {/* ── Шапка: поля из Behaviour.rf (ЕО, получатель, ...) + срок / время решения ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1.25 }}>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
          {headerRows.length > 0 ? (
            headerRows.map((row) => (
              <Box
                key={row.internalName}
                title={`${row.title}: ${row.value} (${row.internalName})`}
                sx={{
                  minWidth: 0,
                  maxWidth: "100%",
                  px: 0.9,
                  py: 0.4,
                  borderRadius: "10px",
                  bgcolor: "rgba(23,28,143,0.05)",
                  border: "1px solid rgba(23,28,143,0.10)",
                }}
              >
                <Typography sx={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(15,18,61,0.45)", lineHeight: 1.15 }}>
                  {row.title}
                </Typography>
                <Typography sx={{ fontSize: "0.8rem", fontWeight: 800, color: "#171c8f", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.value}
                </Typography>
              </Box>
            ))
          ) : relatedLoading ? (
            [0, 1].map((i) => (
              <Box key={i} sx={{ width: 96, height: 34, borderRadius: "10px", bgcolor: "rgba(23,28,143,0.05)", border: "1px solid rgba(23,28,143,0.08)" }} />
            ))
          ) : null}
        </Stack>
        {(() => {
          if (isCompleted) {
            const solve = formatSolveTime(task);
            return (
              <Chip
                label={solve.label}
                size="small"
                color="default"
                variant="filled"
                sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0, bgcolor: "#ECEFF1", color: "#37474F", border: "1px solid #CFD8DC" }}
                title={solve.title}
              />
            );
          }
          return (
            <Chip
              label={dueInfo.label}
              size="small"
              color={dueInfo.color === "default" ? "default" : dueInfo.color}
              variant={dueInfo.overdue ? "filled" : "outlined"}
              sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0, display: dueInfo.overdue ? { xs: "none", sm: "inline-flex" } : "inline-flex" }}
              title={formatDueDateFull(task.DueDate)}
            />
          );
        })()}
      </Box>

      {/* ── Заголовок и описание ── */}
      <Box sx={{ mb: 1.25 }}>
        <Typography
          sx={{
            fontWeight: 800,
            color: "#0F123D",
            fontSize: "0.98rem",
            lineHeight: 1.35,
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={displayTitle}
        >
          {displayTitle}
        </Typography>
        {bodyRows.length > 0 && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.6 }}>
            {bodyRows.map((row) => (
              <Chip
                key={row.internalName}
                size="small"
                variant="outlined"
                label={`${row.title}: ${row.value}`}
                title={`${row.title}: ${row.value} (${row.internalName})`}
                sx={{
                  fontWeight: 700,
                  fontSize: "0.74rem",
                  height: 26,
                  borderRadius: "10px",
                  bgcolor: "rgba(23,28,143,0.04)",
                  borderColor: "rgba(23,28,143,0.16)",
                  color: "#0F123D",
                  maxWidth: "100%",
                  "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                }}
              />
            ))}
          </Stack>
        )}
        {displayBody && (
          <Typography
            variant="body2"
            sx={{
              mt: 0.5,
              color: "rgba(15,18,61,0.62)",
              fontSize: "0.86rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={displayBody}
          >
            {displayBody}
          </Typography>
        )}
      </Box>

      {isCompleted ? (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ mb: 1.5, p: 1.25, borderRadius: "10px", bgcolor: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.18)", display: "flex", alignItems: "center", gap: 1.25 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(46,125,50,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: "#1b5e20", fontSize: "0.95rem", lineHeight: 1.2 }}>Задача выполнена</Typography>
              <Typography variant="caption" sx={{ color: "#2e7d32", fontSize: "0.78rem", lineHeight: 1.3, display: "block", mt: 0.15, wordBreak: "break-word" }}>
                Исполнитель: {task.EditorTitle || task.Editor || task.AssignedTo || "—"} • {task.Modified ? new Date(task.Modified).toLocaleString("ru-RU") : "—"}{task.ResultSearchTHU ? ` • ${task.ResultSearchTHU}` : ""}{task.Location1 ? ` • ${task.Location1}` : ""}
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {(() => {
              const resultValue = String(task.ResultSearchTHU || task.ResultValue || "").trim();
              const r = resultValue.toLowerCase();
              const isFound = r === "найден" || r === "найдена";
              const isNotFound = r === "не найдена" || r === "не найден" || r === "не найдено";
              const rSx = resultValue ? getButtonSx(resultValue) : null; // ⭐ StylingResultButton для этого результата
              // Цвет чипа = настроенный в StylingResultButton (bg/c), иначе прежний смысловой fallback
              const styled = rSx?.background || rSx?.color;
              return (
                <Chip
                  label={`Результат: ${resultValue || "—"}`}
                  color={styled ? undefined : isFound ? "success" : isNotFound ? "error" : resultValue ? "success" : "default"}
                  size="small"
                  variant={rSx?.variant === "outlined" ? "outlined" : isFound || isNotFound ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 800,
                    fontSize: "0.72rem",
                    height: 26,
                    borderRadius: "10px",
                    ...(rSx?.background ? { background: rSx.background, color: rSx.color || "#fff", borderColor: "transparent" } : {}),
                    ...(!rSx?.background && rSx?.color ? { color: rSx.color, borderColor: rSx.color } : {}),
                    ...(styled ? { "& .MuiChip-label": { color: rSx?.color || "#fff" } } : {}),
                    ...(!styled && isFound ? { bgcolor: "#2e7d32", color: "#fff", "& .MuiChip-label": { color: "#fff" } } : {}),
                    ...(!styled && isNotFound ? { bgcolor: "#c62828", color: "#fff", "& .MuiChip-label": { color: "#fff" } } : {}),
                  }}
                />
              );
            })()}
            {task.Location1 && <Chip label={`Где найдено: ${task.Location1}`} size="small" variant="outlined" />}
            {task.AdditionalsActionsRequired && (
              <Chip
                label={`Доп. действия: ${task.AdditionalsActionsRequired}`}
                size="small"
                variant="outlined"
                color={task.AdditionalsActionsRequired === "Да" ? "info" : "default"}
              />
            )}
            {Array.isArray(task.AdditionalActions) && task.AdditionalActions.length > 0 && task.AdditionalActions.map((a) => (
              <Chip key={a} label={a} size="small" variant="filled" sx={{ bgcolor: "#E3F2FD", color: "#0D47A1", border: "1px solid #90CAF9", fontWeight: 600 }} />
            ))}
          </Stack>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Статус: {task.Status || "Завершена"} • Изменено: {task.Modified ? new Date(task.Modified).toLocaleString("ru-RU") : "—"}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
              #{task.Id}
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          {(() => {
            const status = task.Status || "";
            const notStarted = isNotStartedStatus(status);
            const inProgress = isInProgressStatus(status);
            const isMine = currentUserId && task.AssignedToId && Number(task.AssignedToId) === Number(currentUserId);
            const editorTitle = task.EditorTitle || task.raw?.Editor?.Title || task.Editor || "";
            const editorId = task.EditorId || task.raw?.Editor?.Id || null;
            const currentTitleNorm = String(currentUserTitle || "").trim().toLowerCase();
            const editorNorm = String(editorTitle || "").trim().toLowerCase();
            const isEditorMine = (!!editorId && !!currentUserId && Number(editorId) === Number(currentUserId)) || (!!currentTitleNorm && !!editorNorm && currentTitleNorm === editorNorm);
            // Show "Взять в работу" only for Не начата
            if (notStarted && !isCompleted) {
              return (
                <>
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      variant="contained"
                      size="large"
                      disabled={isUpdating}
                      onClick={() => onTakeInWork?.(task)}
                      sx={{
                        borderRadius: "12px",
                        fontWeight: 800,
                        textTransform: "none",
                        width: "100%",
                        height: 48,
                        fontSize: "1rem",
                        backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
                        color: "#fff",
                        "&:hover": { backgroundImage: "linear-gradient(180deg, #8D95FF 0%, #6B7CFF 100%)" },
                        "&.Mui-disabled": { backgroundImage: "linear-gradient(180deg, #9BA3FF 0%, #7B84FF 100%)", color: "#fff", opacity: 1 },
                        // ⭐ StylingActions.takeInWork (если задан)
                          // ⭐ StylingActions.takeInWork (если задан)
                      ...(getActionSx("takeInWork") || {}),
                      }}
                    variant={getActionVariant("takeInWork") || "contained"}
                  startIcon={getActionIcon("takeInWork") || undefined}
                    >
                      {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "Взять в работу"}
                    </Button>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                      #{task.Id}
                    </Typography>
                  </Box>
                </>
              );
            }
            if (inProgress && !isCompleted) {
              // If in progress but not mine (other user took), show info instead of buttons
              // Check if task is assigned to someone else: if AssignedToId exists and not mine and group task, we still show buttons for taker, but for others we show "В работе у ..."
              // For group tasks, AssignedTo is group name, Editor is actual taker — use Editor if available
              const taker = task.EditorTitle || task.AssignedTo || task.Editor || "";
              // const showAsMine = true; // removed eslint unused
              // If we can determine it's not mine (group task with Editor different), show locked message
              // For now, if we have isMine flag false and taker exists, show locked for non-taker? But without currentUserTitle we can't know.
              // So we show buttons with hint; the take logic already protects.
              // To implement proper "В работе у X" we need currentUserTitle; fallback: show buttons anyway
              // Let's show buttons, but also show hint who took if not mine
              const isLockedForMe = !isMine && !isEditorMine && taker && taker !== "—";
              if (isLockedForMe) {
                return (
                  <>
                    <Box sx={{ mt: 1.5, p: 1.25, borderRadius: "10px", bgcolor: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.3)" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: "#8d6e00" }}>
                        В работе у {taker}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Задача уже взята другим пользователем. Возьмите другую задачу.
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || taker || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }
              // Mine or unknown — inline UX без диалогов
              if ((displayedChoices || choices).length === 0) {
                return (
                  <>
                    <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
                      Нет доступных результатов (поле ResultSearchTHU пустое или не найдено).
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }
              // Determine found / notFound choices — через конфиг + fallback на legacy строки, без хардкода конкретных значений
              // Для открытой задачи используем displayedChoices (свежие по ContentType)
              const choicesForButtons = displayedChoices || choices;
              // TaskBehaviour: confirm-result is identified by Behaviour.c=true.
              // A direct result (including p=[] and c=false) is the found/completed choice.
              const foundChoice = (() => {
                return choicesForButtons.find((ch) => {
                  const rule = getBehaviourRuleForChoice(ch);
                  if (!rule || rule.source === "empty") return false;
                  if (rule.requiresLocation === true) return false; // ведёт TasksView (диалог местоположения)
                  return rule.requiresConfirmed !== true;
                }) || null;
              })();
              const notFoundChoice = (() => {
                return choicesForButtons.find((ch) => {
                  if (ch === foundChoice) return false;
                  const rule = getBehaviourRuleForChoice(ch);
                  if (!rule || rule.source === "empty") return false;
                  if (rule.requiresLocation === true) return false;
                  return rule.requiresConfirmed === true;
                }) || null;
              })();
              // DEBUG Phase 17.8 — всегда логировать (пользователь просил отладку, сброс кеша не помог)
              if (__forceTaskDbg || __DBG_ENABLED__) {
                try {
                  const ctDbg = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
                  const dbgChoices = choicesForButtons.map(ch=>{
                    const rule = getBehaviourRuleForChoice(ch);
                    const ui = getUiConfig(ch);
                    return {
                      choice: ch,
                      rule: rule ? {
                        promptFields: rule.promptFields.length,
                        showAdditionalActions: rule.showAdditionalActions,
                        requiresConfirmed: rule.requiresConfirmed,
                        additionalActionsRequired: rule.additionalActionsRequired,
                        animation: rule.animation,
                        source: rule.source,
                      } : null,
                      ui: { _source: ui._source, variant: ui.variant, color: ui.color }
                    };
                  });
                  __dlogAlways("[DBG:TaskCard:foundNotFound]", {
                    taskId: task.Id,
                    taskCT: ctDbg.slice(0,60),
                    taskCTfull: ctDbg,
                    hasBehaviour: !!taskConfig?.taskBehaviour,
                    ctMetaResolved: taskConfig?.ctMetaMap?.get?.(ctDbg) || null,
                    dbgChoices,
                    foundChoice, notFoundChoice,
                    displayedChoices: choicesForButtons
                  });
                } catch(e){ __dlogAlways("[DBG:TaskCard:error]", e); }
              }

              // Confirm mode for Не найдена — как Взять в работу, но в красной гамме
              // Input mode для Найдена — inline в карточке (вернули обратно, Phase 17.11)
              // ShowAdditionalActions из TaskResultDefinitions управляет видимостью AdditionalActionsField
              // ★ v8+: promptable-поля берутся ТОЛЬКО из TaskBehaviour. НЕТ legacy fallback на Location1 или иные источники.
              //   Если Behaviour.p пустой или Behaviour не настроен — никаких дополнительных полей не показываем.
              //   ShowAdditionalActions → Behaviour.aa, requiresConfirmed → Behaviour.c — обе только из Behaviour.
              if (inlineChoice) {
                const behaviourRuleForFound = getBehaviourRuleForChoice(inlineChoice);
                // ⭐ v8+: showAAInline строго из Behaviour.aa. null/true → без UI (defaults), true → показать AA inline.
                const showAAInline = behaviourRuleForFound?.showAdditionalActions === true;
                // ⭐ v8+: promptFields строго из Behaviour. Без Behaviour — пусто (никаких legacy Location1).
                const promptFields = behaviourRuleForFound?.promptFields || [];
                // debug
                if (__forceTaskDbg || __DBG_ENABLED__) __dlogAlways("[DBG:TaskCard:showAA]", {inlineChoice, behaviourRule: behaviourRuleForFound, showAAInline, promptFields});
                const validateAdditional = () => {
                  if (!showAAInline) { setAdditionalError(""); return true; }
                  setAdditionalError("");
                  return true;
                };
                const validatePromptFields = () => {
                  // Validate Required поля
                  const missing = (promptFields || []).filter((f) => f.required && !String(promptFieldValues[f.internalName] || "").trim());
                  if (missing.length) {
                    setAdditionalError(`Заполните обязательные поля: ${missing.map(m => m.title).join(", ")}`);
                    return false;
                  }
                  setAdditionalError("");
                  return true;
                };
                return (
                  <>
                    <Box sx={{ mt: 1.25 }}>
                      {/* ⭐ NEW: динамический рендер promptable-полей из TaskPromptFields (или 1 legacy Location1) */}
                      {(promptFields || []).map((f, idx) => (
                        <TextField
                          key={f.internalName}
                          value={promptFieldValues[f.internalName] ?? ""}
                          onChange={(e) => setPromptFieldValues({ ...promptFieldValues, [f.internalName]: e.target.value })}
                          placeholder={f.title || f.internalName}
                          label={f.title}
                          size="small"
                          fullWidth
                          multiline={f.type === "multiline"}
                          minRows={f.type === "multiline" ? 2 : undefined}
                          maxRows={f.type === "multiline" ? 4 : undefined}
                          disabled={isUpdating}
                          autoFocus={idx === 0}
                          required={!!f.required}
                          error={Boolean(additionalError && f.required && !String(promptFieldValues[f.internalName] || "").trim())}
                          sx={{
                            mb: 1,
                            "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#fff", fontSize: "0.95rem" },
                            "& .MuiInputBase-input::placeholder": { opacity: 0.7 },
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && f.type !== "multiline") {
                              e.preventDefault();
                              if (!validatePromptFields()) return;
                              if (!validateAdditional()) return;
                              const acts = showAAInline ? additionalActions : [];
                              const req = showAAInline ? additionalRequired : "Нет";
                              // ⭐ v8+: requiresConfirmed строго из Behaviour.c. Никаких legacy-фолбэков.
                              if (behaviourRuleForFound?.requiresConfirmed === true) {
                                setInlineConfirmPending({ req, acts });
                                return;
                              }
                              runSubmit(inlineChoice, "inline", () => {
                                if (onComplete) onComplete(task, inlineChoice, promptFieldValues, req, acts);
                                else onResultClick(task, inlineChoice);
                              });
                            }
                          }}
                        />
                      ))}
                      {showAAInline && (
                      <Box sx={{ width: '100%', mb: 1.5 }}>
                          <Box
                            sx={{
                              position: 'relative',
                              width: '100%',
                              borderRadius: '28px',
                              backgroundColor: '#F1F3F4',
                              overflow: 'visible',
                              p: '3px',
                              '&:has(.Mui-expanded)': { borderRadius: '28px 28px 0 0' },
                            }}
                          >
                            <AdditionalActionsField
                              fieldInternalName={taskConfig?.ctConfigMap?.get(String(task.contentTypeId || task.ContentTypeId || "").trim())?.additionalActionsField?.internalName || "AdditionalActions"}
                              required={additionalActions.length > 0}
                              choices={(taskConfig?.ctConfigMap?.get(String(task.contentTypeId || task.ContentTypeId || "").trim())?.additionalActionsField?.choices || ADDITIONAL_ACTIONS_STANDARD).map(v=>typeof v==='string'?{value:v,label:v}:v)}
                              allowFillIn={taskConfig?.ctConfigMap?.get(String(task.contentTypeId || task.ContentTypeId || "").trim())?.additionalActionsField?.allowFillIn ?? true}
                              value={additionalActions}
                              onChange={(next)=>{ setAdditionalActions(next); if (additionalError) setAdditionalError(""); if (customActionInput) setCustomActionInput(""); }}
                              error={additionalError}
                              disabled={isUpdating}
                            />
                          </Box>
                          {additionalError && (
                            <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 0.75 }}>{additionalError}</Typography>
                          )}
                          {additionalActions.length > 0 && !additionalError && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>Выбрано: {additionalActions.length} — {additionalActions.join(", ")}</Typography>
                          )}
                        </Box>
                      )}
                      {additionalError && additionalActions.length === 0 && (
                        <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mb: 1 }}>{additionalError}</Typography>
                      )}
                      {/* Кнопки сохранить/отмена нужны только если есть что заполнять */}
                      {(promptFields.length > 0 || showAAInline || inlineConfirmOnly) && (
                      <Button
                        variant="contained"
                        color="success"
                        disabled={isUpdating}
                        onClick={() => {
                          if (!validatePromptFields()) return;
                          if (!validateAdditional()) return;
                          const acts = showAAInline ? additionalActions : [];
                          const req = showAAInline ? (additionalActions.length > 0 ? "Да" : "Нет") : "Нет";
                          // ⭐ v8+: requiresConfirmed строго из Behaviour.c.
                          if (behaviourRuleForFound?.requiresConfirmed === true) {
                            setInlineConfirmPending({ req, acts });
                            return;
                          }
                          runSubmit(inlineChoice, "inline", () => {
                            if (onComplete) onComplete(task, inlineChoice, promptFieldValues, req, acts);
                            else onResultClick(task, inlineChoice);
                          });
                        }}
                        sx={{
                          borderRadius: "12px",
                          fontWeight: 800,
                          textTransform: "none",
                          width: "100%",
                          height: 48,
                          fontSize: "1rem",
                          backgroundImage: "linear-gradient(180deg, #43a047 0%, #2e7d32 100%)",
                          color: "#fff",
                          "&:hover": { backgroundImage: "linear-gradient(180deg, #66bb6a 0%, #388e3c 100%)" },
                          "&.Mui-disabled": { backgroundImage: "linear-gradient(180deg, #a5d6a7 0%, #66bb6a 100%)", color: "#fff", opacity: 1 },
                          ...(getActionSx("promptSubmit") || {}),
                        }}
                        variant={getActionVariant("promptSubmit") || "contained"}
                        startIcon={getActionIcon("promptSubmit") || undefined}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : (inlineConfirmOnly ? (behaviourRuleForFound?.confirmTexts?.okText || "Подтвердить") : `Сохранить — ${inlineChoice}`)}
                      </Button>
                      )}
                      {(promptFields.length > 0 || showAAInline || inlineConfirmOnly) && (
                      <Button
                        variant="text"
                        onClick={() => {
                          setInlineChoice(null);
                          setInlineConfirmPending(null);
                          setInlineConfirmOnly(false);
                          setPromptFieldValues({});
                          setAdditionalActions([]);
                          setCustomActionInput("");
                          setAdditionalError("");
                        }}
                        disabled={isUpdating}
                        variant={getActionVariant("promptCancel") || "text"}
                        startIcon={getActionIcon("promptCancel") || undefined}
                        sx={{ width: "100%", mt: 0.5, borderRadius: "12px", fontWeight: 700, textTransform: "none", color: "text.secondary", height: 32, ...(getActionSx("promptCancel") || {}) }}
                      >
                        {inlineConfirmOnly ? (behaviourRuleForFound?.confirmTexts?.cancelText || "Отмена") : "Отмена"}
                      </Button>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                    {/* ⭐ PR: inline confirm-step если RequiresConfirmed=true из SP. Кнопка «Сохранить» в этом
                        случае НЕ submit напрямую — открывает этот диалог поверх inline-формы. После confirm
                        completeTask вызывается с promptFieldValues (включая Comment из TaskPromptFields). */}
                    <TaskConfirmNotFoundDialog
                      confirmSx={getActionSx("confirm") || null}
                      cancelSx={getActionSx("cancel") || null}
                      confirmIcon={getActionIcon("confirm") || null}
                      cancelIcon={getActionIcon("cancel") || null}
                      confirmVariant={getActionVariant("confirm") || "contained"}
                      cancelVariant={getActionVariant("cancel") || null}
                      open={!!inlineConfirmPending}
                      onClose={() => setInlineConfirmPending(null)}
                      pendingTask={task}
                      pendingResult={inlineChoice}
                      updatingId={updatingId}
                      confirmTexts={behaviourRuleForFound?.confirmTexts || null}
                      onConfirm={(t, r) => {
                        const p = inlineConfirmPending;
                        setInlineConfirmPending(null);
                        runSubmit(inlineChoice, "inline", () => {
                          if (onComplete) onComplete(t, r, promptFieldValues, p?.req || "Нет", p?.acts || []);
                          else onResultClick(t, r);
                        });
                      }}
                    />
                  </>
                );
              }

              // Default: show two buttons 50%
              return (
                <>
                  <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {notFoundChoice && (() => {
                      const cfg = getUiConfig(notFoundChoice);
                      const tbSx = getButtonSx(notFoundChoice); // ⭐ v8: StylingResultButton → sx
                      return (
                      <Button
                        variant={tbSx?.variant || cfg.variant}
                        color={cfg.color}
                        startIcon={cfg.icon || undefined}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => {
                          const rule = getBehaviourRuleForChoice(notFoundChoice);
                          const needsForm = (rule?.promptFields?.length || 0) > 0 || rule?.showAdditionalActions === true;
                          setInlineChoice(notFoundChoice);
                          setInlineConfirmPending(null);
                          if (needsForm) {
                            dbgClick(notFoundChoice, "form", rule);
                            setInlineConfirmOnly(false);
                            return;
                          }
                          // ⭐ Если вводить нечего: при Behaviour.ic — две кнопки в карточке,
                          // иначе — диалог подтверждения (без промежуточной кнопки «Сохранить»).
                          if (rule?.inlineConfirm === true) { dbgClick(notFoundChoice, "inline-buttons", rule); setInlineConfirmOnly(true); }
                          else { dbgClick(notFoundChoice, "dialog", rule); setInlineConfirmPending({ req: "Нет", acts: [] }); }
                        }}
                        sx={{
                          borderRadius: "12px",
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(tbSx || {}),
                          ...(cfg.gradient ? { backgroundImage: cfg.gradient, color: cfg.textColor || "#fff", borderColor: "transparent" } : {}),
                          ...(cfg.bgColor ? { backgroundImage: "none", backgroundColor: cfg.bgColor, color: cfg.textColor || "#fff", borderColor: "transparent" } : {}),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : notFoundChoice}
                      </Button>
                      );
                    })()}
                    {foundChoice && (() => {
                      const cfg = getUiConfig(foundChoice);
                      const tbSx = getButtonSx(foundChoice); // ⭐ v8: StylingResultButton → sx
                      return (
                      <Button
                        variant={tbSx?.variant || cfg.variant}
                        color={cfg.color}
                        startIcon={cfg.icon || undefined}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => {
                          const rule = getBehaviourRuleForChoice(foundChoice);
                          // Для p=[] и c=false результат отправляется сразу; celebrate запускается
                          // в runSubmit без промежуточного prompt-экрана.
                          // Правил нет или они «прямые» (без prompt/AA/confirm) — завершаем сразу.
                          // Никаких строковых спец-случаев: поток задаётся только Behaviour.
                          const icRule = rule?.inlineConfirm === true;
                          if (!rule || (rule.promptFields.length === 0 && rule.requiresConfirmed !== true && rule.showAdditionalActions !== true && !icRule)) {
                            dbgClick(foundChoice, "direct-submit", rule);
                            runSubmit(foundChoice, "found", () => {
                              if (onComplete) onComplete(task, foundChoice, {}, "Нет", []);
                              else onResultClick(task, foundChoice);
                            });
                            return;
                          }
                          if (Array.isArray(task.AdditionalActions) && task.AdditionalActions.length > 0) {
                            setAdditionalActions([...task.AdditionalActions]);
                          } else {
                            const def = getDefaultsForThisTask() || [];
                            setAdditionalActions([...def]);
                          }
                          setPromptFieldValues({});
                          setAdditionalError("");
                          setCustomActionInput("");
                          setInlineConfirmPending(null);
                          // ⭐ Behaviour.ic: две кнопки в карточке, без диалога и без полей
                          dbgClick(foundChoice, icRule ? "inline-buttons" : "form", rule);
                          setInlineConfirmOnly(icRule);
                          setInlineChoice(foundChoice);
                        }}
                        sx={{
                          borderRadius: "12px",
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(tbSx || {}),
                          ...(cfg.gradient ? { backgroundImage: cfg.gradient, color: cfg.textColor || "#fff", borderColor: "transparent" } : {}),
                          ...(cfg.bgColor ? { backgroundImage: "none", backgroundColor: cfg.bgColor, color: cfg.textColor || "#fff", borderColor: "transparent" } : {}),
                          ...(!cfg.gradient && !cfg.bgColor ? { color: cfg.textColor || "#fff" } : {}),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : foundChoice}
                      </Button>
                      );
                    })()}
                    {/* Render any extra choices — через RESULT_UI_CONFIG, _default теперь зелёная */}
                    {(displayedChoices || choices).filter((c) => c !== foundChoice && c !== notFoundChoice).map((choice) => {
                      const cfg = getUiConfig(choice);
                      const tbSx = getButtonSx(choice); // ⭐ v8: StylingResultButton → sx
                      const isContained = (tbSx?.variant || cfg.variant) === "contained";
                      return (
                      <Button
                        key={choice}
                        variant={tbSx?.variant || cfg.variant}
                        color={cfg.color}
                        startIcon={cfg.icon || undefined}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => {
                          const rule = getBehaviourRuleForChoice(choice);
                          const needsForm = (rule?.promptFields?.length || 0) > 0 || rule?.showAdditionalActions === true;
                          if (rule?.inlineConfirm === true && !needsForm) {
                            dbgClick(choice, "inline-buttons", rule);
                            setInlineChoice(choice);
                            setInlineConfirmPending(null);
                            setInlineConfirmOnly(true);
                            return;
                          }
                          dbgClick(choice, "direct-submit", rule);
                          onResultClick(task, choice);
                        }}
                        sx={{
                          borderRadius: "12px",
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(tbSx || {}),
                          ...(isContained && cfg.gradient ? { backgroundImage: cfg.gradient, color: cfg.textColor || "#fff", borderColor: "transparent", "&:hover": { backgroundImage: cfg.gradient, filter: "brightness(0.92)" } } : {}),
                          ...(isContained && cfg.bgColor ? { backgroundImage: "none", backgroundColor: cfg.bgColor, color: cfg.textColor || "#fff", borderColor: "transparent", "&:hover": { backgroundColor: cfg.bgColor, filter: "brightness(0.92)" } } : {}),
                          ...(!isContained ? { borderWidth: 1.5 } : {}),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: isContained ? "#fff" : "inherit" }} /> : choice}
                      </Button>
                      );
                    })}
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                      #{task.Id}
                    </Typography>
                  </Box>
                </>
              );
            }
            // Fallback for other statuses (e.g., unknown) — treat as not started
            return (
              <>
                <Box sx={{ mt: 1.5 }}>
                  <Button
                    variant="contained"
                    size="large"
                    disabled={isUpdating}
                    onClick={() => onTakeInWork?.(task)}
                    sx={{
                      borderRadius: "12px",
                      fontWeight: 800,
                      textTransform: "none",
                      width: "100%",
                      height: 48,
                      fontSize: "1rem",
                      backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
                      color: "#fff",
                      "&:hover": { backgroundImage: "linear-gradient(180deg, #8D95FF 0%, #6B7CFF 100%)" },
                    ...(getActionSx("takeInWork") || {}),
                    }}
                  variant={getActionVariant("takeInWork") || "contained"}
                  startIcon={getActionIcon("takeInWork") || undefined}
                  >
                    {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "Взять в работу"}
                  </Button>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                    #{task.Id}
                  </Typography>
                </Box>
              </>
            );
          })()}
        </>
      )}
      {!isCompleted && dueInfo.overdue && (
        <Box sx={{ display: { xs: "flex", sm: "none" }, mt: 1.5, pt: 1, borderTop: "1px solid rgba(0,0,0,0.06)", justifyContent: "flex-start", alignItems: "center", gap: 1 }}>
          <Chip label={dueInfo.label} size="small" color={dueInfo.color === "default" ? "default" : dueInfo.color} variant="filled" sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24 }} title={formatDueDateFull(task.DueDate)} />
        </Box>
      )}
    </Paper>
  );
});


export default TaskCard;

const celebratePop = keyframes`
  0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
  15% { transform: scale(1.25) rotate(5deg); opacity: 1; }
  30% { transform: scale(1) rotate(0deg); opacity: 1; }
  80% { transform: scale(1) translateY(0); opacity: 1; }
  100% { transform: scale(0.9) translateY(-12px); opacity: 0; }
`;
const celebrateFloat = keyframes`
  0% { transform: translateY(0) scale(0.6) rotate(0deg); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-90px) scale(1.1) rotate(12deg); opacity: 0; }
`;
const celebrateRing = keyframes`
  0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
`;


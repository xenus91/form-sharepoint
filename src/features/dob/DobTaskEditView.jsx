// src/features/dob/DobTaskEditView.jsx
// Full-screen edit form for single DOB item — with rich ChekResult editor
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Box, Button, Chip, CircularProgress, LinearProgress, Typography, Stack, Alert, Paper, TextField, MenuItem, Checkbox, FormControlLabel, Divider, IconButton, Tooltip, AppBar, Toolbar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { getDobFields, getDobItem, updateDobItem, uploadDobAttachment, getDobAttachments, deleteDobAttachment, getDobContentTypeFields, takeDobTaskInWork } from './api/dobApi';
import { DOB_LIST_GUID } from './api/dobClient';
import { useNotifications } from '../../NotificationsProvider';
import RichEditor from './components/RichEditor';
import RelatedItemDialog from './components/RelatedItemDialog';
import { isHiddenFormField, getODataValue, looksLikeHtml, normalizeHtmlValue, toEditorHtml } from './lib/dobFormFields';
import { fileNameFromSrc, removeImgByFileName, removedImgSrcs, removedImgSrcsByValues, sameFormValues } from './lib/richImages';
import { attachmentDisplayUrl, toDisplayImages, toStorageImages } from './lib/attachmentUrl';
import { fieldsWithBase64, materializeRichValues } from './lib/materializeRichImages';
import ContentTypeResultDialog from '../tasks/components/ContentTypeResultDialog';
import { FIELD_LABEL_OVERRIDES, contentTypeIdOf, isDialogRequired, normalizeChoiceValue, normalizeChoiceValues, taskContentTypeName } from '../../tasks/contentTypeFields';
import { useTaskConfiguration } from '../tasks/hooks/useTaskConfiguration';
import { markDobTask } from '../../services/taskBehaviour';
import {
  FORM_ACTIONS_SX,
  FORM_APPBAR_SX,
  FORM_FIELD_GRID_SX,
  FORM_PAGE_SX,
  FORM_PRIMARY_BUTTON_SX,
  FORM_SECONDARY_BUTTON_SX,
  FORM_SECTION_BAR_SX,
  FORM_SECTION_HEAD_SX,
  FORM_SECTION_SX,
  FORM_SECTION_TITLE_SX,
  FORM_TASK_HEAD_SX,
  FORM_FIELD_WIDE_SX,
  FORM_INVALID_SECTION_SX,
  FORM_NUMBER_FIELD_SX,
} from './lib/formStyles';
import PersonFieldAutocomplete from '../tasks/components/PersonFieldAutocomplete';

/** Ссылка на вложение для браузера (в dev — через прокси /dob-api, в prod — origin). */
function attachmentHref(serverRelativeUrl) {
  return attachmentDisplayUrl(serverRelativeUrl);
}

/**
 * Вложения задачи/заявки (изображения из rich-текста попадают сюда, их может быть
 * несколько). Один и тот же блок в обеих ветках формы.
 */
function renderAttachments({ attachments = [], onDelete, note = true, inside = false, emptyHint = false } = {}) {
  if (!attachments.length) {
    if (!emptyHint) return null;
    return (
      <Box data-testid="dob-attachments" data-empty="true">
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AttachFileIcon sx={{ fontSize: 15 }} /> Вложений пока нет — картинки из текста сохраняются вложениями и появятся здесь.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ mt: inside ? 0 : 1 }} data-testid="dob-attachments">
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <AttachFileIcon fontSize="small" /> Вложения ({attachments.length}):
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
        {attachments.map((a) => {
          const fileName = a.FileName || a.ServerRelativeUrl?.split('/').pop();
          const href = attachmentHref(a.ServerRelativeUrl);
          return (
            <Chip
              key={a.FileName || a.ServerRelativeUrl || fileName}
              label={fileName}
              size="small"
              clickable
              onClick={() => { if (href) window.open(href, '_blank'); }}
              onDelete={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(a.FileName); }}
              deleteIcon={<Tooltip title="Удалить вложение"><DeleteIcon fontSize="small" /></Tooltip>}
              sx={{ maxWidth: 220 }}
            />
          );
        })}
      </Stack>
      {note && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Удаление вложения также уберёт картинку из текста (если она там есть) — не забудьте Сохранить.
        </Typography>
      )}
    </Box>
  );
}

/**
 * Убрать картинку файла из ВСЕХ rich-значений формы ({ internalName: html }).
 * Возвращает новый объект только если что-то реально изменилось (иначе `null`) —
 * чтобы не гонять ререндер зря.
 */
function stripAttachmentFromValues(values, fileName) {
  if (!values || !fileName) return null;
  let changed = false;
  const next = { ...values };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value.includes('<img')) continue;
    const cleaned = removeImgByFileName(value, fileName);
    if (cleaned !== value) {
      next[key] = cleaned;
      changed = true;
    }
  }
  return changed ? next : null;
}

/**
 * Описание задачи для тела формы: снимаем rich-теги, но СОХРАНЯЕМ абзацы —
 * иначе многострочное описание слипается в одну строку (`white-space: pre-wrap`).
 */
function taskDescriptionText(raw) {
  if (!raw) return '';
  const html = looksLikeHtml(raw) ? String(raw) : '';
  if (!html) return String(raw).trim();
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
import { resolveRelatedRef } from './lib/relatedItem';
import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from '../../tasks/status';


function isEditableField(f) {
  if (!f) return false;
  if (f.ReadOnlyField) return false;
  if (f.Hidden) return false;
  // Поля с формулой — только чтение (Calculated даже если TypeAsString = Text/DateTime)
  if (f.Formula) return false;
  if (f.SchemaXml && /Formula\s*=/.test(f.SchemaXml)) return false;
  const t = (f.TypeAsString || '').toLowerCase();
  if (['calculated','computed','counter','contenttypeid','lookup','attachments','file','guid','modstat'].includes(t)) return false;
  return true;
}

// listGuid — какой список редактируем. По умолчанию — список заявок ДОБ
// (раздел «Заявки ДОБ»). #tasks передаёт сюда GUID списка задач источника
// (например, RequestsTask ООБ), чтобы форма работала как dob_tasks/[id],
// но с полями и сохранением именно в список задачи.
// onBackHash — куда возвращает кнопка «Назад» (по умолчанию #dob_tasks).
// ── Поля формы по ТИПАМ колонок SharePoint ────────────────────────────────────
const CHOICE_TYPES = new Set(['choice', 'multichoice', 'gridchoice', 'combobox', 'outcomechoice']);
const USER_TYPES = new Set(['user', 'usermulti']);

function choicesOfField(field) {
  const raw = field?.Choices;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
  return list.map((v) => String(v).trim()).filter(Boolean);
}

function typeOfField(field) {
  return String(field?.TypeAsString || '').trim().toLowerCase();
}

/** Поле выбора: тип из семейства Choice ЛИБО в метаданных есть Choices. */
function isChoiceField(field) {
  const t = typeOfField(field);
  if (CHOICE_TYPES.has(t)) return true;
  return choicesOfField(field).length > 0 && !USER_TYPES.has(t) && t !== 'lookup' && t !== 'lookupmulti';
}

function isMultiChoiceField(field) {
  const t = typeOfField(field);
  return t === 'multichoice' || t === 'gridchoice' || field?.AllowMultipleValues === true;
}

/** Пользователь или группа: значение поля → массив {Id, Title, LoginName}. */
function peopleOfField(raw) {
  const asUser = (v) => {
    if (!v || typeof v !== 'object') return v ? { Id: null, Title: String(v), LoginName: '' } : null;
    const id = v.Id ?? v.ID ?? null;
    return { Id: id === null ? null : Number(id), Title: String(v.Title ?? v.Name ?? ''), LoginName: String(v.LoginName ?? v.Name ?? '') };
  };
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(asUser).filter(Boolean);
  if (Array.isArray(raw?.results)) return raw.results.map(asUser).filter(Boolean);
  return [asUser(raw)].filter(Boolean);
}

/**
 * Поле формы не заполнено? Обязательность берём ТОЛЬКО из Required в SharePoint.
 * Для rich-полей (Note/Text) теги не считаются содержимым.
 */
function isFormValueEmpty(field, value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return normalizeChoiceValues(value).length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  const t = typeOfField(field);
  const raw = (t === 'note' || t === 'text') ? String(value).replace(/<[^>]*>/g, ' ') : String(value);
  return raw.trim().length === 0;
}

export default function DobTaskEditView({ id, onOpenMenu, listGuid = DOB_LIST_GUID, onBackHash = '#dob_tasks' }) {
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Задача ещё «Не начата»: форму закрываем «шлюзом» — сначала «Взять в работу».
  // Иначе результат ушёл бы на сервер без исполнителя и смены статуса.
  const [taking, setTaking] = useState(false);
  const [takeError, setTakeError] = useState('');
  const [attachments, setAttachments] = useState([]);
  // Read-only просмотр связанной заявки (RelatedItems задачи/заявки).
  const [relatedOpen, setRelatedOpen] = useState(false);
  const ctSubmitRef = useRef(null); // submit формы задачи (кнопка в шапке страницы)
  const [ctValues, setCtValues] = useState({}); // значения формы задачи (CT) — для синхронизации вложений
  // «Пульт» формы задачи (CT): попросить её убрать картинку удалённого вложения
  // из своего rich-текста (значения живут внутри ContentTypeResultDialog).
  const ctValuesControlRef = useRef(null);
  const prevCtHtmlRef = useRef({});
  const prevChekHtmlRef = useRef(null);
  const pendingDeleteRef = useRef(new Set());
  const initialFormRef = useRef(null);
  const dirtySetRef = useRef(new Set());
  // Незаполненные обязательные поля после попытки сохранить: поле краснеет,
  // блок/секция акцентируются, а пользователю показывается snackbar.
  const [invalidFields, setInvalidFields] = useState(() => new Set());

  // helper: extract img srcs from html

  const { data: fields, isLoading: fieldsLoading, error: fieldsError } = useQuery({
    queryKey: ['dob-fields', listGuid],
    queryFn: () => getDobFields(listGuid),
    staleTime: 5 * 60 * 1000,
  });

  const { data: item, isLoading: itemLoading, error: itemError, isFetching, refetch } = useQuery({
    queryKey: ['dob-item', listGuid, id],
    queryFn: () => getDobItem(id, listGuid),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // Тип контента элемента → состав формы. Форма строится ТОЛЬКО по полям типа
  // контента (FieldLinks): в списке есть колонки, которых в типе нет, и раньше
  // они попадали в «Остальные поля» (AdditionalActions, AdditionalActionsRequired).
  const itemCtId = contentTypeIdOf(item?.ContentTypeId);
  // ⭐ Признак «задача ДОБ» по TaskBehaviour (IsDobTask = Да в записи по имени типа
  // контента): такие задачи ведёт наша форма — внутри неё показываем форму по
  // колонкам типа контента, а не форму заявки. Конфигурация кешируется react-query.
  const taskConfiguration = useTaskConfiguration({ enabled: !!item });

  const { data: ctFields } = useQuery({
    queryKey: ['dob-ct-fields', listGuid, itemCtId],
    queryFn: () => getDobContentTypeFields(itemCtId, listGuid),
    enabled: !!itemCtId,
    staleTime: 30 * 60 * 1000,
  });

  // Load attachments separately for display
  useEffect(() => {
    if (!id) return;
    getDobAttachments(id, listGuid).then(setAttachments).catch(()=> setAttachments([]));
    // also if item has AttachmentFiles results
    if (item?.AttachmentFiles?.results) setAttachments(item.AttachmentFiles.results);
  }, [id, item, listGuid]);

  // Init form from item + fields
  useEffect(() => {
    if (!item || !fields) return;
    const next = {};
    for (const f of fields) {
      const internal = f.InternalName;
      if (internal === 'Attachments') continue;
      // skip calculated/readOnly but keep for display? We'll keep editable only but store all
      const val = getODataValue(item, internal) ?? item[internal];
      // Normalize
      if (val !== undefined) next[internal] = val;
      else if (item[internal] !== undefined) next[internal] = item[internal];
    }
    // Ensure Title, ID etc
    if (item.ID !== undefined) next.ID = item.ID;
    if (item.Title !== undefined && next.Title === undefined) next.Title = item.Title;
    // ChekResult may be HTML — keep as is
    // For User fields, store Id: e.g., UserFailId
    setForm(next);
    initialFormRef.current = { ...next };
    dirtySetRef.current.clear();
    // сбрасываем prevChek для детекта удалений после загрузки
    // prevChekHtmlRef будет инициализирован в useEffect sync-delete
    prevChekHtmlRef.current = null;
  }, [item, fields]);

  const handleChange = useCallback((internal, value) => {
    dirtySetRef.current.add(internal);
    setInvalidFields(prev => {
      if (!prev.has(internal)) return prev;
      const next = new Set(prev);
      next.delete(internal);
      return next;
    });
    setForm(prev => ({ ...prev, [internal]: value }));
  }, []);

  /** Прокрутка к первому незаполненному полю (фокус — в его инпут). */
  const focusFirstInvalid = useCallback((internal) => {
    if (!internal || typeof document === 'undefined') return;
    const node = document.querySelector(`[data-dob-field="${internal}"]`);
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { node.scrollIntoView(); }
    }
    const input = typeof node.querySelector === 'function' ? node.querySelector('input, textarea, [tabindex]') : null;
    if (input && typeof input.focus === 'function') {
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    }
  }, []);

  /**
   * Rich-текст перед сохранением: каждая base64-картинка превращается в ВЛОЖЕНИЕ
   * элемента, а в тексте остаётся ССЫЛКА `/sites/…/Attachments/<id>/<file>`.
   * Служебные адреса (dev-прокси `/dob-api/…`, абсолютный origin) приводятся к
   * серверному пути — в SharePoint не остаётся ни base64, ни прокси-ссылок.
   */
  const materializeFormValues = useCallback(async (values) => {
    if (!id) return values;
    return materializeRichValues(values, {
      upload: (file) => uploadDobAttachment(id, file, listGuid),
      onUploaded: (saved, link) => {
        const fileName = saved?.FileName || String(link).split('/').pop();
        if (!fileName) return;
        setAttachments((prev) => (prev.some((a) => a.FileName === fileName)
          ? prev
          : [...prev, { FileName: fileName, ServerRelativeUrl: link }]));
      },
      onError: (e) => {
        notify(`Не удалось сохранить картинку вложением: ${String(e?.message || e).slice(0, 160)}`, { severity: 'warning' });
      },
    });
  }, [id, listGuid, notify]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setSaveError('');
    try {
      // Картинки rich-текста: base64 → вложение, в тексте — ссылка на него.
      const prepared = await materializeFormValues(form);
      if (prepared !== form) setForm(prepared);
      // Требование: в SharePoint уходит ССЫЛКА на вложение, а не base64. Если
      // что-то не загрузилось — не пишем вовсе (текст в редакторе сохраняется,
      // пользователь может повторить сохранение).
      const base64Left = fieldsWithBase64(prepared);
      if (base64Left.length > 0) {
        const msg = `Изображение не удалось сохранить вложением: ${base64Left.join(', ')}. Повторите сохранение или удалите изображение.`;
        setSaveError(msg);
        notify(msg, { severity: 'error' });
        return;
      }
      // Build payload — only editable fields, but include ChekResult always
      const payload = {};
      const editableSet = new Set((fields || []).filter(isEditableField).map(f=>f.InternalName));
      // Helper: для полей с кодированным именем (_x....) SharePoint REST требует OData_ префикс
      const toODataKey = (internal) => {
        if (!internal) return internal;
        // Поля с _x кодировкой или ведущим _ — в OData виде OData_<InternalName> (например _x0414 -> OData__x0414)
        if (internal.startsWith('_') || internal.includes('_x')) return `OData_${internal}`;
        return internal;
      };
      const isDirtySet = (k) => dirtySetRef.current.has(k);
      // Fallback для ChekResult — сравниваем с initial если dirtySet не сработал (например RichEditor onChange)
      const isDirty = (k, curVal) => {
        if (isDirtySet(k)) return true;
        // Для ChekResult дополнительно сравниваем с initial (на случай если dirtySet не отметился)
        if (k === chekInternal) {
          const initVal = (initialFormRef.current || {})[k] ?? '';
          return (curVal ?? '') !== (initVal ?? '');
        }
        return false;
      };
      // Always allow ChekResult even if metadata says readOnly? Ensure it saves. If ChekResult is note, it is editable.
      // Add all form keys that are in fields and editable, or ChekResult
      for (const [k, v] of Object.entries(prepared)) {
        if (k === 'ID' || k === 'Id') continue;
        if (k === 'ChekResult' || k === '_x041a__x043e__x043c__x043c__x04' || k === chekInternal) {
          if (!isDirty(k, v)) { console.log('[DobEdit][save] skip unchanged ChekResult'); continue; }
          const ck = toODataKey(k);
          payload[ck] = v ?? '';
          continue;
        }
        const odataK = toODataKey(k);
        if (editableSet.has(k)) {
          if (!isDirty(k, v)) {
            // console.log('[DobEdit][save] skip unchanged', k);
            continue;
          }
          const meta = (fields || []).find(f => f.InternalName === k);
          const t = (meta?.TypeAsString || '').toLowerCase();
          // MultiChoice SharePoint принимает строкой с разделителем «;#»
          if (t === 'multichoice' || t === 'gridchoice') {
            const list = normalizeChoiceValues(v);
            if (list.length === 0) continue;
            payload[odataK] = list.join(';#');
            continue;
          }
          // «Пользователь или группа» (в т.ч. многократный) — Id в <Field>Id;
          // для многократного — Collection(Edm.Int32).
          if (t === 'usermulti' || (Array.isArray(v) && v.length > 0 && v.every((u) => u && typeof u === 'object' && ('Id' in u || 'Title' in u)))) {
            const ids = (Array.isArray(v) ? v : [v])
              .map((u) => (u && typeof u === 'object' ? Number(u.Id ?? u.ID) : Number(u)))
              .filter((n) => Number.isFinite(n));
            if (ids.length === 0) {
              console.log('[DobEdit][save] skip UserMulti without Id', k);
              continue;
            }
            payload[toODataKey(`${k}Id`)] = { __metadata: { type: 'Collection(Edm.Int32)' }, results: ids };
            continue;
          }
          // User/Lookup — нужен Id суффикс, иначе 400 "value without type"
          if (t === 'user' || t === 'lookup' || t === 'lookupmulti' || meta?.LookupList) {
            const idKeyRaw = `${k}Id`;
            const odataIdKey = toODataKey(idKeyRaw);
            let val = v;
            if (val && typeof val === 'object') {
              if ('Id' in val) val = val.Id;
              else if ('ID' in val) val = val.ID;
              else if (val.Title) { console.log('[DobEdit][save] skip User/Lookup without Id', k, val); continue; }
            }
            // также пробуем взять Id из item
            if ((val === null || val === undefined || val === '') && item) {
              const alt = getODataValue(item, idKeyRaw) ?? item[idKeyRaw];
              if (alt !== undefined) val = alt;
            }
            if (val === null || val === undefined || val === '') {
              console.log('[DobEdit][save] skip empty User/Lookup', k);
              continue;
            }
            const num = Number(val);
            if (!isNaN(num)) payload[odataIdKey] = num;
            else console.log('[DobEdit][save] skip non-numeric User/Lookup', k, val);
            continue;
          }
          // Пропускаем сложные типы которые требуют __metadata
          if (['taxonomyfieldtype','taxonomyfieldtypemulti','user','usermulti','lookup','lookupmulti','multichoice','gridchoice','url','calculated','computed'].includes(t)) {
            // URL — объект {Url, Description}, шлём только Url если строка
            if (t === 'url' && v && typeof v === 'object' && v.Url) {
              payload[odataK] = v.Url;
              continue;
            }
            if (t === 'taxonomyfieldtype' || t === 'taxonomyfieldtypemulti') {
              console.log('[DobEdit][save] skip taxonomy', k);
              continue;
            }
          }
          let val = v;
          if (t === 'choice' || t === 'combobox' || t === 'outcomechoice') {
            const text = normalizeChoiceValue(v);
            if (text.trim() === '') continue;
            payload[odataK] = text;
            continue;
          }
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            // Если объект с Url — берём Url, иначе скипаем (иначе 400 без типа)
            if ('Url' in val) val = val.Url;
            else if ('Results' in val) val = val.Results;
            else { console.log('[DobEdit][save] skip object value', k, t, val); continue; }
          }
          if (val === undefined) continue;
          // DateTime — SharePoint ждёт ISO
          if (t === 'datetime' && val) {
            try {
              const d = new Date(val);
              if (!isNaN(d)) val = d.toISOString();
            } catch {}
          }
          payload[odataK] = val;
        }
      }
      // Remove system fields (оба варианта)
      delete payload.Attachments;
      delete payload['OData_Attachments'];
      delete payload.Author;
      delete payload['OData_Author'];
      delete payload.Editor;
      delete payload['OData_Editor'];
      console.log('[DobEdit][save] payload keys', Object.keys(payload), 'chekInternal', chekInternal, 'odataChek', toODataKey(chekInternal), 'payload', payload);
      // Ensure boolean/null handling
      try {
        await updateDobItem(id, payload, listGuid);
      } catch (e) {
        const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
        const lower = String(rawMsg).toLowerCase();
        if (lower.includes('без имени типа') || lower.includes('without type') || lower.includes('expected type') || lower.includes('primitivevalue') || lower.includes('startobject') || lower.includes('непредвиденный узел')) {
          console.warn('[DobEdit][save] fallback to minimal payload (ChekResult only) due to type error', rawMsg.slice(0,300));
          const chekKey = toODataKey(chekInternal);
          const minimal = { [chekKey]: payload[chekKey] ?? prepared[chekInternal] ?? '' };
          // Title тоже попробуем если есть
          if (payload.Title) minimal.Title = payload.Title;
          if (payload['OData_Title']) minimal['OData_Title'] = payload['OData_Title'];
          console.log('[DobEdit][save] minimal keys', Object.keys(minimal));
          await updateDobItem(id, minimal, listGuid);
          // успех — не кидаем дальше, обновляем baseline для ChekResult и чистим dirty
          if (initialFormRef.current) initialFormRef.current[chekInternal] = prepared[chekInternal];
          else initialFormRef.current = { [chekInternal]: prepared[chekInternal] };
          dirtySetRef.current.delete(chekInternal);
          notify(`Заявка ${id} сохранена (только ${chekKey})`, { severity: 'success' });
          qc.invalidateQueries({ queryKey: ['dob-items'] });
          qc.invalidateQueries({ queryKey: ['dob-item', listGuid, id] });
          getDobAttachments(id, listGuid).then(setAttachments).catch(()=>{});
          return;
        }
        throw e;
      }
      notify(`Заявка ${id} сохранена`, { severity: 'success' });
      // Обновляем baseline для dirty-check и чистим dirty
      initialFormRef.current = { ...prepared };
      dirtySetRef.current.clear();
      // Invalidate list and item
      qc.invalidateQueries({ queryKey: ['dob-items'] });
      qc.invalidateQueries({ queryKey: ['dob-item', listGuid, id] });
      // Refresh attachments
      getDobAttachments(id, listGuid).then(setAttachments).catch(()=>{});
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка сохранения';
      setSaveError(String(msg).slice(0, 800));
      notify(`Ошибка: ${String(msg).slice(0,200)}`, { severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [id, listGuid, form, fields, notify, qc, materializeFormValues]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const handleUploadImage = useCallback(async (file) => {
    if (!id) return null;
    setIsUploadingImage(true);
    console.log('[DobEdit][upload] start', file.name, file.size, file.type);
    try {
      const res = await uploadDobAttachment(id, file, listGuid);
      console.log('[DobEdit][upload] res', res);
      // Refresh attachments
      getDobAttachments(id, listGuid).then(a=> { console.log('[DobEdit][upload] attachments after', a); setAttachments(a); }).catch(()=>{});
      notify(`Изображение ${file.name} загружено`, { severity: 'success' });
      // Для сохранения в SharePoint нужен ServerRelativeUrl без /dob-api (иначе на проде 404). На проде это https://portal.lenta.com/sites/..., в dev — /sites/...
      const serverRelative = res?.ServerRelativeUrl || res?.ServerRelativePath?.DecodedUrl || null;
      const finalUrlForSave = serverRelative || res?.url || res?.src || null;
      // Проверочная загрузка картинки — РАБОЧИМ адресом (REST `…/$value`): прямой
      // путь на файл прокси отдаёт как JSON, и картинка «не загружается».
      const finalUrlForTest = serverRelative ? attachmentDisplayUrl(serverRelative) : (res?.url || res?.src || null);
      console.log('[DobEdit][upload] finalUrlForSave', finalUrlForSave, 'finalUrlForTest', finalUrlForTest);
      // Test image load — используем dev-прокси URL если есть
      if (finalUrlForTest) {
        const testImg = new Image();
        testImg.onload = () => console.log('[DobEdit][upload] test load OK', finalUrlForTest);
        testImg.onerror = (e) => console.error('[DobEdit][upload] test load FAIL', finalUrlForTest, e);
        testImg.src = finalUrlForTest;
      }
      return finalUrlForSave;
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка загрузки';
      notify(`Загрузка не удалась: ${String(msg).slice(0,200)}`, { severity: 'error' });
      throw e;
    } finally {
      setIsUploadingImage(false);
    }
  }, [id, listGuid, notify]);


  const isDefaultList = listGuid === DOB_LIST_GUID;
  const handleBack = useCallback(() => {
    window.location.hash = onBackHash || '#dob_tasks';
  }, [onBackHash]);

  // Статус задачи и choices поля Status — чтобы подобрать статус «в работе»
  // именно из вокабуляра этого списка (у списков он разный).
  const taskStatus = String(item?.Status ?? '').trim();
  const statusChoices = useMemo(() => {
    const f = (fields || []).find((x) => String(x?.InternalName || '').toLowerCase() === 'status');
    const raw = f?.Choices;
    if (Array.isArray(raw)) return raw.map(String);
    if (Array.isArray(raw?.results)) return raw.results.map(String);
    return [];
  }, [fields]);
  const taskCompleted = isCompletedStatus(taskStatus, item?.PercentComplete);
  const taskInProgress = isInProgressStatus(taskStatus);
  // Требовать взятие, только когда статус ЯВНО «не начата»: у заявок без поля
  // Status форма остаётся доступной, как раньше.
  const needsTake = !!item && isNotStartedStatus(taskStatus) && !taskCompleted && !taskInProgress;

  const handleTakeInWork = useCallback(async () => {
    if (!id) return;
    setTaking(true);
    setTakeError('');
    try {
      const res = await takeDobTaskInWork(id, listGuid, { choices: statusChoices });
      if (res.ok) {
        notify(`Задача #${id} взята в работу`, { severity: 'success' });
        try { qc.invalidateQueries(); } catch (_e) { void _e; }
        await refetch();
      } else if (res.reason === 'completed') {
        setTakeError(`Задача #${id} уже завершена — взять её в работу нельзя.`);
        await refetch().catch(() => {});
      } else if (res.reason === 'already-taken') {
        // уже «в работе» — открываем форму (взятие просто не потребовалось)
        await refetch();
      } else {
        setTakeError(`Не удалось взять задачу #${id} в работу: ${res.message || 'ошибка'}`);
      }
    } catch (e) {
      setTakeError(`Не удалось взять задачу #${id} в работу: ${e?.message || 'ошибка'}`);
    } finally {
      setTaking(false);
    }
  }, [id, listGuid, statusChoices, notify, qc, refetch]);

  // ⭐ Задача типа «Результат проверки ООБ» живёт в основном списке, но ведёт себя
  // как задачи сайта ДОБ: закрывается ТОЛЬКО через форму по колонкам типа контента
  // (кнопки DobSearchResult + rich-текст/автокомплиты/число/«Пользователь или группа»).
  // Собираем MERGE вручную: результат + значения полей + Status/PercentComplete.
  const handleCheckResultSubmit = useCallback(async ({ result, values, resultField }) => {
    // Шлюз: задача не взята в работу — форма закрыта, но сохранение могло
    // прийти с клавиатуры/из кнопки шапки. Не пишем результат мимо взятия.
    if (needsTake) {
      setTakeError('Сначала возьмите задачу в работу.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // Картинки rich-текста (DescriptionCheckResult и т.п.): base64 → вложения,
      // в тексте — ссылки на `/Attachments/<id>/<file>`.
      const preparedValues = await materializeFormValues(values);
      const base64Left = fieldsWithBase64(preparedValues);
      if (base64Left.length > 0) {
        const msg = `Изображение не удалось сохранить вложением: ${base64Left.join(', ')}. Повторите сохранение или удалите изображение.`;
        setSaveError(msg);
        notify(msg, { severity: 'error' });
        return;
      }
      const body = { Status: 'Завершена', PercentComplete: 1 };
      const field = resultField || 'DobSearchResult';
      if (result) body[field] = result;
      for (const [name, value] of Object.entries(preparedValues || {})) {
        if (value === undefined || value === null) continue;
        // «Пользователь или группа» → <Field>Id (число или Collection(Edm.Int32))
        if (typeof value === 'object' && Array.isArray(value.__userIds)) {
          const ids = value.__userIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
          if (ids.length === 0) continue;
          body[`${name}Id`] = (value.__userMulti === true || ids.length > 1)
            ? { __metadata: { type: 'Collection(Edm.Int32)' }, results: ids }
            : ids[0];
          continue;
        }
        body[name] = value;
      }
      await updateDobItem(id, body, listGuid);
      notify(`Задача #${id} завершена: ${result || 'результат сохранён'}`, { severity: 'success' });
      try { qc.invalidateQueries(); } catch (_e) { void _e; }
      handleBack();
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || String(e);
      setSaveError(String(msg).slice(0, 600));
    } finally {
      setSaving(false);
    }
  }, [id, listGuid, notify, qc, handleBack, materializeFormValues, needsTake]);

  const handleCtValidationError = useCallback((problems) => {
    notify(`Заполните обязательные поля: ${(problems || []).join('; ')}`, { severity: 'warning' });
  }, [notify]);

  const loading = fieldsLoading || itemLoading;

  // Заголовок в шапке (номер + название задачи) и описание в теле — сразу под
  // шапкой, ДО полей: сначала контекст задачи, потом форма.
  const taskTitle = String(item?.Title ?? '').trim();
  const rawBody = item?.Body || item?.Description || item?.TaskDescription || '';
  const taskBody = taskDescriptionText(rawBody);
  const heading = taskTitle ? `Задача #${id} · ${taskTitle}` : `Задача #${id}`;

  const taskHead = (item && taskBody) ? (
    <Box sx={FORM_TASK_HEAD_SX} data-testid="dob-task-head">
      <Typography variant="caption" sx={{ fontWeight: 800, color: '#171c8f', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Описание задачи
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {taskBody}
      </Typography>
    </Box>
  ) : null;

  // «Шлюз»: задача ещё не взята в работу — данных вносить нельзя, пока не взяли.
  // Прямая ссылка (#dob_tasks/<id>?list=<GUID>) открывает форму в обход списка,
  // где кнопка «Взять в работу» обязательна.
  const takeGate = (
    <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', placeItems: 'center', minHeight: 220 }} data-testid="dob-take-gate">
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
          borderRadius: 2,
          border: '1px solid rgba(255,193,7,0.35)',
          bgcolor: 'rgba(255,193,7,0.08)',
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5 }}>
          Задача #{id} ещё не взята в работу
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Сначала возьмите задачу в работу — только потом можно вносить результат и сохранять форму.
          Иначе данные сохранятся без исполнителя и без смены статуса задачи.
        </Typography>
        <Button
          variant="contained"
          size="large"
          disabled={taking}
          onClick={handleTakeInWork}
          startIcon={taking ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
          sx={{
            borderRadius: '12px',
            fontWeight: 800,
            textTransform: 'none',
            height: 48,
            px: 3,
            backgroundImage: 'linear-gradient(180deg,#7B84FF 0%,#5A67D8 100%)',
            color: '#fff',
            '&:hover': { backgroundImage: 'linear-gradient(180deg,#8D95FF 0%,#6B7CFF 100%)' },
            '&.Mui-disabled': { backgroundImage: 'linear-gradient(180deg,#9BA3FF 0%,#7B84FF 100%)', color: '#fff', opacity: 1 },
          }}
        >
          {taking ? 'Берём в работу…' : 'Взять в работу'}
        </Button>
        {takeError && (
          <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }} onClose={() => setTakeError('')}>
            {takeError}
          </Alert>
        )}
      </Paper>
    </Box>
  );

  // Результирующий выбор для этого списка: в FieldLinks типа контента колонки
  // результата может не быть (она заведена на уровне списка) — тогда берём её из
  // метаданных списка, иначе форма остаётся без кнопок результата.
  const listResultField = useMemo(() => {
    const list = fields || [];
    const pick = list.find(f => String(f?.TypeAsString || '').toLowerCase() === 'outcomechoice' && !f.Hidden)
      || list.find(f => /searchresult|resultsearch|^result/i.test(String(f?.InternalName || '')) && !f.Hidden);
    if (!pick) return null;
    const rawChoices = Array.isArray(pick.Choices) ? pick.Choices : (pick.Choices?.results || []);
    const choices = (rawChoices || []).map(v => String(v && typeof v === 'object' ? (v.Value ?? '') : v)).filter(Boolean);
    if (choices.length === 0) return null;
    return {
      internalName: pick.InternalName,
      title: pick.Title && pick.Title !== pick.InternalName
        ? String(pick.Title)
        : (FIELD_LABEL_OVERRIDES[pick.InternalName] || String(pick.InternalName)),
      choices,
      required: pick.Required === true,
      allowFillIn: pick.FillInChoice === true,
    };
  }, [fields]);

  // Связанная заявка: RelatedItems элемента (или lookup на список заявок ДОБ).
  const relatedRef = useMemo(() => resolveRelatedRef(item, fields), [item, fields]);

  const editableFields = useMemo(() => {
    if (!fields) return [];
    // Состав — по типу контента: если FieldLinks получены, показываем только их
    // поля (нет типа — работаем как раньше, по колонкам списка).
    const ctNames = Array.isArray(ctFields) && ctFields.length > 0
      ? new Set(ctFields.map(f => String(f?.InternalName || '').toLowerCase()).filter(Boolean))
      : null;
    return fields.filter(f => {
      if (['ID','Attachments','ContentType','ContentTypeId'].includes(f.InternalName)) return false;
      if (isHiddenFormField(f.InternalName)) return false;
      // Show all except hidden system, but mark readOnly
      if (f.Hidden) return false;
      if (ctNames && !ctNames.has(String(f.InternalName || '').toLowerCase())) return false;
      return true;
    });
  }, [fields, ctFields]);

  const chekField = useMemo(() => {
    if (!fields) return null;
    // ChekResult is the dedicated result editor. Do not accidentally select another
    // field whose title merely contains the word "результат".
    const exactInternal = fields.find(x => x.InternalName === 'ChekResult');
    if (exactInternal) return exactInternal;
    const exactTitle = fields.find(x => {
      const title = String(x.Title || '').trim().toLowerCase();
      return title === 'результат проверки' || /^результат проверки\s*\(.*\)$/.test(title);
    });
    return exactTitle || { InternalName: 'ChekResult', Title: 'Результат проверки (ChekResult)', TypeAsString: 'Note', Required: false };
  }, [fields]);

  const chekInternal = chekField?.InternalName || 'ChekResult';
  const chekValue = toDisplayImages(toEditorHtml(form[chekInternal] ?? getODataValue(item, chekInternal) ?? ''));
  // Акцент блоков: «Результат проверки» (rich) и «Остальные поля» — по тому, ГДЕ
  // остались незаполненные обязательные поля.
  const richInvalid = invalidFields.has(chekInternal);
  const fieldsInvalid = Array.from(invalidFields).some((n) => n !== chekInternal);

  /**
   * Сохранение с валидацией обязательных полей (Required в SharePoint): до запроса
   * подсвечиваем незаполненные поля/блоки, показываем snackbar и прокручиваем к
   * первому пропуску — иначе сервер отвечает 400 и непонятно, что заполнять.
   */
  const validateAndSave = useCallback(() => {
    // Шлюз: пока задача не взята в работу, сохранять нельзя (см. takeGate).
    if (needsTake) {
      setTakeError('Сначала возьмите задачу в работу.');
      return;
    }
    const missing = [];
    for (const f of editableFields) {
      if (f.Required !== true || !isEditableField(f)) continue;
      const internal = f.InternalName;
      if (internal === chekInternal) continue;
      if (isFormValueEmpty(f, form[internal] ?? getODataValue(item, internal))) missing.push(f);
    }
    if (chekField?.Required === true && isFormValueEmpty(chekField, form[chekInternal] ?? getODataValue(item, chekInternal))) {
      missing.unshift(chekField);
    }
    if (missing.length > 0) {
      setInvalidFields(new Set(missing.map((f) => f.InternalName)));
      const names = missing.map((f) => String(f.Title || f.InternalName));
      notify(`Заполните обязательные поля: ${names.join(', ')}`, { severity: 'warning' });
      focusFirstInvalid(missing[0].InternalName);
      return;
    }
    setInvalidFields((prev) => (prev.size > 0 ? new Set() : prev));
    handleSave();
  }, [editableFields, chekField, chekInternal, form, item, notify, focusFirstInvalid, handleSave, needsTake]);

  useEffect(() => {
    if (!fields || !item) return;
    const richCandidates = fields
      .filter(f => ['note', 'text'].includes(String(f.TypeAsString || '').toLowerCase()))
      .map(f => ({ internal: f.InternalName, title: f.Title, valueLength: toEditorHtml(form[f.InternalName] ?? getODataValue(item, f.InternalName) ?? '').length }));
    console.info('[DobEdit][field-mapping]', { chekInternal, chekTitle: chekField?.Title, chekValueLength: chekValue.length, richCandidates });
  }, [fields, item, form, chekField, chekInternal, chekValue]);

  const handleDeleteAttachment = useCallback(async (fileName) => {
    if (!id || !fileName) return;
    if (pendingDeleteRef.current.has(fileName)) {
      console.log('[DobEdit][delete] skip pending', fileName);
      return;
    }
    pendingDeleteRef.current.add(fileName);
    console.log('[DobEdit][delete] fileName', fileName);
    try {
      await deleteDobAttachment(id, fileName, listGuid);
      notify(`Вложение ${fileName} удалено`, { severity: 'success' });
      // Remove from attachments state
      setAttachments(prev => prev.filter(a => a.FileName !== fileName && a.ServerRelativeUrl !== fileName));
      // Каскад: картинка удалённого вложения уходит из ВСЕХ rich-полей формы
      // (не только из основного) и из rich-текста формы задачи (CT).
      setForm((prev) => stripAttachmentFromValues(prev, fileName) || prev);
      ctValuesControlRef.current?.removeImagesByFileName?.(fileName);
      console.log('[DobEdit][delete] cleaned html for', fileName);
      // Refresh from server
      getDobAttachments(id, listGuid).then(setAttachments).catch(()=>{});
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка удаления';
      notify(`Не удалось удалить: ${String(msg).slice(0,200)}`, { severity: 'error' });
    } finally {
      pendingDeleteRef.current.delete(fileName);
    }
  }, [id, listGuid, notify]);

  // Синхрон: если картинка удалена из ChekResult (в редакторе) — удалить вложение
  // Удаляем вложения для картинок, которые убрали из rich-текста (обе ветки формы).
  // Блок вложений показывается ВНУТРИ CKEditor — и в форме заявки, и в форме
  // задачи типа контента: картинки из rich-текста лежат вложениями.
  const attachmentsBlock = renderAttachments({
    attachments,
    onDelete: handleDeleteAttachment,
    inside: true,
    emptyHint: true,
  });

  const deleteAttachmentForSrc = useCallback((src) => {
    // base64/blob — ещё не вложение (загружается при сохранении): удалять нечего.
    if (!src || typeof src !== 'string' || src.startsWith('data:') || src.startsWith('blob:')) return;
    const fileName = fileNameFromSrc(src);
    if (!fileName) return;
    const exists = attachments.some(a => a.FileName === fileName || a.ServerRelativeUrl?.endsWith('/' + fileName));
    if (!exists) return;
    if (pendingDeleteRef.current.has(fileName)) return;
    console.log('[DobEdit][sync-delete] auto-delete attachment for removed image', fileName, String(src).slice(0, 80));
    handleDeleteAttachment(fileName);
  }, [attachments, handleDeleteAttachment]);
  useEffect(() => {
    const curHtml = form[chekInternal];
    if (curHtml === undefined) return;
    // Инициализация
    if (prevChekHtmlRef.current === null) {
      prevChekHtmlRef.current = curHtml || '';
      return;
    }
    const prevHtml = prevChekHtmlRef.current;
    if (prevHtml === curHtml) return;
    // Удалённые картинки (были в тексте — теперь нет). Сравниваем в «серверном»
    // виде: в сохранённом значении путь «/sites/…», а редактор отдаёт рабочий адрес
    // («/dob-api/sites/…» в dev или абсолютный origin) — без нормализации та же
    // картинка считалась бы удалённой и вложение бы стёрлось.
    const removed = removedImgSrcs(toStorageImages(prevHtml), toStorageImages(curHtml));
    if (removed.length === 0) {
      prevChekHtmlRef.current = curHtml;
      return;
    }
    console.log('[DobEdit][sync-delete] removed srcs', removed);
    removed.forEach(deleteAttachmentForSrc);
    prevChekHtmlRef.current = curHtml;
  }, [form[chekInternal], attachments, deleteAttachmentForSrc, handleDeleteAttachment, chekInternal]);

  // Та же логика для rich-текста ФОРМЫ ЗАДАЧИ (CT): значения формы нам отдаёт
  // ContentTypeResultDialog через onValuesChange. Картинок может быть несколько —
  // все они уже загружены вложениями, лишние вложения удаляем.
  // Значения формы задачи (CT) «наружу». Сравниваем с предыдущими: одинаковые
  // значения не должны вызывать ререндер (иначе возможен цикл «форма сообщила →
  // страница перерисовалась → форма сообщила снова»).
  const handleCtValuesChange = useCallback((next) => {
    setCtValues((prev) => (sameFormValues(prev, next) ? prev : next));
  }, []);
  useEffect(() => {
    // Сравниваем в «серверном» виде: значения могли прийти и как «/sites/…»
    // (сохранённое), и как рабочий адрес редактора («/dob-api/…» / origin).
    const norm = (dict) => Object.fromEntries(
      Object.entries(dict || {}).map(([k, v]) => [k, toStorageImages(String(v ?? ''))]),
    );
    const prev = prevCtHtmlRef.current || {};
    const removedSrcs = removedImgSrcsByValues(norm(prev), norm(ctValues));
    const snapshot = {};
    for (const [key, html] of Object.entries(ctValues || {})) snapshot[key] = String(html ?? '');
    prevCtHtmlRef.current = snapshot;
    removedSrcs.forEach(deleteAttachmentForSrc);
  }, [ctValues, deleteAttachmentForSrc]);


  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: 400, gap: 1 }}>
        <CircularProgress />
        <Typography color="text.secondary">Загрузка заявки {id}…</Typography>
      </Box>
    );
  }

  // ⭐ Задача ДОБ (тип контента «Результат проверки ООБ» или запись TaskBehaviour с
  // IsDobTask = Да) ведётся нашей формой: вместо полей заявки показываем форму
  // закрытия по колонкам типа контента. Задача не закрывается мимо диалога.
  const checkCtId = itemCtId;
  // Без useMemo: вычисление ниже ранних return'ов (loading/ошибка) — хук здесь
  // нарушал бы порядок хуков. Проверка дешёвая: имя CT → запись TaskBehaviour.
  const dobAwareItem = markDobTask(item, taskConfiguration.data);
  if (item && isDialogRequired(null, checkCtId, taskContentTypeName(item), dobAwareItem)) {
    return (
      <Box data-dob-edit-page="true" sx={FORM_PAGE_SX}>
        <AppBar position="sticky" elevation={0} sx={FORM_APPBAR_SX}>
          <Toolbar variant="dense" sx={{ minHeight: 48, px: { xs: .5, sm: 1 }, gap: .5 }}>
            <IconButton onClick={onOpenMenu} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label="Открыть меню"><MenuIcon /></IconButton>
            <IconButton onClick={handleBack} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label="К задачам"><ArrowBackIcon fontSize="small" /></IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {heading}
            </Typography>
            {isFetching && <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>обновление…</Typography>}
            <Button size="small" variant="outlined" onClick={() => refetch()} disabled={isFetching} startIcon={<RefreshIcon />} sx={FORM_SECONDARY_BUTTON_SX}>Обновить</Button>
            <Button
              size="small"
              variant="contained"
              disabled={saving || itemLoading || needsTake}
              onClick={() => ctSubmitRef.current?.()}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              sx={FORM_PRIMARY_BUTTON_SX}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </Toolbar>
        </AppBar>
        {saveError && <Alert severity="error" onClose={() => setSaveError('')}>{saveError}</Alert>}
        {taskHead}
        {isUploadingImage && <LinearProgress />}
        {needsTake ? takeGate : (
        <ContentTypeResultDialog
          inline
          task={item}
          listGuid={listGuid}
          resultField={listResultField}
          onUploadImage={handleUploadImage}
          onDeleteImage={deleteAttachmentForSrc}
          isUploading={isUploadingImage}
          onValuesChange={handleCtValuesChange}
          richFooter={attachmentsBlock}
          valuesControlRef={ctValuesControlRef}
          onValidationError={handleCtValidationError}
          contentTypeId={checkCtId}
          contentTypeName={taskContentTypeName(item) || "Результат проверки ООБ"}
          submitLabel="Сохранить"
          cancelLabel="Отмена"
          submitting={saving}
          submitRef={ctSubmitRef}
          onSubmit={handleCheckResultSubmit}
          onClose={handleBack}
        />
        )}
      </Box>
    );
  }

  if (itemError) {
    const msg = itemError?.response?.data?.error?.message?.value || itemError?.message || String(itemError);
    return (
      <Box sx={{ p: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>{isDefaultList ? 'К списку' : 'К задачам'}</Button>
        <Alert severity="error">Не удалось загрузить заявку {id}: {String(msg).slice(0, 800)}</Alert>
        <Button startIcon={<RefreshIcon />} onClick={()=> refetch()} sx={{ mt: 1 }}>Повторить</Button>
      </Box>
    );
  }

  return (
    <Box data-dob-edit-page="true" sx={FORM_PAGE_SX}>
      <AppBar position="sticky" elevation={0} sx={FORM_APPBAR_SX}>
        <Toolbar variant="dense" sx={{ minHeight: 48, px: { xs: .5, sm: 1 }, gap: .5 }}>
          <IconButton onClick={onOpenMenu} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label="Открыть меню"><MenuIcon /></IconButton>
          <IconButton onClick={handleBack} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label={isDefaultList ? 'К списку' : 'К задачам'}><ArrowBackIcon fontSize="small" /></IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {taskTitle ? `${isDefaultList ? 'Заявка ДОБ' : 'Задача'} #${id} · ${taskTitle}` : `${isDefaultList ? 'Заявка ДОБ' : 'Задача'} #${id}`}
          </Typography>
          {isFetching && <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>обновление…</Typography>}
          <Tooltip title={relatedRef ? 'Показать данные связанной заявки (только чтение)' : 'У этой записи нет связанной заявки (RelatedItems пустое)'}>
            <span>
              <Button
                size="small"
                variant="contained"
                disabled={!relatedRef}
                onClick={() => setRelatedOpen(true)}
                startIcon={<VisibilityIcon />}
                sx={{
                  borderRadius: .5,
                  fontWeight: 800,
                  color: '#fff',
                  backgroundImage: 'linear-gradient(180deg,#ffb300 0%,#ef6c00 100%)',
                  boxShadow: '0 2px 8px rgba(239,108,0,.35)',
                  '&:hover': { backgroundImage: 'linear-gradient(180deg,#ffc233 0%,#f57c00 100%)' },
                  '&.Mui-disabled': { backgroundImage: 'none', color: 'rgba(0,0,0,.26)' },
                }}
              >
                {/* на телефонах — только иконка (в шапке уже 3 кнопки) */}
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Просмотреть связанную заявку</Box>
              </Button>
            </span>
          </Tooltip>
          <Button size="small" variant="outlined" onClick={()=> refetch()} disabled={isFetching} startIcon={<RefreshIcon />} sx={FORM_SECONDARY_BUTTON_SX}>Обновить</Button>
          <Button size="small" variant="contained" onClick={validateAndSave} disabled={saving || needsTake} startIcon={saving ? <CircularProgress size={16} color="inherit"/> : <SaveIcon />} sx={FORM_PRIMARY_BUTTON_SX}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Toolbar>
      </AppBar>

      {saveError && <Alert severity="error" onClose={()=> setSaveError('')}>{saveError}</Alert>}
      {fieldsError && <Alert severity="warning">Не удалось загрузить метаданные полей: {String(fieldsError?.message || fieldsError).slice(0,400)}</Alert>}

      {taskHead}
      {needsTake ? takeGate : (
      <>
      <Box
        className="dob-rich-section"
        data-dob-invalid={richInvalid ? 'true' : undefined}
        sx={{
          ...FORM_SECTION_SX,
          ...(richInvalid ? FORM_INVALID_SECTION_SX : null),
          position: 'relative',
          zIndex: 1,
          flex: '0 0 auto',
        }}
      >
        <Box sx={FORM_SECTION_HEAD_SX}>
          <Box sx={{ ...FORM_SECTION_BAR_SX, ...(richInvalid ? { bgcolor: '#d32f2f' } : null) }} />
          <Typography variant="subtitle1" sx={{ ...FORM_SECTION_TITLE_SX, ...(richInvalid ? { color: '#c62828' } : null) }}>
            Результат проверки{chekField?.Required === true ? ' *' : ''}
          </Typography>
        </Box>
        {isUploadingImage && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
        <RichEditor
          value={chekValue || ''}
          onChange={(html)=> handleChange(chekInternal, html)}
          onUploadImage={handleUploadImage}
          onDeleteImage={deleteAttachmentForSrc}
          isUploading={isUploadingImage}
          invalid={richInvalid}
          footer={attachmentsBlock}
        />
      </Box>

      <Box
        className="dob-fields-section"
        data-dob-invalid={fieldsInvalid ? 'true' : undefined}
        sx={{
          width: '100%',
          minWidth: 0,
          position: 'relative',
          zIndex: 2,
          flex: '0 0 auto',
          ...(fieldsInvalid ? { ...FORM_INVALID_SECTION_SX, p: { xs: 1, md: 1.25 } } : null),
        }}
      >
        <Box sx={FORM_SECTION_HEAD_SX}>
          <Box sx={{ ...FORM_SECTION_BAR_SX, ...(fieldsInvalid ? { bgcolor: '#d32f2f' } : null) }} />
          <Typography variant="subtitle1" sx={{ ...FORM_SECTION_TITLE_SX, ...(fieldsInvalid ? { color: '#c62828' } : null) }}>Остальные поля</Typography>
        </Box>
        <Box sx={FORM_FIELD_GRID_SX}>
          {editableFields.filter(f => f.InternalName !== chekInternal && !/^(?:modified|откорректировано|изменено)$/i.test(String(f.InternalName || f.Title || '').trim()) && !/откорректировано|изменено/i.test(String(f.Title || ''))).map(f => {
            const internal = f.InternalName;
            const title = f.Title || internal;
            const t = (f.TypeAsString || '').toLowerCase();
            const editable = isEditableField(f);
            const value = form[internal] ?? getODataValue(item, internal) ?? '';
            const isCalculated = t === 'calculated' || t === 'computed';
            const isInvalid = invalidFields.has(internal);

            if (internal === 'Author' || internal === 'Editor') {
              const disp = item?.[internal]?.Title || value || '';
              return (
                <TextField key={internal} data-dob-field={internal} label={title} value={disp} InputProps={{ readOnly: true }} size="small" fullWidth />
              );
            }
            // Поля типа «Пользователь или группа»: автокомплит по УЧЁТНОЙ ЗАПИСИ,
            // у человека рядом с именем — ДОЛЖНОСТЬ и ДЕПАРТАМЕНТ, чтобы не
            // ошибиться с выбором. Многократный выбор — если колонка это разрешает.
            if (USER_TYPES.has(t)) {
              const multiple = t === 'usermulti' || f.AllowMultipleValues === true;
              return (
                <Box key={internal} data-dob-field={internal} sx={FORM_FIELD_WIDE_SX}>
                  <PersonFieldAutocomplete
                    label={title}
                    required={f.Required === true}
                    error={isInvalid}
                    helperText={isInvalid ? 'Обязательное поле' : undefined}
                    multiple={multiple}
                    disabled={!editable}
                    value={peopleOfField(value)}
                    onChange={next => handleChange(internal, multiple ? (next || []) : (next || null))}
                  />
                </Box>
              );
            }
            // Любое поле выбора — настоящий select (одиночный или многократный).
            if (isChoiceField(f)) {
              const vals = choicesOfField(f);
              const multiple = isMultiChoiceField(f);
              // Значения выбора: SharePoint отдаёт коллекции объектами/строками «a;#b» —
              // нормализуем, иначе в поле показывается «[object Object]».
              const selected = multiple ? normalizeChoiceValues(value) : normalizeChoiceValue(value);
              return (
                <TextField
                  key={internal}
                  data-dob-field={internal}
                  error={isInvalid}
                  helperText={isInvalid ? 'Обязательное поле' : undefined}
                  select
                  label={`${title}${f.Required ? ' *' : ''}`}
                  value={selected}
                  onChange={e => handleChange(internal, multiple ? e.target.value : e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!editable}
                  SelectProps={multiple
                    ? { multiple: true, renderValue: (sel) => (Array.isArray(sel) ? sel : []).join(', ') }
                    : undefined}
                >
                  {!multiple && <MenuItem value=""><em>— не выбрано —</em></MenuItem>}
                  {vals.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </TextField>
              );
            }
            if (t === 'boolean') {
              const boolVal = value === true || value === 1 || value === '1' || String(value).toLowerCase()==='true';
              return (
                <FormControlLabel
                  key={internal}
                  data-dob-field={internal}
                  control={<Checkbox checked={!!boolVal} onChange={e=> handleChange(internal, e.target.checked)} disabled={!editable} />}
                  label={`${title}${f.Required ? ' *' : ''}`}
                  sx={{ alignItems: 'center' }}
                />
              );
            }
            if (t === 'datetime') {
              let dispVal = '';
              if (value) {
                try {
                  let d;
                  if (typeof value === 'string' && value.startsWith('/Date(')) {
                    const ms = parseInt(value.replace(/[^0-9]/g,''),10);
                    d = new Date(ms);
                  } else d = new Date(value);
                  if (!isNaN(d)) dispVal = d.toISOString().slice(0,10);
                  else dispVal = String(value).slice(0,10);
                } catch { dispVal = String(value).slice(0,10); }
              }
              return (
                <TextField
                  key={internal}
                  data-dob-field={internal}
                  error={isInvalid}
                  helperText={isInvalid ? 'Обязательное поле' : undefined}
                  label={`${title}${f.Required ? ' *' : ''}`}
                  type="date"
                  value={dispVal}
                  onChange={e=> {
                    const v = e.target.value;
                    if (!v) handleChange(internal, null);
                    else handleChange(internal, new Date(v).toISOString());
                  }}
                  size="small"
                  fullWidth
                  disabled={!editable}
                  InputLabelProps={{ shrink: true }}
                />
              );
            }
            if (t === 'number' || t === 'currency' || t === 'integer') {
              return (
                <TextField
                  key={internal}
                  data-dob-field={internal}
                  error={isInvalid}
                  helperText={isInvalid ? 'Обязательное поле' : undefined}
                  sx={FORM_NUMBER_FIELD_SX}
                  label={`${title}${f.Required ? ' *' : ''}`}
                  value={value ?? ''}
                  onChange={e=> handleChange(internal, e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!editable}
                  type="number"
                />
              );
            }
            if ((t === 'note' || t === 'text') && looksLikeHtml(value)) {
              const htmlValue = normalizeHtmlValue(value);
              return (
                <Box key={internal} data-dob-field={internal} sx={{ gridColumn: { md: '1 / -1' }, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ display: 'block', mb: .5, color: isInvalid ? '#c62828' : 'text.secondary', fontWeight: isInvalid ? 700 : 400 }}>{title}{f.Required ? ' *' : ''}</Typography>
                  <RichEditor
                    value={htmlValue}
                    readOnly={!editable}
                    invalid={isInvalid}
                    onChange={html => handleChange(internal, html)}
                    onUploadImage={handleUploadImage}
                    onDeleteImage={deleteAttachmentForSrc}
                    isUploading={isUploadingImage}
                  />
                </Box>
              );
            }
            if (t === 'note') {
              return (
                <TextField
                  key={internal}
                  data-dob-field={internal}
                  error={isInvalid}
                  helperText={isInvalid ? 'Обязательное поле' : undefined}
                  label={`${title}${f.Required ? ' *' : ''}`}
                  value={value || ''}
                  onChange={e=> handleChange(internal, e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={6}
                  disabled={!editable}
                />
              );
            }
            if (t === 'url') {
              return (
                <TextField
                  key={internal}
                  data-dob-field={internal}
                  error={isInvalid}
                  helperText={isInvalid ? 'Обязательное поле' : undefined}
                  label={`${title}${f.Required ? ' *' : ''}`}
                  value={typeof value === 'object' ? value?.Url || '' : value || ''}
                  onChange={e=> handleChange(internal, e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!editable}
                />
              );
            }
            // Text default
            return (
              <TextField
                key={internal}
                data-dob-field={internal}
                error={isInvalid}
                helperText={isInvalid ? 'Обязательное поле' : undefined}
                label={`${title}${f.Required ? ' *' : ''}`}
                value={value || ''}
                onChange={e=> handleChange(internal, e.target.value)}
                size="small"
                fullWidth
                disabled={!editable || isCalculated}
              />
            );
          })}
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Серые — только чтение (Calculated/Computed/ReadOnly). Остальные уйдут PATCH MERGE по InternalName. `ChekResult` — rich-HTML с таблицами и {'<img>'} из вложений (`/AttachmentFiles/add`).
        </Typography>
      </Box>
      </>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pb: 2 }}>
        <Button onClick={handleBack} variant="outlined" sx={{ borderRadius: 2 }}>{isDefaultList ? 'К списку' : 'К задачам'}</Button>
        <Box sx={FORM_ACTIONS_SX}>
          <Button onClick={validateAndSave} variant="contained" disabled={saving || needsTake} startIcon={<SaveIcon />} sx={{ ...FORM_PRIMARY_BUTTON_SX, minWidth: 160 }}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Box>
      </Box>

      {/* Read-only просмотр связанной заявки: данные тянем из связанного элемента */}
      <RelatedItemDialog
        open={relatedOpen}
        onClose={() => setRelatedOpen(false)}
        relatedRef={relatedRef}
      />
    </Box>
  );
}

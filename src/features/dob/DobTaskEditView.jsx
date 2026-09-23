// src/features/dob/DobTaskEditView.jsx
// Full-screen edit form for single DOB item — with rich ChekResult editor
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Box, Button, Chip, CircularProgress, LinearProgress, Typography, Stack, Alert, Paper, TextField, MenuItem, Checkbox, FormControlLabel, Divider, IconButton, Tooltip, AppBar, Toolbar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDobFields, getDobItem, updateDobItem, uploadDobAttachment, getDobAttachments, deleteDobAttachment } from './api/dobApi';
import { useNotifications } from '../../NotificationsProvider';
import RichEditor from './components/RichEditor';


const HIDDEN_FORM_FIELDS = new Set([
  'ComplianceAssetId', 'LinkTitleNoMenu', 'LinkTitle', 'Modified', 'UserFail',
  '_UIVersionString', 'DocIcon', 'FolderChildCount', 'AppEditor', 'AppAuthor',
  'ItemChildCount', 'Edit',
  'x041d_x0435__x0434__x0435__x04', 'x0414_x0430__x0442__x0430__x001',
  'x041b_x043e__x0433__x0438__x040', 'x0417_x0430__x043f__x0438__x04',
  'x0443_x0432__x0435__x0434__x04',
]);
function isHiddenFormField(internal = '') {
  const name = String(internal);
  const normalized = name.replace(/^OData__?/, '').replace(/^_/, '');
  return HIDDEN_FORM_FIELDS.has(name) || HIDDEN_FORM_FIELDS.has(normalized) ||
    /^(?:x|_x)041d__x0435__x0434__x0435__x04|^(?:x|_x)0414__x0430__x0442__x0430__x001|^(?:x|_x)041b__x043e__x0433__x0438__x040|^(?:x|_x)0417__x0430__x043f__x0438__x04|^(?:x|_x)0443__x0432__x0435__x0434__x04/.test(normalized);
}

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

function getODataValue(row, internal) {
  if (!row || !internal) return undefined;
  if (row[internal] !== undefined) return row[internal];
  if (row['OData__' + internal] !== undefined) return row['OData__' + internal];
  if (row['OData_' + internal] !== undefined) return row['OData_' + internal];
  if (internal.startsWith('_') && row[internal.slice(1)] !== undefined) return row[internal.slice(1)];
  return undefined;
}

function looksLikeHtml(value) {
  return typeof value === 'string' && /(?:<\/?[a-z][^>]*>|&lt;\/?[a-z][^&]*&gt;)/i.test(value);
}
function normalizeHtmlValue(value) {
  if (typeof value !== 'string') return value || '';
  if (!value.includes('&lt;')) return value;
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent || value;
}

function toEditorHtml(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value.Html ?? value.Value ?? value.Description ?? '');
  return String(value);
}

export default function DobTaskEditView({ id, onOpenMenu }) {
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const prevChekHtmlRef = useRef(null);
  const pendingDeleteRef = useRef(new Set());
  const initialFormRef = useRef(null);
  const dirtySetRef = useRef(new Set());

  // helper: extract img srcs from html
  const extractImgSrcs = useCallback((html) => {
    if (!html || typeof html !== 'string') return [];
    const srcs = [];
    const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) srcs.push(m[1]);
    return srcs;
  }, []);

  const { data: fields, isLoading: fieldsLoading, error: fieldsError } = useQuery({
    queryKey: ['dob-fields'],
    queryFn: getDobFields,
    staleTime: 5 * 60 * 1000,
  });

  const { data: item, isLoading: itemLoading, error: itemError, isFetching, refetch } = useQuery({
    queryKey: ['dob-item', id],
    queryFn: () => getDobItem(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // Load attachments separately for display
  useEffect(() => {
    if (!id) return;
    getDobAttachments(id).then(setAttachments).catch(()=> setAttachments([]));
    // also if item has AttachmentFiles results
    if (item?.AttachmentFiles?.results) setAttachments(item.AttachmentFiles.results);
  }, [id, item]);

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
    setForm(prev => ({ ...prev, [internal]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setSaveError('');
    try {
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
      for (const [k, v] of Object.entries(form)) {
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
          if (['taxonomyfieldtype','taxonomyfieldtypemulti','user','lookup','lookupmulti','url','calculated','computed'].includes(t)) {
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
        await updateDobItem(id, payload);
      } catch (e) {
        const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
        const lower = String(rawMsg).toLowerCase();
        if (lower.includes('без имени типа') || lower.includes('without type') || lower.includes('expected type') || lower.includes('primitivevalue') || lower.includes('startobject') || lower.includes('непредвиденный узел')) {
          console.warn('[DobEdit][save] fallback to minimal payload (ChekResult only) due to type error', rawMsg.slice(0,300));
          const chekKey = toODataKey(chekInternal);
          const minimal = { [chekKey]: payload[chekKey] ?? form[chekInternal] ?? '' };
          // Title тоже попробуем если есть
          if (payload.Title) minimal.Title = payload.Title;
          if (payload['OData_Title']) minimal['OData_Title'] = payload['OData_Title'];
          console.log('[DobEdit][save] minimal keys', Object.keys(minimal));
          await updateDobItem(id, minimal);
          // успех — не кидаем дальше, обновляем baseline для ChekResult и чистим dirty
          if (initialFormRef.current) initialFormRef.current[chekInternal] = form[chekInternal];
          else initialFormRef.current = { [chekInternal]: form[chekInternal] };
          dirtySetRef.current.delete(chekInternal);
          notify(`Заявка ${id} сохранена (только ${chekKey})`, { severity: 'success' });
          qc.invalidateQueries({ queryKey: ['dob-items'] });
          qc.invalidateQueries({ queryKey: ['dob-item', id] });
          getDobAttachments(id).then(setAttachments).catch(()=>{});
          return;
        }
        throw e;
      }
      notify(`Заявка ${id} сохранена`, { severity: 'success' });
      // Обновляем baseline для dirty-check и чистим dirty
      initialFormRef.current = { ...form };
      dirtySetRef.current.clear();
      // Invalidate list and item
      qc.invalidateQueries({ queryKey: ['dob-items'] });
      qc.invalidateQueries({ queryKey: ['dob-item', id] });
      // Refresh attachments
      getDobAttachments(id).then(setAttachments).catch(()=>{});
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка сохранения';
      setSaveError(String(msg).slice(0, 800));
      notify(`Ошибка: ${String(msg).slice(0,200)}`, { severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [id, form, fields, notify, qc]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const handleUploadImage = useCallback(async (file) => {
    if (!id) return null;
    setIsUploadingImage(true);
    console.log('[DobEdit][upload] start', file.name, file.size, file.type);
    try {
      const res = await uploadDobAttachment(id, file);
      console.log('[DobEdit][upload] res', res);
      // Refresh attachments
      getDobAttachments(id).then(a=> { console.log('[DobEdit][upload] attachments after', a); setAttachments(a); }).catch(()=>{});
      notify(`Изображение ${file.name} загружено`, { severity: 'success' });
      // Для сохранения в SharePoint нужен ServerRelativeUrl без /dob-api (иначе на проде 404). На проде это https://portal.lenta.com/sites/..., в dev — /sites/...
      const serverRelative = res?.ServerRelativeUrl || res?.ServerRelativePath?.DecodedUrl || null;
      const finalUrlForSave = serverRelative || res?.url || res?.src || null;
      const finalUrlForTest = res?.url || res?.src || serverRelative;
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
  }, [id, notify]);


  const handleBack = () => {
    window.location.hash = '#dob_tasks';
  };

  const loading = fieldsLoading || itemLoading;

  const editableFields = useMemo(() => {
    if (!fields) return [];
    return fields.filter(f => {
      if (['ID','Attachments','ContentType','ContentTypeId'].includes(f.InternalName)) return false;
      if (isHiddenFormField(f.InternalName)) return false;
      // Show all except hidden system, but mark readOnly
      if (f.Hidden) return false;
      return true;
    });
  }, [fields]);

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
  const chekValue = toEditorHtml(form[chekInternal] ?? getODataValue(item, chekInternal) ?? '');

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
      await deleteDobAttachment(id, fileName);
      notify(`Вложение ${fileName} удалено`, { severity: 'success' });
      // Remove from attachments state
      setAttachments(prev => prev.filter(a => a.FileName !== fileName && a.ServerRelativeUrl !== fileName));
      // Also remove image from ChekResult HTML if present (only if not already removed by editor)
      setForm(prev => {
        const cur = prev[chekInternal] || '';
        if (typeof cur === 'string' && cur.includes(fileName)) {
          // remove img tags that contain fileName
          const cleaned = cur.replace(new RegExp(`<img[^>]*${fileName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[^>]*>`, 'gi'), '');
          if (cleaned !== cur) {
            console.log('[DobEdit][delete] cleaned html from fileName', fileName);
            return { ...prev, [chekInternal]: cleaned };
          }
        }
        return prev;
      });
      // Refresh from server
      getDobAttachments(id).then(setAttachments).catch(()=>{});
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка удаления';
      notify(`Не удалось удалить: ${String(msg).slice(0,200)}`, { severity: 'error' });
    } finally {
      pendingDeleteRef.current.delete(fileName);
    }
  }, [id, notify, chekInternal]);

  // Синхрон: если картинка удалена из ChekResult (в редакторе) — удалить вложение
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
    // Сравниваем src
    const prevSrcs = extractImgSrcs(prevHtml);
    const curSrcs = extractImgSrcs(curHtml);
    // Находим удалённые src (были, теперь нет)
    const removed = prevSrcs.filter(s => !curSrcs.includes(s));
    if (removed.length === 0) {
      prevChekHtmlRef.current = curHtml;
      return;
    }
    console.log('[DobEdit][sync-delete] removed srcs', removed);
    // Для каждого удалённого src, если это не base64, найти fileName и удалить вложение если оно есть
    removed.forEach(src => {
      if (!src || src.startsWith('data:')) {
        console.log('[DobEdit][sync-delete] skip base64', src?.slice(0,30));
        return;
      }
      // Извлекаем имя файла
      let fileName = '';
      try {
        const withoutQuery = src.split('?')[0].split('#')[0];
        fileName = decodeURIComponent(withoutQuery.split('/').pop() || '');
      } catch {}
      if (!fileName) return;
      // Проверяем что вложение существует
      const exists = attachments.some(a => a.FileName === fileName || a.ServerRelativeUrl?.endsWith('/' + fileName));
      if (!exists) {
        console.log('[DobEdit][sync-delete] attachment not found for', fileName);
        return;
      }
      // Дедуп
      if (pendingDeleteRef.current.has(fileName)) {
        console.log('[DobEdit][sync-delete] already pending', fileName);
        return;
      }
      console.log('[DobEdit][sync-delete] auto-delete attachment for removed image', fileName, src.slice(0,80));
      handleDeleteAttachment(fileName);
    });
    prevChekHtmlRef.current = curHtml;
  }, [form[chekInternal], extractImgSrcs, attachments, handleDeleteAttachment, chekInternal]);


  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: 400, gap: 1 }}>
        <CircularProgress />
        <Typography color="text.secondary">Загрузка заявки {id}…</Typography>
      </Box>
    );
  }

  if (itemError) {
    const msg = itemError?.response?.data?.error?.message?.value || itemError?.message || String(itemError);
    return (
      <Box sx={{ p: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>К списку</Button>
        <Alert severity="error">Не удалось загрузить заявку {id}: {String(msg).slice(0, 800)}</Alert>
        <Button startIcon={<RefreshIcon />} onClick={()=> refetch()} sx={{ mt: 1 }}>Повторить</Button>
      </Box>
    );
  }

  return (
    <Box data-dob-edit-page="true" sx={{ width: '100%', maxWidth: 'none', mx: 0, display: 'flex', flexDirection: 'column', gap: .75, p: { xs: .5, md: .75 }, boxSizing: 'border-box', overflowX: 'hidden', minWidth: 0, '& .MuiOutlinedInput-root': { borderRadius: .5 }, '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { height: 32, borderRadius: .5 }, '& .MuiInputBase-input': { py: .5, fontSize: 13 }, '& .MuiSelect-select': { py: .5, fontSize: 13 }, '& .MuiButton-root': { borderRadius: .5, minHeight: 32, height: 32 }, '& .MuiFormControlLabel-root': { minHeight: 32 } }}>
      <AppBar position="sticky" elevation={0} sx={{ top: 0, zIndex: 1100, bgcolor: '#fff', color: '#171c8f', borderBottom: '1px solid rgba(23,28,143,.12)' }}>
        <Toolbar variant="dense" sx={{ minHeight: 48, px: { xs: .5, sm: 1 }, gap: .5 }}>
          <IconButton onClick={onOpenMenu} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label="Открыть меню"><MenuIcon /></IconButton>
          <IconButton onClick={handleBack} size="small" sx={{ color: '#171c8f', borderRadius: .5 }} aria-label="К списку"><ArrowBackIcon fontSize="small" /></IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Заявка ДОБ #{id}</Typography>
          {isFetching && <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>обновление…</Typography>}
          <Button size="small" variant="outlined" onClick={()=> refetch()} disabled={isFetching} startIcon={<RefreshIcon />} sx={{ borderRadius: .5 }}>Обновить</Button>
          <Button size="small" variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit"/> : <SaveIcon />} sx={{ borderRadius: .5, minWidth: 120, backgroundImage: 'linear-gradient(180deg,#171c8f 0%,#10146a 100%)', color: '#fff' }}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Toolbar>
      </AppBar>

      {saveError && <Alert severity="error" onClose={()=> setSaveError('')}>{saveError}</Alert>}
      {fieldsError && <Alert severity="warning">Не удалось загрузить метаданные полей: {String(fieldsError?.message || fieldsError).slice(0,400)}</Alert>}

      <Box className="dob-rich-section" sx={{ width: '100%', minWidth: 0, position: 'relative', zIndex: 1, flex: '0 0 auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: '#171c8f' }}>Результат проверки — главное поле</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Поддерживает таблицы, списки, форматирование и вставку изображений. Изображения автоматически загружаются как вложения заявки и вставляются как {'<img src="...">'}.
        </Typography>
        {isUploadingImage && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
        <RichEditor
          value={chekValue || ''}
          onChange={(html)=> handleChange(chekInternal, html)}
          onUploadImage={handleUploadImage}
          onDeleteImage={(src)=> {
            if (!src || src.startsWith('data:')) return;
            let fileName = '';
            try { fileName = decodeURIComponent(src.split('?')[0].split('#')[0].split('/').pop() || ''); } catch {}
            if (!fileName) return;
            console.log('[DobEdit][onDeleteImage] from editor', fileName, src.slice(0,80));
            handleDeleteAttachment(fileName);
          }}
          isUploading={isUploadingImage}
        />
        {attachments.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}><AttachFileIcon fontSize="small"/> Вложения ({attachments.length}):</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {attachments.map(a => {
                const fileName = a.FileName || a.ServerRelativeUrl?.split('/').pop();
                // build href correctly for dev proxy
                let href = a.ServerRelativeUrl;
                try {
                  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
                  if (href && href.startsWith('/') && isDev) href = `/dob-api${href}`;
                  else if (href && href.startsWith('/') && !isDev && typeof window !== 'undefined') href = `${window.location.origin}${href}`;
                } catch {}
                return (
                  <Chip
                    key={a.FileName || a.ServerRelativeUrl}
                    label={a.FileName}
                    size="small"
                    clickable
                    onClick={() => { if (href) window.open(href, '_blank'); }}
                    onDelete={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteAttachment(a.FileName); }}
                    deleteIcon={<Tooltip title="Удалить вложение"><DeleteIcon fontSize="small" /></Tooltip>}
                    sx={{ maxWidth: 220 }}
                  />
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Удаление вложения также уберёт картинку из текста (если она там есть) — не забудьте Сохранить.</Typography>
          </Box>
        )}
      </Box>

      <Box className="dob-fields-section" sx={{ width: '100%', minWidth: 0, position: 'relative', zIndex: 2, flex: '0 0 auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5, color: '#171c8f' }}>Остальные поля</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: .75, md: 1 } }}>
          {editableFields.filter(f => f.InternalName !== chekInternal && !/^(?:modified|откорректировано|изменено)$/i.test(String(f.InternalName || f.Title || '').trim()) && !/откорректировано|изменено/i.test(String(f.Title || ''))).map(f => {
            const internal = f.InternalName;
            const title = f.Title || internal;
            const t = (f.TypeAsString || '').toLowerCase();
            const editable = isEditableField(f);
            const value = form[internal] ?? getODataValue(item, internal) ?? '';
            const isCalculated = t === 'calculated' || t === 'computed';

            if (internal === 'Author' || internal === 'Editor') {
              const disp = item?.[internal]?.Title || value || '';
              return (
                <TextField key={internal} label={title} value={disp} InputProps={{ readOnly: true }} size="small" fullWidth />
              );
            }
            if (t === 'choice') {
              const rawChoices = Array.isArray(f.Choices) ? f.Choices : (f.Choices?.results || []);
              const vals = (rawChoices || []).filter(Boolean);
              return (
                <TextField
                  key={internal}
                  select
                  label={`${title}${f.Required ? ' *' : ''}`}
                  value={value || ''}
                  onChange={e=> handleChange(internal, e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!editable}
                >
                  <MenuItem value=""><em>— не выбрано —</em></MenuItem>
                  {vals.map(v=> <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </TextField>
              );
            }
            if (t === 'boolean') {
              const boolVal = value === true || value === 1 || value === '1' || String(value).toLowerCase()==='true';
              return (
                <FormControlLabel
                  key={internal}
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
                <Box key={internal} sx={{ gridColumn: { md: '1 / -1' }, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: .5 }}>{title}{f.Required ? ' *' : ''}</Typography>
                  <RichEditor value={htmlValue} readOnly={!editable} onChange={html => handleChange(internal, html)} />
                </Box>
              );
            }
            if (t === 'note') {
              return (
                <TextField
                  key={internal}
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
            if (t === 'user') {
              const disp = item?.[internal]?.Title || value || '';
              return (
                <TextField key={internal} label={`${title}${f.Required ? ' *' : ''}`} value={disp} InputProps={{ readOnly: true }} size="small" fullWidth />
              );
            }
            if (t === 'url') {
              return (
                <TextField
                  key={internal}
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

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pb: 2 }}>
        <Button onClick={handleBack} variant="outlined" sx={{ borderRadius: 2 }}>К списку</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={<SaveIcon />} sx={{ borderRadius: 2, minWidth: 160 }}>Сохранить</Button>
      </Box>
    </Box>
  );
}

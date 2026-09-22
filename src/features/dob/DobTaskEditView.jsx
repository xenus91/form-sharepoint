// src/features/dob/DobTaskEditView.jsx
// Full-screen edit form for single DOB item — with rich ChekResult editor
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Button, Chip, CircularProgress, LinearProgress, Typography, Stack, Alert, Paper, TextField, MenuItem, Checkbox, FormControlLabel, Divider, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDobFields, getDobItem, updateDobItem, uploadDobAttachment, getDobAttachments, deleteDobAttachment } from './api/dobApi';
import { useNotifications } from '../../NotificationsProvider';
import RichEditor from './components/RichEditor';

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

export default function DobTaskEditView({ id }) {
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const prevChekHtmlRef = useRef(null);
  const pendingDeleteRef = useRef(new Set());

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
  }, [item, fields]);

  const handleChange = useCallback((internal, value) => {
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
      // Always allow ChekResult even if metadata says readOnly? Ensure it saves. If ChekResult is note, it is editable.
      // Add all form keys that are in fields and editable, or ChekResult
      for (const [k, v] of Object.entries(form)) {
        if (k === 'ID' || k === 'Id') continue;
        if (k === 'ChekResult' || k === '_x041a__x043e__x043c__x043c__x04') {
          payload[k] = v ?? '';
          continue;
        }
        if (editableSet.has(k)) {
          // For User fields, SharePoint expects <FieldName>Id with number; but form stores Id already? Handle
          payload[k] = v;
        }
      }
      // Remove system fields
      delete payload.Attachments;
      delete payload.Author;
      delete payload.Editor;
      // Ensure boolean/null handling
      await updateDobItem(id, payload);
      notify(`Заявка ${id} сохранена`, { severity: 'success' });
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
      const finalUrl = res?.url || res?.src || res?.ServerRelativeUrl || null;
      console.log('[DobEdit][upload] finalUrl', finalUrl);
      // Test image load
      if (finalUrl) {
        const testImg = new Image();
        testImg.onload = () => console.log('[DobEdit][upload] test load OK', finalUrl);
        testImg.onerror = (e) => console.error('[DobEdit][upload] test load FAIL', finalUrl, e);
        testImg.src = finalUrl;
      }
      return finalUrl;
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка загрузки';
      notify(`Загрузка не удалась: ${String(msg).slice(0,200)}`, { severity: 'error' });
      throw e;
    } finally {
      setIsUploadingImage(false);
    }
  }, [id, notify]);


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

  const handleBack = () => {
    window.location.hash = '#dob_tasks';
  };

  const loading = fieldsLoading || itemLoading;

  const editableFields = useMemo(() => {
    if (!fields) return [];
    return fields.filter(f => {
      if (['ID','Attachments','ContentType','ContentTypeId'].includes(f.InternalName)) return false;
      // Show all except hidden system, but mark readOnly
      if (f.Hidden) return false;
      return true;
    });
  }, [fields]);

  const chekField = useMemo(() => {
    if (!fields) return null;
    // Exact: ChekResult, but also check Title contains 'Результат проверки' or internal starts with
    let f = fields.find(x => x.InternalName === 'ChekResult');
    if (f) return f;
    f = fields.find(x => (x.Title || '').includes('Результат проверки') || (x.Title || '').toLowerCase().includes('результат'));
    return f || { InternalName: 'ChekResult', Title: 'Результат проверки (ChekResult)', TypeAsString: 'Note', Required: false };
  }, [fields]);

  const chekInternal = chekField?.InternalName || 'ChekResult';
  const chekValue = form[chekInternal] ?? getODataValue(item, chekInternal) ?? '';

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
    <Box sx={{ width: '100%', maxWidth: '100%', mx: 0, display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 1, md: 2 }, boxSizing: 'border-box', overflowX: 'hidden' }}>
      <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1, border: '1px solid rgba(23,28,143,0.12)' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} variant="outlined" sx={{ borderRadius: 2 }}>К списку</Button>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#171c8f', ml: 1 }}>Заявка ДОБ — {form.Title ? `${form.Title} ` : ''}#{id}</Typography>
        <Chip label={getODataValue(item, '_x0421__x0442__x0430__x0442__x04') || item?.OData__x0421__x0442__x0430__x0442__x04 || '—'} size="small" sx={{ ml: 1, fontWeight: 700 }} />
        <Box sx={{ flex: 1 }} />
        {isFetching && <Typography variant="caption" color="text.secondary">обновление…</Typography>}
        <Button variant="outlined" onClick={()=> refetch()} disabled={isFetching} startIcon={<RefreshIcon />} sx={{ borderRadius: 2 }}>Обновить</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit"/> : <SaveIcon />} sx={{ borderRadius: 2, minWidth: 140, backgroundImage: 'linear-gradient(180deg,#171c8f 0%,#10146a 100%)' }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </Paper>

      {saveError && <Alert severity="error" onClose={()=> setSaveError('')}>{saveError}</Alert>}
      {fieldsError && <Alert severity="warning">Не удалось загрузить метаданные полей: {String(fieldsError?.message || fieldsError).slice(0,400)}</Alert>}

      <Paper sx={{ p: 2, borderRadius: 1, border: '1px solid rgba(23,28,143,0.08)' }}>
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
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 1, border: '1px solid rgba(23,28,143,0.08)' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5, color: '#171c8f' }}>Остальные поля</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {editableFields.filter(f=> f.InternalName !== chekInternal).map(f => {
            const internal = f.InternalName;
            const title = f.Title || internal;
            const t = (f.TypeAsString || '').toLowerCase();
            const editable = isEditableField(f);
            const value = form[internal] ?? getODataValue(item, internal) ?? '';
            const isCalculated = t === 'calculated' || t === 'computed';

            if (internal === 'Author' || internal === 'Editor') {
              const disp = item?.[internal]?.Title || value || '';
              return (
                <TextField key={internal} label={title} value={disp} InputProps={{ readOnly: true }} size="small" fullWidth helperText={internal} />
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
                  helperText={`${internal} — ${f.TypeAsString}${isCalculated ? ' (только чтение — формула)' : ''}`}
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
                  label={`${title}${f.Required ? ' *' : ''} (${internal})`}
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
                  helperText={`${internal} — ${f.TypeAsString}${isCalculated ? ' (только чтение)' : ''}`}
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
                  helperText={`${internal} — ${f.TypeAsString}`}
                />
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
                  helperText={`${internal} — ${f.TypeAsString}${isCalculated ? ' (только чтение)' : ''}`}
                />
              );
            }
            if (t === 'user') {
              const disp = item?.[internal]?.Title || value || '';
              return (
                <TextField key={internal} label={`${title}${f.Required ? ' *' : ''}`} value={disp} InputProps={{ readOnly: true }} size="small" fullWidth helperText={`${internal} — User (только чтение в этой форме)`} />
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
                  helperText={`${internal} — ${f.TypeAsString}`}
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
                helperText={`${internal} — ${f.TypeAsString}${isCalculated ? ' (только чтение — формула)' : editable ? '' : ' (только чтение)'}`}
              />
            );
          })}
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Серые — только чтение (Calculated/Computed/ReadOnly). Остальные уйдут PATCH MERGE по InternalName. `ChekResult` — rich-HTML с таблицами и {'<img>'} из вложений (`/AttachmentFiles/add`).
        </Typography>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pb: 2 }}>
        <Button onClick={handleBack} variant="outlined" sx={{ borderRadius: 2 }}>К списку</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={<SaveIcon />} sx={{ borderRadius: 2, minWidth: 160 }}>Сохранить</Button>
      </Box>
    </Box>
  );
}

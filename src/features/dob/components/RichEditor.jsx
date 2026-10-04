// CKEditor 5 wrapper для rich-полей (ChekResult, DescriptionCheckResult…).
// Каждая вставленная картинка ЗАГРУЖАЕТСЯ ВЛОЖЕНИЕМ элемента (вложений может быть
// несколько) — за это отвечает onUploadImage, который передаёт страница формы.
// В текст при этом попадает ССЫЛКА на вложение (не base64): так заявка сохраняется
// компактно, а картинка живёт в `Attachments` элемента. Ссылка хранится серверным
// путём `/sites/…`, а показывается через прокси/абсолютный origin — см.
// `lib/attachmentUrl.js`. Если загрузка не удалась — текст всё равно не теряется
// (остаётся base64).
/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { Box, Button, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { makeUploadAdapter } from './richUploadAdapter';

const TEMPLATE_KEY = 'dob-chekresult-templates';
const DEFAULT_TEMPLATES = [
  { name: 'Проверка ЦЕО', html: '<p><strong>Проверка ЦЕО</strong></p><p>Результат: </p><p>Комментарий: </p>' },
  { name: 'Пустой результат', html: '<p><strong>Результат проверки</strong></p><p></p>' },
];

function readTemplates() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
    return [...DEFAULT_TEMPLATES, ...(Array.isArray(saved) ? saved : [])];
  } catch { return DEFAULT_TEMPLATES; }
}

function UploadAdapterPlugin(onUploadImage) {
  return function uploadAdapterPlugin(editor) {
    editor.plugins.get('FileRepository').createUploadAdapter = loader => makeUploadAdapter(loader, onUploadImage);
  };
}

export default function RichEditor({
  value = '',
  onChange,
  onUploadImage,
  onDeleteImage,
  readOnly = false,
  isUploading = false,
  // Блок вложений показывается ВНУТРИ редактора (внутри его рамки): это часть
  // rich-поля — картинки из текста лежат вложениями, и удалять их удобно рядом.
  footer = null,
  // Незаполненное обязательное поле акцентируется рамкой (валидация формы).
  invalid = false,
}) {
  const editorRef = useRef(null);
  const [templates, setTemplates] = useState(readTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateName, setTemplateName] = useState('');

  const config = useMemo(() => ({
    licenseKey: 'GPL',
    placeholder: 'Введите результат проверки…',
    extraPlugins: [UploadAdapterPlugin(onUploadImage)],
    toolbar: {
      items: [
        'undo', 'redo', '|', 'heading', '|', 'bold', 'italic', '|',
        'link', 'bulletedList', 'numberedList', 'blockQuote', '|', 'insertTable', 'imageUpload',
      ],
      shouldNotGroupWhenFull: true,
    },
    image: { toolbar: ['imageTextAlternative', 'imageStyle:inline', 'imageStyle:block', 'imageStyle:side'] },
    table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] },
    link: { addTargetToExternalLinks: true },
    language: 'ru',
  }), [onUploadImage]);

  useEffect(() => {
    if (editorRef.current && value !== undefined && value !== editorRef.current.getData()) {
      editorRef.current.setData(value || '');
    }
  }, [value]);

  const applyTemplate = useCallback((name) => {
    setSelectedTemplate(name);
    const template = templates.find(item => item.name === name);
    if (template && editorRef.current) {
      editorRef.current.setData(template.html);
      onChange?.(template.html);
    }
  }, [templates, onChange]);

  const saveTemplate = useCallback(() => {
    const name = templateName.trim();
    const html = editorRef.current?.getData() || '';
    if (!name || !html) return;
    const custom = templates.filter(item => !DEFAULT_TEMPLATES.some(def => def.name === item.name));
    const next = [...custom.filter(item => item.name !== name), { name, html }];
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    setTemplates([...DEFAULT_TEMPLATES, ...next]);
    setSelectedTemplate(name);
    setTemplateName('');
  }, [templateName, templates]);

  const removeTemplate = useCallback(() => {
    if (!selectedTemplate || DEFAULT_TEMPLATES.some(item => item.name === selectedTemplate)) return;
    const next = templates.filter(item => item.name !== selectedTemplate);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next.filter(item => !DEFAULT_TEMPLATES.some(def => def.name === item.name))));
    setTemplates(next);
    setSelectedTemplate('');
  }, [selectedTemplate, templates]);

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', border: invalid ? '1px solid #d32f2f' : '1px solid rgba(23,28,143,.18)', borderRadius: 0.5, overflow: 'hidden', bgcolor: '#fff' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: .5, bgcolor: '#f8f9ff', borderBottom: '1px solid rgba(23,28,143,.12)' }}>
        <Typography variant="caption" sx={{ alignSelf: 'center', fontWeight: 700, color: '#171c8f' }}>Шаблон:</Typography>
        <Select size="small" displayEmpty value={selectedTemplate} onChange={event => applyTemplate(event.target.value)} sx={{ minWidth: 170, borderRadius: .5 }} disabled={readOnly}>
          <MenuItem value=""><em>Выберите шаблон</em></MenuItem>
          {templates.map(item => <MenuItem key={item.name} value={item.name}>{item.name}</MenuItem>)}
        </Select>
        <TextField size="small" value={templateName} onChange={event => setTemplateName(event.target.value)} placeholder="Название нового шаблона" disabled={readOnly} sx={{ minWidth: 170, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: .5 } }} />
        <Tooltip title="Сохранить текущий текст как шаблон"><span><Button size="small" variant="outlined" sx={{ borderRadius: .5 }} onClick={saveTemplate} disabled={readOnly || !templateName.trim()} startIcon={<SaveIcon />}>Сохранить</Button></span></Tooltip>
        <Tooltip title="Удалить пользовательский шаблон"><span><Button size="small" color="error" sx={{ borderRadius: .5 }} onClick={removeTemplate} disabled={readOnly || !selectedTemplate || DEFAULT_TEMPLATES.some(item => item.name === selectedTemplate)}><DeleteIcon fontSize="small" /></Button></span></Tooltip>
      </Stack>
      {isUploading && <Box sx={{ height: 3, bgcolor: '#2e7d32' }} />}
      <Box sx={{ width: '100%', minWidth: 0, maxWidth: '100%', overflow: 'hidden', '& .ck-editor': { width: '100%', maxWidth: '100%' }, '& .ck-editor__main': { minWidth: 0 }, '& .ck-content': { minHeight: 240, maxHeight: 560, overflowY: 'auto', overflowX: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word' }, '& .ck-content img': { maxWidth: '100%', height: 'auto' }, '& .ck-content figure.table': { maxWidth: '100%', overflowX: 'auto' }, '& .ck-content table': { minWidth: 520 } }}>
        <CKEditor
          editor={ClassicEditor}
          config={config}
          data={value || ''}
          disabled={readOnly}
          onReady={editor => { editorRef.current = editor; }}
          onChange={(_, editor) => onChange?.(editor.getData())}
          onError={error => console.error('[CKEditor]', error)}
        />
      </Box>
      {footer ? (
        <Box
          data-testid="rich-editor-footer"
          sx={{
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            px: 1,
            py: 0.75,
            bgcolor: '#f8f9ff',
            borderTop: '1px solid rgba(23,28,143,.14)',
          }}
        >
          {footer}
        </Box>
      ) : null}
      {!readOnly && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1, py: .75 }}>
        CKEditor 5: форматирование, списки, ссылки, таблицы и изображения. Изображения сохраняются в ChekResult как base64 и дополнительно загружаются во вложения.
      </Typography>}
    </Box>
  );
}

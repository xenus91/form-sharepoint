// src/features/dob/components/RichEditor.jsx
// Advanced TipTap editor for ChekResult — tables, images (paste+upload), formatting, scroll
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Button, Stack, Tooltip, Divider, Popover, IconButton, Typography, TextField, Paper, LinearProgress, CircularProgress } from '@mui/material';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';

import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import CodeIcon from '@mui/icons-material/Code';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import TableChartIcon from '@mui/icons-material/TableChart';
import ImageIcon from '@mui/icons-material/Image';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import TitleIcon from '@mui/icons-material/Title';
import HighlightIcon from '@mui/icons-material/Highlight';
import DeleteIcon from '@mui/icons-material/Delete';

function TablePicker({ onSelect }) {
  const [hover, setHover] = useState({ r: 0, c: 0 });
  const rows = 8, cols = 8;
  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 220 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: '#171c8f' }}>
        Вставить таблицу: {hover.r} × {hover.c} {hover.r ? '' : '— наведите на сетку'}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 22px)`,
          gridTemplateRows: `repeat(${rows}, 22px)`,
          gap: '3px',
          p: 0.5,
          bgcolor: 'rgba(23,28,143,0.04)',
          borderRadius: 2,
          border: '1px solid rgba(23,28,143,0.08)',
        }}
        onMouseLeave={() => setHover({ r: 0, c: 0 })}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const active = r < hover.r && c < hover.c;
            return (
              <Box
                key={`${r}-${c}`}
                onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                onClick={() => onSelect(hover.r, hover.c)}
                sx={{
                  width: 22, height: 22,
                  borderRadius: '4px',
                  border: '1px solid',
                  borderColor: active ? '#171c8f' : 'rgba(0,0,0,0.12)',
                  bgcolor: active ? 'rgba(23,28,143,0.18)' : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.08s',
                  '&:hover': { bgcolor: active ? 'rgba(23,28,143,0.28)' : 'rgba(23,28,143,0.08)' },
                }}
              />
            );
          })
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">Клик — вставить, max 8×8 (потом можно добавить строки/столбцы кнопками).</Typography>
    </Box>
  );
}

export default function RichEditor({ value, onChange, onUploadImage, readOnly = false, isUploading = false }) {
  const [linkPopoverAnchor, setLinkPopoverAnchor] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [tablePopoverAnchor, setTablePopoverAnchor] = useState(null);
  const fileInputRef = useRef(null);
  const [internalUploading, setInternalUploading] = useState(false);
  const uploading = isUploading || internalUploading;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: {},
        codeBlock: {},
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null, parseHTML: el => el.getAttribute('width'), renderHTML: attrs => attrs.width ? { width: attrs.width } : {} },
            height: { default: null, parseHTML: el => el.getAttribute('height'), renderHTML: attrs => attrs.height ? { height: attrs.height } : {} },
            style: { default: null, parseHTML: el => el.getAttribute('style'), renderHTML: attrs => attrs.style ? { style: attrs.style } : {} },
          };
        },
      }).configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'dob-editor-image' },
      }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) onChange(html);
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const images = items.filter(i => i.type.indexOf('image') === 0);
        if (images.length > 0) {
          event.preventDefault();
          setInternalUploading(true);
          let pending = images.length;
          const done = () => { pending--; if (pending<=0) setInternalUploading(false); };
          images.forEach(item => {
            const file = item.getAsFile();
            if (file && onUploadImage) {
              (async () => {
                try {
                  const url = await onUploadImage(file);
                  if (url && editor) editor.chain().focus().setImage({ src: url, alt: file.name }).run();
                } catch (e) { console.error('paste upload failed', e); }
                finally { done(); }
              })();
            } else if (file && editor) {
              const reader = new FileReader();
              reader.onload = () => {
                editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
                done();
              };
              reader.onerror = () => done();
              reader.readAsDataURL(file);
            } else { done(); }
          });
          return true;
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (files.length > 0) {
            event.preventDefault();
            setInternalUploading(true);
            let pending = files.length;
            const done = () => { pending--; if (pending<=0) setInternalUploading(false); };
            files.forEach(async (file) => {
              try {
                const url = onUploadImage ? await onUploadImage(file) : URL.createObjectURL(file);
                if (url && editor) {
                  const { pos } = view.posAtCoords({ left: event.clientX, top: event.clientY }) || { pos: view.state.selection.from };
                  editor.chain().focus().setTextSelection(pos).setImage({ src: url, alt: file.name }).run();
                }
              } catch (e) { console.error('drop upload failed', e); }
              finally { done(); }
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      const isSame = editor.getHTML() === value;
      if (!isSame) editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  const setImageSize = useCallback((pct) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { width: `${pct}%`, style: `width: ${pct}%` }).run();
  }, [editor]);

  const handleImage = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (files.length===0) return;
      setInternalUploading(true);
      try {
        for (const file of files) {
          try {
            let url = null;
            if (onUploadImage) url = await onUploadImage(file);
            else url = URL.createObjectURL(file);
            if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run();
          } catch (e) { console.error('image upload failed', e); }
        }
      } finally { setInternalUploading(false); }
    };
    input.click();
  }, [editor, onUploadImage]);

  const insertTable = useCallback((rows, cols) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setTablePopoverAnchor(null);
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    setLinkUrl(prev);
    // open popover anchored to button
  }, [editor]);

  const confirmLink = useCallback(() => {
    if (!editor) return;
    if (linkUrl) editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkPopoverAnchor(null);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const unsetLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkPopoverAnchor(null);
  }, [editor]);

  if (!editor) return null;

  const isActive = (name, opts) => editor.isActive(name, opts);

  return (
    <Box sx={{ border: '1px solid rgba(23,28,143,0.18)', borderRadius: '8px', overflow: 'hidden', bgcolor: '#fff', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {(uploading) && <LinearProgress sx={{ height: 3, borderRadius: 0 }} />}
      {!readOnly && (
        <Paper elevation={0} sx={{ p: 0.5, bgcolor: '#f8f9ff', borderBottom: '1px solid rgba(23,28,143,0.12)', borderRadius: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
          {/* History */}
          <Tooltip title="Отменить (Ctrl+Z)"><IconButton size="small" onClick={()=> editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><UndoIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Повторить (Ctrl+Y)"><IconButton size="small" onClick={()=> editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><RedoIcon fontSize="small"/></IconButton></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Headings */}
          <Tooltip title="Заголовок 1"><IconButton size="small" onClick={()=> editor.chain().focus().toggleHeading({level:1}).run()} sx={{ bgcolor: isActive('heading',{level:1}) ? 'rgba(23,28,143,0.12)' : undefined }}><TitleIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Заголовок 2"><Button size="small" variant={isActive('heading',{level:2})?'contained':'text'} onClick={()=> editor.chain().focus().toggleHeading({level:2}).run()} sx={{ minWidth: 36, px: 0.5 }}>H2</Button></Tooltip>
          <Tooltip title="Заголовок 3"><Button size="small" variant={isActive('heading',{level:3})?'contained':'text'} onClick={()=> editor.chain().focus().toggleHeading({level:3}).run()} sx={{ minWidth: 36, px: 0.5 }}>H3</Button></Tooltip>
          <Tooltip title="Параграф"><Button size="small" variant={isActive('paragraph') && !isActive('heading') ? 'contained':'text'} onClick={()=> editor.chain().focus().setParagraph().run()} sx={{ minWidth: 36, px: 0.5 }}>P</Button></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Inline formatting */}
          <Tooltip title="Жирный (Ctrl+B)"><IconButton size="small" onClick={()=> editor.chain().focus().toggleBold().run()} sx={{ bgcolor: isActive('bold') ? 'rgba(23,28,143,0.14)' : undefined }}><FormatBoldIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Курсив (Ctrl+I)"><IconButton size="small" onClick={()=> editor.chain().focus().toggleItalic().run()} sx={{ bgcolor: isActive('italic') ? 'rgba(23,28,143,0.14)' : undefined }}><FormatItalicIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Подчёркнутый"><IconButton size="small" onClick={()=> editor.chain().focus().toggleUnderline().run()} sx={{ bgcolor: isActive('underline') ? 'rgba(23,28,143,0.14)' : undefined }}><FormatUnderlinedIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Зачёркнутый"><IconButton size="small" onClick={()=> editor.chain().focus().toggleStrike().run()} sx={{ bgcolor: isActive('strike') ? 'rgba(23,28,143,0.14)' : undefined }}><FormatStrikethroughIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Выделить"><IconButton size="small" onClick={()=> editor.chain().focus().toggleHighlight().run()} sx={{ bgcolor: isActive('highlight') ? 'rgba(255,235,59,0.5)' : undefined }}><HighlightIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Код"><IconButton size="small" onClick={()=> editor.chain().focus().toggleCode().run()} sx={{ bgcolor: isActive('code') ? 'rgba(23,28,143,0.14)' : undefined }}><CodeIcon fontSize="small"/></IconButton></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Align */}
          <Tooltip title="По левому"><IconButton size="small" onClick={()=> editor.chain().focus().setTextAlign('left').run()} sx={{ bgcolor: isActive({textAlign:'left'}) ? 'rgba(23,28,143,0.12)' : undefined }}><FormatAlignLeftIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="По центру"><IconButton size="small" onClick={()=> editor.chain().focus().setTextAlign('center').run()} sx={{ bgcolor: isActive({textAlign:'center'}) ? 'rgba(23,28,143,0.12)' : undefined }}><FormatAlignCenterIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="По правому"><IconButton size="small" onClick={()=> editor.chain().focus().setTextAlign('right').run()} sx={{ bgcolor: isActive({textAlign:'right'}) ? 'rgba(23,28,143,0.12)' : undefined }}><FormatAlignRightIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="По ширине"><IconButton size="small" onClick={()=> editor.chain().focus().setTextAlign('justify').run()} sx={{ bgcolor: isActive({textAlign:'justify'}) ? 'rgba(23,28,143,0.12)' : undefined }}><FormatAlignJustifyIcon fontSize="small"/></IconButton></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Lists */}
          <Tooltip title="Маркированный список"><IconButton size="small" onClick={()=> editor.chain().focus().toggleBulletList().run()} sx={{ bgcolor: isActive('bulletList') ? 'rgba(23,28,143,0.12)' : undefined }}><FormatListBulletedIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Нумерованный список"><IconButton size="small" onClick={()=> editor.chain().focus().toggleOrderedList().run()} sx={{ bgcolor: isActive('orderedList') ? 'rgba(23,28,143,0.12)' : undefined }}><FormatListNumberedIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Цитата"><IconButton size="small" onClick={()=> editor.chain().focus().toggleBlockquote().run()} sx={{ bgcolor: isActive('blockquote') ? 'rgba(23,28,143,0.12)' : undefined }}><FormatQuoteIcon fontSize="small"/></IconButton></Tooltip>
          <Tooltip title="Горизонтальная линия"><IconButton size="small" onClick={()=> editor.chain().focus().setHorizontalRule().run()}><HorizontalRuleIcon fontSize="small"/></IconButton></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Link */}
          <Tooltip title={isActive('link') ? 'Редактировать ссылку' : 'Вставить ссылку'}>
            <IconButton size="small" onClick={(e)=> { const prev=editor.getAttributes('link').href||''; setLinkUrl(prev); setLinkPopoverAnchor(e.currentTarget); }} sx={{ bgcolor: isActive('link') ? 'rgba(23,28,143,0.14)' : undefined }}><LinkIcon fontSize="small"/></IconButton>
          </Tooltip>
          {isActive('link') && <Tooltip title="Убрать ссылку"><IconButton size="small" onClick={unsetLink}><LinkOffIcon fontSize="small"/></IconButton></Tooltip>}

          {/* Image */}
          <Tooltip title="Вставить изображение (также Ctrl+V из буфера)"><IconButton size="small" onClick={handleImage} disabled={uploading} sx={{ color: '#2e7d32' }}>{uploading ? <CircularProgress size={16} /> : <ImageIcon fontSize="small"/>}</IconButton></Tooltip>

          {/* Table insert */}
          <Tooltip title="Вставить таблицу (выбрать размер)">
            <Button
              size="small"
              variant="outlined"
              startIcon={<TableChartIcon />}
              onClick={(e)=> setTablePopoverAnchor(e.currentTarget)}
              sx={{ borderRadius: 2, ml: 0.5 }}
            >
              Таблица
            </Button>
          </Tooltip>

          {/* Table actions when inside table */}
          {isActive('table') && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Добавить строку до"><Button size="small" variant="text" onClick={()=> editor.chain().focus().addRowBefore().run()} sx={{ minWidth: 32, p: 0.5 }}>+стр↑</Button></Tooltip>
              <Tooltip title="Добавить строку после"><Button size="small" variant="text" onClick={()=> editor.chain().focus().addRowAfter().run()} sx={{ minWidth: 32, p: 0.5 }}>+стр↓</Button></Tooltip>
              <Tooltip title="Удалить строку"><Button size="small" variant="text" onClick={()=> editor.chain().focus().deleteRow().run()} sx={{ minWidth: 32, p: 0.5 }}>−стр</Button></Tooltip>
              <Tooltip title="Добавить столбец до"><Button size="small" variant="text" onClick={()=> editor.chain().focus().addColumnBefore().run()} sx={{ minWidth: 32, p: 0.5 }}>+кол←</Button></Tooltip>
              <Tooltip title="Добавить столбец после"><Button size="small" variant="text" onClick={()=> editor.chain().focus().addColumnAfter().run()} sx={{ minWidth: 32, p: 0.5 }}>+кол→</Button></Tooltip>
              <Tooltip title="Удалить столбец"><Button size="small" variant="text" onClick={()=> editor.chain().focus().deleteColumn().run()} sx={{ minWidth: 32, p: 0.5 }}>−кол</Button></Tooltip>
              <Tooltip title="Удалить таблицу"><IconButton size="small" onClick={()=> editor.chain().focus().deleteTable().run()} sx={{ color: '#e53935' }}><DeleteIcon fontSize="small"/></IconButton></Tooltip>
              <Tooltip title="Заголовок"><Button size="small" variant={isActive('tableHeader')?'contained':'text'} onClick={()=> editor.chain().focus().toggleHeaderCell().run()} sx={{ minWidth: 32, p: 0.5 }}>H</Button></Tooltip>
            </>
          )}

          <Box sx={{ flex: 1 }} />
          <Tooltip title="Очистить формат"><Button size="small" onClick={()=> editor.chain().focus().unsetAllMarks().clearNodes().run()} sx={{ borderRadius: 2 }}>Очистить</Button></Tooltip>
        </Paper>
      )}

      {/* Popovers */}
      <Popover open={!!tablePopoverAnchor} anchorEl={tablePopoverAnchor} onClose={()=> setTablePopoverAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <TablePicker onSelect={insertTable} />
      </Popover>
      <Popover open={!!linkPopoverAnchor} anchorEl={linkPopoverAnchor} onClose={()=> setLinkPopoverAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 320 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ссылка</Typography>
          <TextField size="small" placeholder="https://example.com" value={linkUrl} onChange={e=> setLinkUrl(e.target.value)} fullWidth autoFocus onKeyDown={e=> { if(e.key==='Enter') confirmLink(); }} />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={()=> setLinkPopoverAnchor(null)}>Отмена</Button>
            <Button size="small" variant="outlined" onClick={unsetLink} disabled={!isActive('link')}>Убрать</Button>
            <Button size="small" variant="contained" onClick={confirmLink}>Применить</Button>
          </Stack>
        </Box>
      </Popover>

      {/* Bubble menu for image — resize + delete */}
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} shouldShow={({ editor, state, from, to }) => {
          const node = state.doc.nodeAt(from);
          const isImg = node?.type?.name === 'image' || state.selection.node?.type?.name === 'image' || editor.isActive('image');
          // also check if parent is image
          try { return isImg; } catch { return false; }
        }}>
          <Paper sx={{ p: 0.5, display: 'flex', gap: 0.5, alignItems: 'center', borderRadius: 1.5, boxShadow: 3, border: '1px solid rgba(23,28,143,0.12)' }}>
            <Typography variant="caption" sx={{ px: 0.5, fontWeight: 700 }}>Картинка:</Typography>
            <Button size="small" onClick={()=> setImageSize(25)} sx={{ minWidth: 36, p: 0.3 }}>25%</Button>
            <Button size="small" onClick={()=> setImageSize(50)} sx={{ minWidth: 36, p: 0.3 }}>50%</Button>
            <Button size="small" onClick={()=> setImageSize(75)} sx={{ minWidth: 36, p: 0.3 }}>75%</Button>
            <Button size="small" onClick={()=> setImageSize(100)} sx={{ minWidth: 36, p: 0.3 }}>100%</Button>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />
            <Tooltip title="Удалить картинку (Delete)"><IconButton size="small" onClick={()=> editor.chain().focus().deleteSelection().run()} sx={{ color: '#e53935' }}><DeleteIcon fontSize="small"/></IconButton></Tooltip>
          </Paper>
        </BubbleMenu>
      )}

      {/* Editor area with scroll */}
      <Box
        sx={{
          p: 0,
          display: 'flex', flexDirection: 'column',
          minHeight: 220,
          maxHeight: 560,
          overflow: 'hidden',
          bgcolor: '#fff',
        }}
      >
        {/* hint for paste */}
        <Box sx={{ px: 1.5, py: 0.5, bgcolor: 'rgba(46,125,50,0.06)', borderBottom: '1px solid rgba(46,125,50,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Подсказка: скопируйте картинку в буфер (PrintScreen, Ctrl+C в Paint) и нажмите <b>Ctrl+V</b> прямо в тексте — она загрузится как вложение. Перетаскивание файла тоже работает.
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            p: 1.5,
            '& .tiptap': {
              outline: 'none',
              fontSize: 14,
              lineHeight: 1.55,
              minHeight: 180,
              maxWidth: '100%',
            },
            '& .tiptap p': { margin: '0.5em 0' },
            '& .tiptap h1': { fontSize: '1.6em', fontWeight: 800, margin: '0.6em 0 0.3em', color: '#171c8f' },
            '& .tiptap h2': { fontSize: '1.3em', fontWeight: 700, margin: '0.6em 0 0.3em' },
            '& .tiptap h3': { fontSize: '1.1em', fontWeight: 700, margin: '0.5em 0 0.2em' },
            '& .tiptap ul, & .tiptap ol': { paddingLeft: '1.4em', margin: '0.5em 0' },
            '& .tiptap blockquote': { borderLeft: '3px solid #c5cae9', margin: '0.8em 0', padding: '0.4em 0.8em', color: '#555', bgcolor: 'rgba(23,28,143,0.04)', borderRadius: '4px' },
            '& .tiptap code': { bgcolor: 'rgba(0,0,0,0.06)', px: '0.3em', py: '0.1em', borderRadius: '4px', fontSize: '0.92em' },
            '& .tiptap pre': { bgcolor: '#f5f5f5', p: 1, borderRadius: 1, overflowX: 'auto', fontSize: '0.9em', border: '1px solid rgba(0,0,0,0.08)' },
            '& .tiptap a': { color: '#171c8f', textDecoration: 'underline', textUnderlineOffset: '2px' },
            '& .tiptap hr': { border: 'none', borderTop: '1px solid rgba(0,0,0,0.12)', margin: '1em 0' },
            // Table wrapper scroll + resize handle
            '& .tiptap .tableWrapper': { overflowX: 'auto', maxWidth: '100%', margin: '0.8em 0', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '6px', display: 'block' },
            '& .tiptap table': { borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 13, tableLayout: 'fixed' },
            '& .tiptap table td, & .tiptap table th': { border: '1px solid #c1c7d0', padding: '7px 10px', verticalAlign: 'top', minWidth: 80, wordBreak: 'break-word', position: 'relative' },
            '& .column-resize-handle': { position: 'absolute', right: -2, top: 0, bottom: 0, width: 4, background: 'rgba(23,28,143,0.25)', cursor: 'col-resize', opacity: 0, transition: 'opacity 0.15s' },
            '& .tiptap table:hover .column-resize-handle': { opacity: 1 },
            '& .tiptap table th': { background: '#f4f5f7', fontWeight: 700, textAlign: 'left' },
            '& .tiptap table .selectedCell': { background: 'rgba(23,28,143,0.08)' },
            '& .tiptap img': { maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '0.6em 0', border: '1px solid #e0e0e0', display: 'block', cursor: 'pointer' },
            '& .tiptap img[width]': { width: 'attr(width %)', maxWidth: '100%' },
            '& .tiptap img.ProseMirror-selectednode': { outline: '2px solid #171c8f', outlineOffset: 2 },
            // Placeholder
            '& .tiptap p.is-editor-empty:first-of-type::before': { content: 'attr(data-placeholder)', float: 'left', color: 'rgba(0,0,0,0.35)', pointerEvents: 'none', height: 0 },
          }}
        >
          <EditorContent editor={editor} />
        </Box>
      </Box>
    </Box>
  );
}

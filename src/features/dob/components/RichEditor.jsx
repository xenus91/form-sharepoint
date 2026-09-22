// src/features/dob/components/RichEditor.jsx
import React, { useEffect } from 'react';
import { Box, Button, Stack, Tooltip, Divider } from '@mui/material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import TableChartIcon from '@mui/icons-material/TableChart';
import ImageIcon from '@mui/icons-material/Image';

export default function RichEditor({ value, onChange, onUploadImage, readOnly = false }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // keep default
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Table.configure({
        resizable: true,
      }),
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
  });

  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      // Avoid loop when editor already has same content
      const isSame = editor.getHTML() === value;
      if (!isSame) {
        editor.commands.setContent(value || '', false);
      }
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  const handleImage = async () => {
    if (!editor) return;
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        let url = null;
        if (onUploadImage) {
          url = await onUploadImage(file);
        } else {
          // fallback base64 preview
          url = URL.createObjectURL(file);
        }
        if (url) editor.chain().focus().setImage({ src: url }).run();
      } catch (e) {
        console.error('upload image failed', e);
      }
    };
    input.click();
  };

  const insertTable = () => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  if (!editor) return null;

  return (
    <Box sx={{ border: '1px solid rgba(23,28,143,0.18)', borderRadius: '12px', overflow: 'hidden', bgcolor: '#fff' }}>
      {!readOnly && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ p: 0.5, bgcolor: '#f8f9ff', borderBottom: '1px solid rgba(23,28,143,0.12)', flexWrap: 'wrap' }}>
          <Tooltip title="Жирный"><Button size="small" variant={editor.isActive('bold') ? 'contained' : 'text'} onClick={()=> editor.chain().focus().toggleBold().run()} sx={{ minWidth: 32, p: 0.5 }}><FormatBoldIcon fontSize="small"/></Button></Tooltip>
          <Tooltip title="Курсив"><Button size="small" variant={editor.isActive('italic') ? 'contained' : 'text'} onClick={()=> editor.chain().focus().toggleItalic().run()} sx={{ minWidth: 32, p: 0.5 }}><FormatItalicIcon fontSize="small"/></Button></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Маркированный список"><Button size="small" variant={editor.isActive('bulletList') ? 'contained' : 'text'} onClick={()=> editor.chain().focus().toggleBulletList().run()} sx={{ minWidth: 32, p: 0.5 }}><FormatListBulletedIcon fontSize="small"/></Button></Tooltip>
          <Tooltip title="Нумерованный список"><Button size="small" variant={editor.isActive('orderedList') ? 'contained' : 'text'} onClick={()=> editor.chain().focus().toggleOrderedList().run()} sx={{ minWidth: 32, p: 0.5 }}><FormatListNumberedIcon fontSize="small"/></Button></Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Вставить таблицу 3x3"><Button size="small" variant="outlined" onClick={insertTable} startIcon={<TableChartIcon/>} sx={{ borderRadius: 2 }}>Таблица</Button></Tooltip>
          <Tooltip title="Вставить изображение (загрузит как вложение)"><Button size="small" variant="outlined" onClick={handleImage} startIcon={<ImageIcon/>} sx={{ borderRadius: 2 }}>Изображение</Button></Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={()=> editor.chain().focus().unsetAllMarks().clearNodes().run()} sx={{ borderRadius: 2 }}>Очистить формат</Button>
        </Stack>
      )}
      <Box
        sx={{
          p: 1.5,
          minHeight: 220,
          maxHeight: 520,
          overflowY: 'auto',
          '& .tiptap': { outline: 'none', fontSize: 14, lineHeight: 1.5, minHeight: 180 },
          '& .tiptap p': { margin: '0.4em 0' },
          '& .tiptap h1, & .tiptap h2, & .tiptap h3': { margin: '0.6em 0 0.3em' },
          '& .tiptap ul, & .tiptap ol': { paddingLeft: '1.2em' },
          '& .tiptap table': { borderCollapse: 'collapse', width: '100%', margin: '0.8em 0', fontSize: 13 },
          '& .tiptap table td, & .tiptap table th': { border: '1px solid #c1c7d0', padding: '6px 8px', verticalAlign: 'top' },
          '& .tiptap table th': { background: '#f4f5f7', fontWeight: 700 },
          '& .tiptap img': { maxWidth: '100%', height: 'auto', borderRadius: 6, margin: '0.5em 0', border: '1px solid #e0e0e0' },
          '& .tiptap blockquote': { borderLeft: '3px solid #ddd', margin: '0.8em 0', paddingLeft: '0.8em', color: '#555' },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

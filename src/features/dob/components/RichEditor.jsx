// Модуль перенесён в src/features/tasks/components/RichEditor.jsx
// (вынос общего кода, 2026-10-16). Файл оставлен ре-экспортом, пока жив
// src/features/dob.
//
// `export *` НЕ переносит default-экспорт, поэтому он вынесен отдельной строкой:
// RichEditor импортируют именно default'ом.
export { default } from "../../tasks/components/RichEditor";
export * from "../../tasks/components/RichEditor";

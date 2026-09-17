// src/tasks/log.js
// Логгеры для hash-режима и задач. Экспортируются отдельно, чтобы можно было
// переиспользовать в TasksView и в вынесенных модулях (hashSearch и т.д.).

export const HASH_LOG = (...args) => console.log("%c[HASH]", "color:#171c8f;font-weight:800", ...args);
export const HASH_WARN = (...args) => console.warn("%c[HASH]", "color:#c62828;font-weight:800", ...args);
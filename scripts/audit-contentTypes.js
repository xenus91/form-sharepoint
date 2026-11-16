#!/usr/bin/env node
// scripts/audit-contentTypes.js
// Phase 2 — автогенерация таблицы docs/audit/content-types.md из raw REST дампов
// Использование: node scripts/audit-contentTypes.js --raw docs/audit/raw
// Raw ожидаются как JSON файлы, сохранённые из console скрипта docs/audit/content-types.md
// - ct-*.json — массив content types с {Name, Id/StringId, Parent, FieldLinks}
// - fields-*.json — массив полей с {InternalName, Title, TypeDisplayName, TypeShortDescription, Choices, Id, StringId}
// - additionalActions-*.json — single field dump для AdditionalActions
// Если raw пусто — выводит инструкцию и не трогает md.

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const idx = process.argv.indexOf('--raw');
  const rawDir = idx !== -1 ? process.argv[idx + 1] : 'docs/audit/raw';
  return { rawDir };
}

function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const json = JSON.parse(raw);
      out.push({ file: f, json });
    } catch (e) {
      console.warn(`skip ${f}: ${e.message}`);
    }
  }
  return out;
}

function norm(s) { return String(s||'').trim().toLowerCase(); }

function detectCtAndFields(blobs) {
  let cts = [];
  let fields = [];
  let additionalField = null;
  for (const { file, json } of blobs) {
    const arr = Array.isArray(json) ? json : (json?.d?.results || json?.results || []);
    if (!Array.isArray(arr) || arr.length===0) continue;
    // Heuristic: ct has FieldLinks or Id.StringValue, fields has TypeDisplayName/InternalName
    const sample = arr[0];
    if (sample.FieldLinks !== undefined || sample.StringId) {
      // could be both ct and fields (fields also have StringId) — need check Name+FieldLinks size
      if (sample.Name && (sample.FieldLinks || sample.Id?.StringValue)) {
        // content type
        cts = cts.concat(arr);
      } else if (sample.InternalName || sample.TypeDisplayName) {
        fields = fields.concat(arr);
      } else {
        // fallback by filename
        if (file.toLowerCase().includes('ct')) cts = cts.concat(arr);
        else fields = fields.concat(arr);
      }
    } else if (sample.InternalName || sample.TypeDisplayName) {
      fields = fields.concat(arr);
      // detect AdditionalActions single dump (filename)
      if (file.toLowerCase().includes('additional')) {
        additionalField = sample;
      }
    }
  }
  // Also try to find AdditionalActions from fields array
  if (!additionalField) {
    additionalField = fields.find(f => f.InternalName === 'AdditionalActions') || null;
  }
  return { cts, fields, additionalField };
}

function buildTable(cts, fields, additionalField) {
  const RESULT_DISPLAY = 'Результирующий выбор';
  const RESULT_SHORT = 'Результат задачи';
  const resultFields = fields.filter(f => norm(f.TypeDisplayName)===norm(RESULT_DISPLAY) && norm(f.TypeShortDescription||f.TypeShortDescription)===norm(RESULT_SHORT));
  // also include fallback ResultSearchTHU if no type match
  const fallback = fields.find(f=>f.InternalName==='ResultSearchTHU');
  const effectiveResultFields = resultFields.length? resultFields : (fallback?[fallback]:[]);

  const rows = [];
  if (cts.length===0) {
    rows.push(`| UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — нет raw ct данных, выполните console скрипт |`);
    return rows;
  }
  for (const ct of cts) {
    const name = ct.Name || 'UNKNOWN';
    const ctId = ct.Id?.StringValue || ct.StringId || ct.Id || 'UNKNOWN';
    const parent = ct.Parent?.StringValue || ct.Parent || 'UNKNOWN';
    const links = ct.FieldLinks?.results || ct.FieldLinks || [];
    const linkIds = new Set(links.map(l=> norm(l.Id||l.StringId||'')));
    let resultFieldName = 'UNKNOWN';
    let resultSample = 'UNKNOWN';
    for (const f of effectiveResultFields) {
      const fid = norm(f.Id||''), sid = norm(f.StringId||'');
      if (linkIds.has(fid) || linkIds.has(sid)) {
        resultFieldName = f.InternalName || 'UNKNOWN';
        const ch = f.Choices?.results || f.Choices || [];
        resultSample = Array.isArray(ch)? ch.slice(0,3).join(', ') : String(ch).slice(0,60);
        break;
      }
    }
    // AdditionalActions: check FieldLinks for its Id
    let aaFieldName = 'UNKNOWN';
    let aaType = 'UNKNOWN';
    let aaMulti = 'UNKNOWN';
    let aaFill = 'UNKNOWN';
    let aaChoices = 'UNKNOWN';
    if (additionalField) {
      const aaId = norm(additionalField.Id||''); const aaSid = norm(additionalField.StringId||'');
      const hasAA = linkIds.has(aaId) || linkIds.has(aaSid);
      if (hasAA) {
        aaFieldName = additionalField.InternalName || 'AdditionalActions';
        aaType = additionalField.TypeAsString || additionalField.TypeDisplayName || 'Choice';
        aaMulti = String(!!additionalField.AllowMultipleValues || String(aaType).toLowerCase().includes('multichoice'));
        aaFill = String(!!additionalField.FillInChoice);
        const ch = additionalField.Choices?.results || additionalField.Choices || [];
        aaChoices = Array.isArray(ch)? ch.slice(0,3).join(', ') : String(ch).slice(0,60);
      } else {
        aaFieldName = '— (нет линка)';
      }
    }
    rows.push(`| ${name} | \`${ctId}\` | ${parent} | \`${resultFieldName}\` | \`${aaFieldName}\` | ${aaType} | ${aaMulti} | ${aaFill} | \`${resultSample}\` | UNKNOWN — проверить SPD workflow |`);
  }
  return rows;
}

function main() {
  const { rawDir } = parseArgs();
  console.log(`[audit] raw dir: ${rawDir}`);
  const blobs = readJsonFiles(rawDir);
  if (blobs.length===0) {
    console.log(`[audit] нет .json в ${rawDir}. Инструкция:`);
    console.log(`  1) Откройте tenant сайт SharePoint где список Tasks (GUID 463B634E-...)`);
    console.log(`  2) DevTools → Console → вставьте скрипт из docs/audit/content-types.md (версия 2026-09-22, 4 шага + AdditionalActions)`);
    console.log(`  3) Сохраните window._cts → ct-YYYY-MM-DD.json, window._resultFields → fields-*.json, window._aaField → additionalActions-*.json в ${rawDir}/`);
    console.log(`  4) Повторите node scripts/audit-contentTypes.js --raw ${rawDir}`);
    process.exit(0);
  }
  console.log(`[audit] найдено ${blobs.length} файлов: ${blobs.map(b=>b.file).join(', ')}`);
  const { cts, fields, additionalField } = detectCtAndFields(blobs);
  console.log(`[audit] cts=${cts.length} fields=${fields.length} AdditionalActions=${additionalField? additionalField.InternalName : '—'}`);
  const rows = buildTable(cts, fields, additionalField);
  console.log(`\n=== Таблица для вставки в docs/audit/content-types.md ===\n`);
  console.log(`| ContentType Name | ContentTypeId (full StringValue) | Parent CT | Result Field InternalName | AdditionalActions Field | FieldType | MultiValue | FillIn | Choices (sample) | Workflow usage |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|`);
  rows.forEach(r=> console.log(r));
  console.log(`\n=== Конец таблицы ===`);
  console.log(`[audit] Скопируйте строки выше в docs/audit/content-types.md → раздел Таблица, заменив UNKNOWN.`);
  // Попытка авто-обновить md если есть маркеры (не обязательно)
  const mdPath = 'docs/audit/content-types.md';
  if (fs.existsSync(mdPath) && cts.length>0 && fields.length>0) {
    try {
      let md = fs.readFileSync(mdPath, 'utf8');
      const tableHeader = `| ContentType Name | ContentTypeId`;
      const idx = md.indexOf(tableHeader);
      if (idx!==-1) {
        console.log(`[audit] найден маркер таблицы в ${mdPath} — ручное обновление рекомендуется (скрипт не перезаписывает notes).`);
      }
    } catch {}
  }
}

main();

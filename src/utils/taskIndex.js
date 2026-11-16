// src/utils/taskIndex.js
// Быстрый поиск задачи по elementId / THU.
//
// Вместо O(n) JSON.stringify + regex на каждом полле —
// один раз строим Map-индекс за O(n), затем O(1) lookup.
//
// Индекс содержит две карты (WorkflowItemId выпилен):
//   - byElementId:  Map<elementId, Task[]>   (может быть несколько задач на один ItemId)
//   - byThu:        Map<thu, Task>
// Несколько задач для одного elementId — норма: 396-старая и 403-новая.

const THU_RE = /^\d{17,18}$/;

function safeParse(s) {
  if (!s) return null;
  if (typeof s === "object") return s;
  try { return JSON.parse(s); } catch { return null; }
}

function extractRelatedElementIds(task) {
  const out = new Set();
  const ri = task.RelatedItems ?? task.raw?.RelatedItems ?? null;
  if (!ri) return out;
  const parsed = safeParse(ri);
  if (Array.isArray(parsed)) {
    for (const it of parsed) {
      const v = it?.ItemId ?? it?.itemId ?? it?.ItemID ?? it?.ID ?? it?.id;
      if (v != null) out.add(String(v));
    }
  } else if (parsed && typeof parsed === "object") {
    const v = parsed.ItemId ?? parsed.itemId;
    if (v != null) out.add(String(v));
  } else if (typeof ri === "string") {
    // Fallback: регуляркой по строке JSON
    const re = /"ItemId"\s*:\s*(\d+)/gi;
    let m;
    while ((m = re.exec(ri)) !== null) out.add(m[1]);
  }
  return out;
}

/**
 * Построить индекс по списку задач.
 * @param {Array} tasks
 * @returns {{ byElementId: Map<string, Task[]>, byThu: Map<string, Task>, all: Task[] }}
 */
export function buildTaskIndex(tasks) {
  const byElementId = new Map();
  const byThu = new Map();

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { byElementId, byThu, all: [] };
  }

  for (const t of tasks) {
    if (!t) continue;
    // 1) RelatedItems JSON — единственный источник (WorkflowItemId выпилен)

    const eids = extractRelatedElementIds(t);
    for (const id of eids) {
      let arr = byElementId.get(id);
      if (!arr) {
        arr = [];
        byElementId.set(id, arr);
      }
      arr.push(t);
    }
    // 3) THU (17-18 цифр) — извлекаем из Title/Body/ResultSearchTHU
    const thu = extractThuFromTask(t);
    if (thu && !byThu.has(thu)) byThu.set(thu, t);
  }

  return { byElementId, byThu, all: tasks };
}

function extractThuFromTask(task) {
  if (!task) return null;
  if (task.ResultSearchTHU && THU_RE.test(String(task.ResultSearchTHU).trim())) {
    return String(task.ResultSearchTHU).trim();
  }
  // Из Title/Body
  const fields = [task.Title, task.Body];
  for (const f of fields) {
    if (!f) continue;
    const m = String(f).match(/\d{17,18}/);
    if (m) return m[0];
  }
  return null;
}

/**
 * Найти задачу по elementId/THU через индекс.
 * Возвращает первую подходящую задачу или null.
 * @param {ReturnType<typeof buildTaskIndex>} index
 * @param {string} elementId
 */
export function findInIndex(index, elementId) {
  if (!index || !elementId) return null;
  const idStr = String(elementId).trim();
  if (!idStr) return null;

  // THU — ищем в byThu
  if (THU_RE.test(idStr)) {
    const t = index.byThu.get(idStr);
    if (t) return t;
    return null;
  }

  // WorkflowItemId выпилен — ищем только по RelatedItems/THU

  // RelatedItems.ItemId
  const arr = index.byElementId.get(idStr);
  if (arr && arr.length > 0) return arr[0];

  return null;
}

/**
 * Все задачи, связанные с elementId (для диалога "несколько задач").
 */
export function findAllInIndex(index, elementId) {
  if (!index || !elementId) return [];
  const idStr = String(elementId).trim();
  if (!idStr) return [];
  if (THU_RE.test(idStr)) {
    const t = index.byThu.get(idStr);
    return t ? [t] : [];
  }
  return index.byElementId.get(idStr) || [];
}
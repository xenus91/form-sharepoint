// src/tasks/relatedAttachments.js
//
// Сколько вложений у ЭЛЕМЕНТА, на который ссылается RelatedItems задачи.
//
// Зачем отдельный запрос: в полях самой задачи признака «у связанного элемента
// есть вложения» нет — AttachmentFiles лежат на элементе ProblemsPallet. Чтобы
// не дёргать SharePoint на каждую карточку, все Id видимой страницы собираются
// в один-два запроса с $expand=AttachmentFiles.
import apiClient from "../api";
import { parseRelatedRef } from "./relatedFields";

/** Список, в котором живут связанные элементы (см. tasks/problemsPallet.js). */
export const RELATED_LIST_TITLE = "ProblemsPallet";

/** Id на одну пачку: $filter растёт линейно, а длина URL у SharePoint ограничена. */
const CHUNK = 40;

const accept = { headers: { Accept: "application/json;odata=verbose" } };

/**
 * Id связанного элемента задачи (первый из RelatedItems) или null.
 * @param {any} task
 * @returns {number|null}
 */
export function relatedItemIdOf(task) {
  const ref = parseRelatedRef(task?.RelatedItems ?? task?.raw?.RelatedItems);
  return ref ? ref.itemId : null;
}

/**
 * Число вложений у каждого из переданных Id.
 *
 * Ошибку запроса не пробрасываем: если список или поле недоступны, скрепка
 * просто не появится, а карточки продолжат работать как раньше.
 *
 * @param {Array<number>} itemIds
 * @param {{listTitle?: string}} [opts]
 * @returns {Promise<Map<number, number>>}
 */
export async function fetchRelatedAttachmentCounts(itemIds, opts = {}) {
  const listTitle = opts.listTitle || RELATED_LIST_TITLE;
  const ids = [
    ...new Set((itemIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  const out = new Map();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const filter = part.map((id) => `Id eq ${id}`).join(" or ");
    const url = `/web/lists/getbytitle('${listTitle}')/items`
      + `?$select=Id&$expand=AttachmentFiles&$top=${part.length}&$filter=${filter}`;
    try {
      const { data } = await apiClient.get(url, accept);
      for (const row of data?.d?.results || []) {
        const files = row?.AttachmentFiles?.results;
        const id = Number(row?.Id);
        if (Number.isFinite(id)) out.set(id, Array.isArray(files) ? files.length : 0);
      }
    } catch (_e) {
      void _e;
    }
  }
  return out;
}

/**
 * Открывает связанный элемент внутри этой же страницы: ставит ?ID=<itemId>
 * в адрес, а RelatedItemOverlay рисует ItemViewer поверх текущего экрана
 * (см. src/RelatedItemOverlay.jsx). Прежние query-параметры сохраняются, hash не трогаем.
 *
 * @param {number} itemId
 * @returns {boolean} — удалось ли перейти
 */
export function openRelatedItem(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    const usp = new URLSearchParams(window.location.search || "");
    usp.set("ID", String(id));
    const next = `${window.location.pathname}?${usp.toString()}${window.location.hash || ""}`;
    window.history.pushState(null, "", next);
    // ItemViewer читает адрес при монтировании; событие нужно, чтобы уже
    // отрисованное приложение успело его подхватить.
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    return true;
  } catch (_e) {
    void _e;
    return false;
  }
}

/**
 * Id связанного элемента из адреса (?ID=…), либо null.
 * @returns {string|null}
 */
export function readRelatedId() {
  try {
    return new URLSearchParams(window.location.search || "").get("ID");
  } catch (_e) {
    void _e;
    return null;
  }
}

/**
 * Закрывает связанный элемент: убирает ?ID= из адреса, остальные query-параметры
 * и hash оставляет. Прежний адрес остаётся в истории, поэтому работает и кнопка
 * «назад» браузера.
 */
export function clearRelatedId() {
  try {
    const usp = new URLSearchParams(window.location.search || "");
    if (!usp.has("ID")) return;
    usp.delete("ID");
    const qs = usp.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
    window.history.pushState(null, "", next);
  } catch (_e) {
    void _e;
  }
}

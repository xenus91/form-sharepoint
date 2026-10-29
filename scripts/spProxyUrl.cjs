// scripts/spProxyUrl.cjs
//
// Утилиты прокси-сервера SharePoint (proxy-server.cjs). Вынесены отдельным
// модулем, чтобы покрывать их тестом.
//
// Зачем: помимо `_api`-запросов браузер ходит за КАРТИНКАМИ/файлами вложений по
// прямой серверной ссылке (`/sites/<site>/Lists/<list>/Attachments/<id>/<file>`).
// Такие ответы — бинарь, а не JSON; если запросить их как `_api` (с
// `Accept: application/json;odata=verbose`), картинка приезжает битой.
// Поэтому прямой файл определяется по расширению и качается в binary-режиме.

/**
 * Это запрос за бинарным содержимым (файл вложения/картинка)?
 * @param {string} url — уже собранный URL к SharePoint
 * @returns {boolean}
 */
function isBinaryRequest(url = "") {
  // 1. Явный REST-доступ к содержимому файла.
  if (/\/\$value(\?|#|$)/i.test(url) || /OpenBinaryStream/i.test(url)) return true;
  // 2. Путь `_api` — всегда JSON-метаданные (например,
  //    `.../items(1)/AttachmentFiles('a.png')` возвращает описание файла).
  if (/_api\//i.test(url)) return false;
  // 3. Прямая ссылка на файл: путь без `_api` и с расширением в конце
  //    (`/sites/obrazceo/Lists/List/Attachments/737/image_1.png?x=1`).
  return /\.[a-z0-9]{2,6}(\?|#|$)/i.test(url);
}

module.exports = { isBinaryRequest };

// proxy-server.cjs

const express = require("express");
const cors = require("cors");
const httpntlm = require("httpntlm");
const { raw } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(cors());

// ⛔️ Не используем json/urlencoded парсер глобально — оставляем сырой буфер
app.use("/api/*", raw({ type: "*/*", limit: "100mb" }));

// ──────────────────────────────────────────────────────────────────────────────
// Конфигурация
// ──────────────────────────────────────────────────────────────────────────────
const config = {
  username: process.env.VITE_SP_USERNAME,
  password: process.env.VITE_SP_PASSWORD,
  domain: process.env.VITE_SP_DOMAIN,
  workstation: process.env.VITE_SP_WORKSTATION || "",
};

const sharepointBaseUrl = process.env.VITE_SP_SITE + "/_api";

console.log("🚀 NTLM Proxy запущен");
console.log("🔹 SharePoint Base URL:", sharepointBaseUrl);
console.log("🔹 Пользователь NTLM:", config.username);
console.log("🔹 Домен NTLM:", config.domain);

// ──────────────────────────────────────────────────────────────────────────────
// Вспомогательные
// ──────────────────────────────────────────────────────────────────────────────
function ensureApiUrl(originalUrl = "") {
  // на входе: /api/..., на выходе: https://.../_api/...
  const fixed = sharepointBaseUrl + originalUrl.replace(/^\/api/, "");
  console.log(`🔹 Проксируем в: ${fixed}`);
  return fixed;
}

// Бинарные GET: файл контента (картинки/документы), а не JSON
function isBinaryRequest(url = "") {
  return /\/\$value(\?|$)/i.test(url) || /OpenBinaryStream/i.test(url);
}

// Нужен ли X-RequestDigest: для POST/MERGE/DELETE и т.п.
// (GET без тела — не требует)
function needsDigest(method, override) {
  if (method !== "GET") return true;
  if (override && override !== "" && override !== "GET") return true;
  return false;
}

// Получение FormDigest (X-RequestDigest) как Promise
function getRequestDigest() {
  const url = `${sharepointBaseUrl}/contextinfo`;
  return new Promise((resolve) => {
    httpntlm.post(
      {
        url,
        username: config.username,
        password: config.password,
        domain: config.domain,
        workstation: config.workstation,
        headers: { Accept: "application/json;odata=verbose" },
      },
      (err, response) => {
        if (err) {
          console.error("❌ Ошибка X-RequestDigest:", err);
          return resolve(null);
        }
        try {
          if (!response.body || !String(response.body).trim().startsWith("{")) {
            console.error("❌ Не JSON при получении X-RequestDigest");
            return resolve(null);
          }
          const data = JSON.parse(response.body);
          const digest = data.d.GetContextWebInformation.FormDigestValue;
          console.log("✅ X-RequestDigest получен");
          resolve(digest);
        } catch (e) {
          console.error("❌ Ошибка парсинга X-RequestDigest:", e);
          resolve(null);
        }
      }
    );
  });
}

function isAttachmentUpload(url = "") {
  // .../AttachmentFiles/add(FileName='...')
  return /\/AttachmentFiles\/add\(FileName=/i.test(url);
}

function getOverride(req) {
  const x = req.headers["x-http-method"];
  return typeof x === "string" && x.length > 0 ? x.toUpperCase() : "";
}

// ──────────────────────────────────────────────────────────────────────────────
// Основной прокси-маршрут
// ──────────────────────────────────────────────────────────────────────────────
app.use("/api/*", async (req, res) => {
  const spUrl = ensureApiUrl(req.originalUrl);
  const method = req.method.toUpperCase();
  const override = getOverride(req);

  console.log(`\n🔹 Входящий: ${method} ${req.originalUrl}`);
  console.log(`   X-HTTP-Method: ${override || "(нет)"}`);

  // Базовые заголовки к SP — по умолчанию ждём JSON
  const headers = {
    Accept: "application/json;odata=verbose",
  };

  // Протаскиваем важные заголовки «как есть», если заданы клиентом
  if (req.headers["if-match"]) headers["IF-MATCH"] = req.headers["if-match"];
  if (req.headers["x-http-method"]) headers["X-HTTP-Method"] = req.headers["x-http-method"];
  if (req.headers["odata-version"]) headers["OData-Version"] = req.headers["odata-version"];
  if (req.headers["odata-maxversion"]) headers["OData-MaxVersion"] = req.headers["odata-maxversion"];

  // Формируем опции запроса к SP
  const requestOptions = {
    url: spUrl,
    username: config.username,
    password: config.password,
    domain: config.domain,
    workstation: config.workstation,
    headers,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // GET (включая бинарные GET)
  // ────────────────────────────────────────────────────────────────────────────
  if (method === "GET") {
    const binary = isBinaryRequest(spUrl);

    if (binary) {
      // Бинарный ответ — не просим JSON, включаем binary-режим
      headers.Accept = "*/*";
      requestOptions.binary = true;
      console.log("🔹 GET (binary): $value/OpenBinaryStream");
    } else {
      console.log("🔹 GET (json): обычный _api запрос");
    }

    return httpntlm.get(requestOptions, (err, response) => {
      if (err) {
        console.error("❌ Ошибка GET к SP:", err);
        return res.status(500).json({ error: "Ошибка проксирования запроса" });
      }

      const { statusCode } = response;
      const ct =
        (response.headers && (response.headers["content-type"] || response.headers["Content-Type"])) ||
        "";
      const cl =
        (response.headers && (response.headers["content-length"] || response.headers["Content-Length"])) ||
        "";

      console.log(`✅ Ответ SP (${statusCode}) [CT: ${ct || "n/a"}]`);

      if (binary) {
        // Пробрасываем тело как бинарь
        if (ct) res.setHeader("Content-Type", ct);
        if (cl) res.setHeader("Content-Length", cl);
        return res.status(statusCode).end(response.body, "binary");
      }

      // JSON/текстовый ответ
      const body = response.body;
      if (ct.toLowerCase().includes("application/json")) {
        try {
          return res.status(statusCode).json(JSON.parse(body));
        } catch {
          // Бывает некорректный JSON — отдаём как текст с тем же content-type
          return res.status(statusCode).set("content-type", "application/json").send(body);
        }
      }

      // Любой другой тип — отдаём «как есть»
      return res.status(statusCode).send(body);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Остальные методы (POST с override для MERGE/DELETE и т.д.)
  // ────────────────────────────────────────────────────────────────────────────

  // Digest: если нужен — берём из клиента или запрашиваем сами
  if (needsDigest(method, override)) {
    const clientDigest = req.headers["x-requestdigest"];
    const digest = clientDigest || (await getRequestDigest());
    if (digest) headers["X-RequestDigest"] = digest;
  }

  let bodyToSend = null;

  if (isAttachmentUpload(spUrl)) {
    // Загрузка вложения: шлём сырые байты
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    headers["Content-Type"] = "application/octet-stream";
    headers["Content-Length"] = String(buf.length);
    requestOptions.binary = true; // важен для корректной передачи тела
    bodyToSend = buf;
    console.log(`🔹 Вложение: ${buf.length} байт, octet-stream`);
  } else if (override === "DELETE") {
    // DELETE override: пустое тело и без content-type
    headers["Content-Length"] = "0";
    if (headers["Content-Type"]) delete headers["Content-Type"];
    bodyToSend = "";
    console.log("🔹 DELETE override: пустое тело");
  } else {
    // Обычный JSON POST/MERGE (тело пришло как Buffer из raw-парсера)
    headers["Content-Type"] = "application/json;odata=verbose";
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString("utf8") || "";
      bodyToSend = str || "{}";
    } else if (typeof req.body === "string") {
      bodyToSend = req.body || "{}";
    } else if (req.body && typeof req.body === "object") {
      bodyToSend = JSON.stringify(req.body);
    } else {
      bodyToSend = "{}";
    }
    console.log(`🔹 JSON POST, длина: ${bodyToSend.length}`);
  }

  requestOptions.body = bodyToSend;

  httpntlm.post(requestOptions, (err, response) => {
    if (err) {
      console.error("❌ Ошибка POST к SP:", err);
      return res.status(500).json({ error: "Ошибка проксирования запроса" });
    }

    const { statusCode } = response;
    const ct =
      (response.headers && (response.headers["content-type"] || response.headers["Content-Type"])) ||
      "";
    const body = response.body;

    console.log(`✅ Ответ SP (${statusCode}) [CT: ${ct || "n/a"}]`);

    if (ct.toLowerCase().includes("application/json")) {
      try {
        return res.status(statusCode).json(JSON.parse(body));
      } catch {
        return res.status(statusCode).set("content-type", "application/json").send(body);
      }
    }

    // На случай не-JSON ответа от _api — просто пробрасываем
    return res.status(statusCode).send(body);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 NTLM Proxy работает на http://localhost:${PORT}`);
});

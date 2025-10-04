// proxy-server.cjs (или ваш файл прокси)

const express = require("express");
const cors = require("cors");
const httpntlm = require("httpntlm");
const { raw } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(cors());

// ⛔️ Не используем глобальный bodyParser.json(), чтобы не ломать бинарь
// app.use(bodyParser.json());

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
const ensureApiUrl = (originalUrl) => {
  // на входе /api/..., нужно получить https://.../_api/...
  const fixed = sharepointBaseUrl + originalUrl.replace(/^\/api/, "");
  console.log(`🔹 Проксируем в: ${fixed}`);
  return fixed;
};

const isJsonContentType = (v = "") =>
  typeof v === "string" && v.toLowerCase().includes("application/json");

const isAttachmentUpload = (url = "") =>
  /\/AttachmentFiles\/add\(FileName=/.test(url);

const isHttpMethodOverride = (req) => {
  const x = req.headers["x-http-method"];
  return typeof x === "string" && x.length > 0 ? x.toUpperCase() : "";
};

// Обёртка для получения digest (Promise)
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
          if (!response.body || !response.body.trim().startsWith("{")) {
            console.error("❌ Не JSON при получении X-RequestDigest:", response.body);
            return resolve(null);
          }
          const data = JSON.parse(response.body);
          const digest = data.d.GetContextWebInformation.FormDigestValue;
          console.log("✅ X-RequestDigest:", digest);
          resolve(digest);
        } catch (e) {
          console.error("❌ Ошибка парсинга X-RequestDigest:", e);
          resolve(null);
        }
      }
    );
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Основной роут прокси: сырой парсер для всех типов
// ──────────────────────────────────────────────────────────────────────────────
app.use(
  "/api/*",
  raw({ type: "*/*", limit: "100mb" }),
  async (req, res) => {
    const spUrl = ensureApiUrl(req.originalUrl);
    const method = req.method.toUpperCase();
    const override = isHttpMethodOverride(req);

    console.log(`\n🔹 Входящий: ${method} ${req.originalUrl}`);
    console.log(`   X-HTTP-Method: ${override || "(нет)"}`);

    // Базовые заголовки к SP
    const headers = {
      Accept: "application/json;odata=verbose",
    };

    // Протаскиваем важные заголовки как есть, если они есть у клиента
    // (полезно для IF-MATCH, MERGE/DELETE и т.д.)
    if (req.headers["if-match"]) headers["IF-MATCH"] = req.headers["if-match"];
    if (req.headers["x-http-method"])
      headers["X-HTTP-Method"] = req.headers["x-http-method"];
    if (req.headers["odata-version"])
      headers["OData-Version"] = req.headers["odata-version"];
    if (req.headers["odata-maxversion"])
      headers["OData-MaxVersion"] = req.headers["odata-maxversion"];

    // Digest: возьмём из клиента, если он уже есть, иначе запросим сами
    let digest =
      req.headers["x-requestdigest"] ||
      (await getRequestDigest());
    if (digest) headers["X-RequestDigest"] = digest;

    // Формируем опции для httpntlm
    const requestOptions = {
      url: spUrl,
      username: config.username,
      password: config.password,
      domain: config.domain,
      workstation: config.workstation,
      headers,
      // В некоторых сценариях (вложения) важно бинарное тело
      // Но ставить binary=true будем точечно
    };

    // ── GET пробрасываем как есть
    if (method === "GET") {
      console.log("🔹 Прокси: GET → SharePoint");
      return httpntlm.get(requestOptions, (err, response) => {
        if (err) {
          console.error("❌ Ошибка GET к SP:", err);
          return res.status(500).json({ error: "Ошибка проксирования запроса" });
        }
        const { statusCode } = response;
        const body = response.body;
        const ct = response.headers["content-type"] || "";
        console.log(`✅ Ответ SP (${statusCode})`);
        if (ct.includes("application/json")) {
          try {
            return res
              .status(statusCode)
              .json(JSON.parse(body));
          } catch {
            return res
              .status(statusCode)
              .set("content-type", "application/json")
              .send(body);
          }
        }
        // На всякий — просто отдаём как есть
        return res.status(statusCode).send(body);
      });
    }

    // ── Все остальные методы в SP обычно идут POST-ом
    // Особые случаи: вложения / MERGE / DELETE
    let bodyToSend = null;

    if (isAttachmentUpload(spUrl)) {
      // Загрузка ВЛОЖЕНИЙ: сырые байты как есть
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Length"] = String(buf.length);
      requestOptions.binary = true;
      bodyToSend = buf;
      console.log(`🔹 Вложение: ${buf.length} байт, octet-stream`);
    } else if (override === "DELETE") {
      // DELETE (POST + X-HTTP-Method: DELETE) — пустое тело
      headers["Content-Length"] = "0";
      // Лучше без Content-Type вовсе
      if (headers["Content-Type"]) delete headers["Content-Type"];
      bodyToSend = "";
      console.log("🔹 DELETE override: пустое тело");
    } else {
      // Обычный JSON-запрос (создание/обновление/merge без бинарей)
      const ctIn = req.headers["content-type"] || "";
      headers["Content-Type"] = "application/json;odata=verbose";

      if (Buffer.isBuffer(req.body)) {
        // Клиент мог прислать JSON как Buffer (из-за raw парсера) — парсим
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
      const body = response.body;
      const ct = response.headers["content-type"] || "";

      console.log(`✅ Ответ SP (${statusCode})`);

      if (ct.includes("application/json")) {
        try {
          return res.status(statusCode).json(JSON.parse(body));
        } catch {
          return res
            .status(statusCode)
            .set("content-type", "application/json")
            .send(body);
        }
      }

      // На случай не-JSON ответа (обычно не бывает на _api)
      return res.status(statusCode).send(body);
    });
  }
);

// ──────────────────────────────────────────────────────────────────────────────
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 NTLM Proxy работает на http://localhost:${PORT}`);
});

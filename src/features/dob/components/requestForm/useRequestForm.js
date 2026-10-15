// src/features/dob/components/requestForm/useRequestForm.js
// Состояние формы создания заявки: выбранный тип контента → обязательные поля
// этого типа → значения → валидация → запись в список (createDobItem).
//
// Требования 2026-10-13:
//   • форма показывает ТОЛЬКО обязательные поля типа контента;
//   • Title не показываем — генерируем общим правилом (requestTitle.js);
//   • Status не показываем и не отправляем — проставит дефолт колонки;
//   • rich-поля с картинками пишем двухфазно: createDobItem → вложения → MERGE.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createDobItem, updateDobItem, uploadDobAttachment, getDobContentTypeFields,
} from "../../api/dobApi";
import { DOB_LIST_GUID } from "../../api/dobClient";
import { validateRequiredFields, plainText } from "../../../../tasks/contentTypeFields";
import { buildRequestFormControls } from "../../lib/requestFormFields";
import { fieldsWithBase64, materializeRichValues } from "../../lib/materializeRichImages";
import { dataUrlSrcs } from "../../lib/richImages";
import { useDobContentTypes } from "../../hooks/useDobContentTypes";
import { toCreatePayload } from "./toCreatePayload";
import { buildPrefillValues } from "./requestDefaults";
import { buildRequestTitle } from "./requestTitle";
import {
  buildOffDepKey, ensureDcEmailLink, findDcEmailItem, groupTitlesFromItem,
} from "../../lib/dcEmailApi";

/** Значения профиля, которые считаем «не задано» (см. App.jsx/requestDefaults). */
const PROFILE_NOT_SET = new Set(["", "не указано", "not specified", "null", "undefined"]);

/** Офис/департамент профиля для ключа DcEmail: «Не указано» → пусто. */
function profileOfficeDepartment(profile) {
  const clean = (value) => {
    const text = String(value ?? "").trim();
    return PROFILE_NOT_SET.has(text.toLowerCase()) ? "" : text;
  };
  return {
    office: clean(profile?.userOffice ?? profile?.Office),
    department: clean(profile?.userDepartment ?? profile?.Department),
  };
}

/** Системный тип контента «Папка» (Id начинается с 0x0120). */
export function isFolderContentType(ct) {
  if (/^0x0120/i.test(String(ct?.StringId || ct?.Id || ""))) return true;
  return /^(?:folder|папка)$/i.test(String(ct?.Name || "").trim());
}

/** В rich-значении есть картинка base64 (`data:image/…`), ещё не вложение. */
function hasInlineImage(value) {
  return typeof value === "string" && dataUrlSrcs(value).length > 0;
}

/** Тип контента по id — для названия в заголовке заявки. */
function contentTypeOf(ctId, contentTypes) {
  const id = String(ctId || "").toLowerCase();
  return (contentTypes || []).find((ct) => String(ct?.StringId || ct?.Id || "").toLowerCase() === id) || null;
}

/**
 * @param {{listGuid?:string, userProfile?:{userOffice?:string,userDepartment?:string}}} [opts]
 *   userProfile — профиль текущего пользователя: из него берутся значения по
 *   умолчанию (DC ← Office, InitiatingDepartment ← Department).
 */
export function useRequestForm({ listGuid = DOB_LIST_GUID, userProfile = null } = {}) {
  const [ctId, setCtId] = useState("");
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [invalidNames, setInvalidNames] = useState([]);
  const [created, setCreated] = useState(null);
  // Названия рассылок, на которые уйдёт уведомление о решении заявки.
  // Ref, а не state: значение нужно вызывающему коду в том же тике, что и
  // результат submit() (state к этому моменту ещё не обновился бы).
  const mailingRef = useRef([]);

  /** Названия рассылок элемента DcEmail — молча не ломаем создание заявки. */
  const readMailingTitles = useCallback(async (item, fallback = []) => {
    try {
      const titles = await groupTitlesFromItem(item);
      if (titles.length) return titles;
    } catch (e) {
      console.warn("[useRequestForm] не удалось прочитать рассылку DcEmail", e?.message);
    }
    return fallback.filter(Boolean);
  }, []);

  // Гейт DcEmail: если для Office+Department нет элемента в списке DcEmail —
  // перед созданием заявки просим пользователя указать рассылку.
  const [needsDcEmail, setNeedsDcEmail] = useState(false);
  const [dcEmailSaving, setDcEmailSaving] = useState(false);
  const [dcEmailError, setDcEmailError] = useState("");
  const { office: profileOffice, department: profileDepartment } = useMemo(
    () => profileOfficeDepartment(userProfile),
    [userProfile],
  );

  // Типы контента списка заявок: из них строится выбор и выбирается тип по умолчанию.
  const { contentTypes, isLoading: loadingTypes, error: typesError } = useDobContentTypes(listGuid);

  // Тип по умолчанию — первый подходящий: форма должна открываться уже с типом.
  // Системную «Папку» (0x0120…) пропускаем: заявкой она быть не может.
  const defaultCtId = useMemo(() => {
    const first = (contentTypes || []).find((ct) => !isFolderContentType(ct));
    return first ? String(first.StringId || first.Id || "") : "";
  }, [contentTypes]);

  // Поля выбранного типа контента — состав формы.
  const fieldsQ = useQuery({
    queryKey: ["dob", "request-form", String(listGuid || "").toLowerCase(), ctId],
    queryFn: () => getDobContentTypeFields(ctId, listGuid),
    enabled: !!ctId,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Состав формы — ТОЛЬКО обязательные поля типа контента (FieldLinks), без
  // служебных (Title/Status/OutcomeChoice отсеиваются в buildRequestFormControls).
  const controls = useMemo(
    () => buildRequestFormControls(fieldsQ.data || []).filter((c) => c.required === true),
    [fieldsQ.data],
  );

  const selectContentType = useCallback((nextId) => {
    setCtId(String(nextId || ""));
    setValues({});
    setProblems([]);
    setInvalidNames([]);
    setError("");
    setCreated(null);
  }, []);

  // Тип по умолчанию: как только список типов загружен и тип не выбран —
  // выбираем первый, чтобы форма открывалась сразу с полями.
  useEffect(() => {
    if (!ctId && defaultCtId) selectContentType(defaultCtId);
  }, [ctId, defaultCtId, selectContentType]);

  // Значения по умолчанию подставляем один раз на каждый выбранный тип:
  // DC ← Office, InitiatingDepartment ← Department (см. requestDefaults).
  const prefilledForCt = useRef("");
  useEffect(() => {
    if (!ctId || !controls.length || prefilledForCt.current === ctId) return;
    prefilledForCt.current = ctId;
    const defaults = buildPrefillValues(controls, userProfile);
    if (!Object.keys(defaults).length) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [name, value] of Object.entries(defaults)) {
        const current = next[name];
        const empty = current === undefined || current === null || current === ""
          || (Array.isArray(current) && current.length === 0);
        if (empty) next[name] = value;
      }
      return next;
    });
  }, [ctId, controls, userProfile]);

  const setValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Непосредственное создание заявки в Requests (второй шаг после DcEmail).
  const createRequest = useCallback(async () => {
    const richControls = controls.filter((c) => c.kind === "richtext");
    const withImages = richControls.filter((c) => hasInlineImage(values[c.internalName]));
    // Фаза 2 нужна, когда есть картинки ИЛИ обязательное rich-поле осталось бы
    // пустым (текста нет, только картинки): его надо дозаполнить.
    const needsSecondPhase = withImages.length > 0
      || richControls.some((c) => !plainText(values[c.internalName]));

    setSaving(true);
    setError("");
    let itemId = null;
    try {
      const payload = toCreatePayload(controls, values);
      if (needsSecondPhase) {
        // Картинки (base64) в фазе 1 отправлять нельзя: в SharePoint должна
        // уходить ссылка на вложение, поэтому rich-значение чистим от inline-
        // картинок, оставляя текст. Пустое значение (текста нет) заменяем
        // плейсхолдером — обязательное поле иначе отклонится; в фазе 2
        // запишем готовый HTML со ссылками на вложения.
        for (const c of richControls) {
          const stripped = String(payload[c.internalName] ?? "").replace(/<img\b[^>]*>/gi, "").trim();
          payload[c.internalName] = plainText(stripped) ? stripped : "<p>&nbsp;</p>";
        }
      }
      // Заголовок генерируем сами (Title в форме нет). Status не отправляем.
      const body = {
        ...payload,
        Title: buildRequestTitle({ contentType: contentTypeOf(ctId, contentTypes) }),
        ContentTypeId: ctId,
      };
      const item = await createDobItem(body, listGuid);
      itemId = item?.Id ?? item?.ID ?? null;
      setCreated(itemId);

      if (needsSecondPhase) {
        setIsUploading(true);
        const materialized = await materializeRichValues(values, {
          upload: (file) => uploadDobAttachment(itemId, file, listGuid),
        });
        // Если картинку загрузить не удалось, в значении останется base64 —
        // сохранять такое нельзя (в SharePoint уходит ссылка на вложение).
        const leftBase64 = fieldsWithBase64(materialized);
        if (leftBase64.length) throw new Error("Не удалось загрузить изображение — повторите создание");
        const richPayload = toCreatePayload(richControls, materialized);
        await updateDobItem(itemId, richPayload, listGuid);
      }
      return item;
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || String(e);
      // Заявка уже создана, но картинки не догрузились: не теряем элемент,
      // сообщаем — его можно открыть и дозаполнить.
      if (itemId != null && needsSecondPhase) {
        setError(`Заявка #${itemId} создана, но изображения не загрузились: ${String(msg).slice(0, 400)}`);
      } else {
        setError(String(msg).slice(0, 600));
      }
      return null;
    } finally {
      setIsUploading(false);
      setSaving(false);
    }
  }, [ctId, controls, values, listGuid, contentTypes]);

  /**
   * «Создать»: сначала проверяем связку DcEmail (Office+Department). Если её
   * нет — открываем диалог выбора рассылки и НЕ создаём заявку; пользователь
   * подтвердит — см. saveDcEmailAndCreate. Если связка есть (или профиль не
   * задан) — создаём заявку сразу.
   */
  const submit = useCallback(async () => {
    if (!ctId) {
      setProblems(["Выберите тип заявки"]);
      return null;
    }
    // Картинка в rich-поле — тоже содержимое. Общий валидатор снимает теги, и
    // поле с одной картинкой (без текста) он счёл бы пустым, поэтому для проверки
    // подставляем текстовый маркер — иначе обязательное rich-поле с картинкой
    // нельзя было бы отправить.
    const forValidation = { ...values };
    for (const c of controls) {
      if (c.kind === "richtext" && hasInlineImage(forValidation[c.internalName])) {
        forValidation[c.internalName] = `${forValidation[c.internalName]} изображение`;
      }
    }
    const found = validateRequiredFields(controls, forValidation);
    setProblems(found);
    setInvalidNames(controls
      .filter((c) => c.required && found.some((p) => p.includes(c.title)))
      .map((c) => c.internalName));
    if (found.length) return null;

    // Гейт DcEmail (только если известны Office и Department профиля).
    if (profileOffice && profileDepartment) {
      try {
        const existing = await findDcEmailItem(profileOffice, profileDepartment);
        if (!existing) {
          setDcEmailError("");
          setNeedsDcEmail(true);
          return null;
        }
        // Рассылка найдена — её название попадёт в Snackbar после создания.
        mailingRef.current = await readMailingTitles(existing);
      } catch (e) {
        // Не смогли проверить (нет доступа и т.п.) — не блокируем создание.
        console.warn("[useRequestForm] проверка DcEmail не удалась", e?.message);
      }
    }
    return createRequest();
  }, [ctId, controls, values, profileOffice, profileDepartment, createRequest, readMailingTitles]);

  /** Диалог DcEmail: создаём элемент DcEmail, затем — заявку (именно в этом порядке). */
  const saveDcEmailAndCreate = useCallback(async (groups) => {
    setDcEmailSaving(true);
    setDcEmailError("");
    try {
      const link = await ensureDcEmailLink({ office: profileOffice, department: profileDepartment, groups });
      // Рассылку только что создали — берём её название из выбранного и из элемента.
      mailingRef.current = await readMailingTitles(link?.item, groups.map((g) => g?.Title));
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || String(e);
      setDcEmailError(String(msg).slice(0, 400));
      setDcEmailSaving(false);
      return null;
    }
    setDcEmailSaving(false);
    setNeedsDcEmail(false);
    return createRequest();
  }, [profileOffice, profileDepartment, createRequest, readMailingTitles]);

  const cancelDcEmail = useCallback(() => {
    setNeedsDcEmail(false);
    setDcEmailError("");
  }, []);

  return {
    contentTypes,
    loadingTypes: !!loadingTypes,
    typesError: typesError ? String(typesError?.message || "Не удалось загрузить типы контента") : "",
    defaultCtId,
    ctId,
    selectContentType,
    controls,
    values,
    setValue,
    problems,
    invalidNames,
    loadingFields: !!ctId && fieldsQ.isFetching,
    fieldsError: fieldsQ.isError ? String(fieldsQ.error?.message || "Не удалось загрузить поля типа") : "",
    saving,
    isUploading,
    error,
    created,
    submit,
    // Гейт DcEmail
    needsDcEmail,
    dcEmailSaving,
    dcEmailError,
    dcEmailOffice: profileOffice,
    dcEmailDepartment: profileDepartment,
    dcEmailKey: buildOffDepKey(profileOffice, profileDepartment),
    // Названия рассылок для Snackbar (см. mailingRef).
    mailingRef,
    saveDcEmailAndCreate,
    cancelDcEmail,
  };
}

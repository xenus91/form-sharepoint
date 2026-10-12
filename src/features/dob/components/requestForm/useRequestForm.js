// src/features/dob/components/requestForm/useRequestForm.js
// Состояние формы создания заявки: выбранный тип контента → поля этого типа →
// значения → валидация → запись в список (createDobItem).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createDobItem, getDobContentTypeFields } from "../../api/dobApi";
import { DOB_LIST_GUID } from "../../api/dobClient";
import { validateRequiredFields } from "../../../../tasks/contentTypeFields";
import { buildRequestFormControls } from "../../lib/requestFormFields";
import { useDobContentTypes } from "../../hooks/useDobContentTypes";
import { toCreatePayload } from "./toCreatePayload";
import { buildPrefillValues } from "./requestDefaults";

/** Системный тип контента «Папка» (Id начинается с 0x0120). */
export function isFolderContentType(ct) {
  if (/^0x0120/i.test(String(ct?.StringId || ct?.Id || ""))) return true;
  return /^(?:folder|папка)$/i.test(String(ct?.Name || "").trim());
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
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [invalidNames, setInvalidNames] = useState([]);
  const [created, setCreated] = useState(null);

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

  // Состав формы — поля выбранного типа контента (FieldLinks), без служебных.
  const controls = useMemo(() => buildRequestFormControls(fieldsQ.data || []), [fieldsQ.data]);

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

  const submit = useCallback(async () => {
    if (!ctId) {
      setProblems(["Выберите тип заявки"]);
      return null;
    }
    const found = validateRequiredFields(controls, values);
    setProblems(found);
    setInvalidNames(controls
      .filter((c) => c.required && found.some((p) => p.includes(c.title)))
      .map((c) => c.internalName));
    if (found.length) return null;

    setSaving(true);
    setError("");
    try {
      const payload = toCreatePayload(controls, values);
      // Тип контента нового элемента — выбранный в форме.
      const body = { ...payload, ContentTypeId: ctId };
      const item = await createDobItem(body, listGuid);
      setCreated(item?.Id ?? item?.ID ?? null);
      return item;
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || String(e);
      setError(String(msg).slice(0, 600));
      return null;
    } finally {
      setSaving(false);
    }
  }, [ctId, controls, values, listGuid]);

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
    error,
    created,
    submit,
  };
}

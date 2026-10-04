// src/features/tasks/components/PersonFieldAutocomplete.jsx
// Поле «Пользователь или группа» с автокомплитом по УЧЁТНОЙ ЗАПИСИ:
//   • поиск людей через API SharePoint (siteusers) + нормализация `_` → `.`;
//   • многократный выбор (Chip'ы), если колонка это разрешает;
//   • у выбранного пользователя показываем ИМЯ и ДОЛЖНОСТЬ (SPS-JobTitle).
//
// Значение поля — массив объектов { Id, Title, LoginName, Email }: в payload
// SharePoint уходит как <Field>Id (Collection(Edm.Int32)) — см. useTaskMutations.

/* eslint-disable react/prop-types */
import React from "react";
import { Autocomplete, Box, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import {
  getUserPositions,
  personDisplayName,
  searchSiteUsers,
} from "../../../tasks/userSearch";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

function userKey(user) {
  return user?.Id != null ? String(user.Id) : String(user?.LoginName || "");
}

export default function PersonFieldAutocomplete({
  label,
  value,
  onChange,
  multiple = true,
  required = false,
  disabled = false,
  error = false,
  helperText = "",
}) {
  const selected = React.useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : [])),
    [value],
  );
  const [options, setOptions] = React.useState([]);
  const [inputValue, setInputValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [positions, setPositions] = React.useState({});

  // Поиск с дебаунсом. В запрос уходит и исходный вариант, и «точечный» (`_` → `.`).
  React.useEffect(() => {
    const query = String(inputValue || "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchSiteUsers(query, { limit: 20 });
        if (!cancelled) setOptions(found);
      } catch (_e) {
        void _e;
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [inputValue]);

  // Должности для подсказок и для уже выбранных пользователей.
  React.useEffect(() => {
    const list = [...selected, ...options];
    if (list.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const map = await getUserPositions(list);
        if (!cancelled && Object.keys(map).length > 0) {
          setPositions((prev) => ({ ...prev, ...map }));
        }
      } catch (_e) { void _e; }
    })();
    return () => { cancelled = true; };
  }, [selected, options]);

  const positionOf = (user) => positions[String(user?.LoginName || "").trim().toLowerCase()] || null;

  return (
    <Autocomplete
      multiple={multiple}
      disableCloseOnSelect={multiple}
      filterSelectedOptions
      disabled={disabled}
      value={multiple ? selected : (selected[0] || null)}
      inputValue={inputValue}
      onInputChange={(_e, next, reason) => {
        if (reason === "reset") return;
        setInputValue(next);
      }}
      options={options}
      loading={loading}
      // поиск серверный: не фильтруем найденных по введённой строке (учётная запись ≠ ФИО)
      filterOptions={(list) => list}
      getOptionLabel={(user) => personDisplayName(user) || ""}
      isOptionEqualToValue={(a, b) => userKey(a) === userKey(b)}
      noOptionsText={String(inputValue || "").trim().length < MIN_QUERY_LENGTH
        ? "Введите минимум 2 символа учётной записи или фамилии"
        : "Никого не найдено"}
      onChange={(_e, next) => {
        const list = Array.isArray(next) ? next.filter(Boolean) : (next ? [next] : []);
        const unique = [];
        const seen = new Set();
        for (const u of list) {
          const key = userKey(u);
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(u);
        }
        onChange?.(multiple ? unique : (unique[0] || null));
      }}
      renderOption={(props, user) => {
        const pos = positionOf(user);
        return (
          <Box component="li" {...props} key={userKey(user)}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                {personDisplayName(user)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
                {pos || user.LoginName}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderTags={(items, getItemProps) => (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.25 }}>
          {items.map((user, index) => {
            const pos = positionOf(user);
            const chipProps = getItemProps({ index });
            return (
              <Chip
                {...chipProps}
                key={userKey(user)}
                size="small"
                label={(
                  <Box sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.5, maxWidth: 320 }}>
                    <Box component="span" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{personDisplayName(user)}</Box>
                    {pos && (
                      <Box component="span" sx={{ color: "text.secondary", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pos}
                      </Box>
                    )}
                  </Box>
                )}
                sx={{ borderRadius: "8px", height: 28 }}
              />
            );
          })}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={`${label}${required ? " *" : ""}`}
          placeholder={selected.length === 0 ? "Учётная запись, ФИО или e-mail" : ""}
          error={error}
          helperText={helperText}
          size="small"
          fullWidth
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

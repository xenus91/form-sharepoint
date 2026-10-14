/* eslint-disable react/prop-types */
// src/features/tasks/components/GroupFieldAutocomplete.jsx
// Поле выбора ГРУПП SharePoint (только группы, многократный выбор).
// Используется для указания рассылки при создании заявки ДОБ.
//
// Значение — массив объектов { Id, Title, LoginName }. Поиск — searchSiteGroups
// (источник /web/sitegroups); ввод можно подменить через prop `search` (тесты).

import React from "react";
import { Autocomplete, Chip, CircularProgress, TextField } from "@mui/material";
import { searchSiteGroups } from "../lib/groupSearch";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

function groupKey(group) {
  return group?.Id != null ? String(group.Id) : String(group?.LoginName || group?.Title || "");
}

export default function GroupFieldAutocomplete({
  label,
  value = [],
  onChange,
  multiple = true,
  required = false,
  disabled = false,
  error = false,
  helperText = "",
  placeholder = "Название группы",
  search = searchSiteGroups,
}) {
  const selected = React.useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : [])),
    [value],
  );
  const [options, setOptions] = React.useState([]);
  const [inputValue, setInputValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);

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
        const found = await search(query, { limit: 20 });
        if (!cancelled) setOptions(found);
      } catch (_e) {
        void _e;
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [inputValue, search]);

  return (
    <Autocomplete
      multiple={multiple}
      disableCloseOnSelect
      filterSelectedOptions
      disabled={disabled}
      options={options}
      value={multiple ? selected : (selected[0] || null)}
      loading={loading}
      getOptionLabel={(g) => String(g?.Title || g?.LoginName || "")}
      isOptionEqualToValue={(a, b) => groupKey(a) === groupKey(b)}
      onChange={(_e, next) => {
        const list = Array.isArray(next) ? next : (next ? [next] : []);
        onChange?.(list);
      }}
      onInputChange={(_e, next, reason) => {
        if (reason !== "reset") setInputValue(next);
      }}
      renderTags={(list, getTagProps) => list.map((g, i) => (
        <Chip
          {...getTagProps({ index: i })}
          key={groupKey(g)}
          size="small"
          label={String(g?.Title || g?.LoginName || "")}
        />
      ))}
      renderInput={(params) => (
        <TextField
          {...params}
          label={`${label}${required ? " *" : ""}`}
          placeholder={selected.length === 0 ? placeholder : ""}
          error={error}
          helperText={helperText}
          size="small"
          fullWidth
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

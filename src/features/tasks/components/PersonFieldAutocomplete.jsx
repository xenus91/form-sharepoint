// src/features/tasks/components/PersonFieldAutocomplete.jsx
// Поле «Пользователь или группа» с автокомплитом по УЧЁТНОЙ ЗАПИСИ:
//   • поиск людей через API SharePoint (siteusers) + нормализация `_` → `.`;
//   • многократный выбор (Chip'ы), если колонка это разрешает;
//   • у человека показываем ИМЯ, ДОЛЖНОСТЬ, ДЕПАРТАМЕНТ и ОФИС — в подсказке,
//     в чипе и в раскрывающихся свойствах (клик по выбранному чипу).
//
// Значение поля — массив объектов { Id, Title, LoginName, Email }: в payload
// SharePoint уходит как <Field>Id (Collection(Edm.Int32)) — см. useTaskMutations.

/* eslint-disable react/prop-types */
import React from "react";
import { Autocomplete, Box, Chip, CircularProgress, Popover, Stack, TextField, Typography } from "@mui/material";
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

/** Сведения о человеке из карты getUserPositions: строка (старый формат) или объект. */
function detailsOf(positions, user) {
  const key = String(user?.LoginName || "").trim().toLowerCase();
  const hit = positions[key];
  if (!hit) return null;
  if (typeof hit === "string") return { label: hit, position: hit, department: "", office: "" };
  return hit;
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
  // Раскрытые свойства выбранного человека: клик по чипу показывает то, что
  // подтянули (должность/департамент/офис/учётная запись).
  const [detailsAnchor, setDetailsAnchor] = React.useState(null);
  const [detailsUser, setDetailsUser] = React.useState(null);

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

  // Сведения (должность/департамент/офис) для подсказок и для уже выбранных.
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

  // Клик по чипу: свойства открываются, повторный клик — закрываются.
  // Popover закрывается и сам (клик «снаружи»), поэтому помним, кого и когда
  // закрыли, — иначе клик по тому же чипу тут же открывал бы свойства снова.
  const lastClosedRef = React.useRef({ key: '', at: 0 });
  const openKeyRef = React.useRef('');

  const openDetails = (event, user) => {
    event.stopPropagation();
    const key = userKey(user);
    const justClosed = lastClosedRef.current.key === key
      && Date.now() - lastClosedRef.current.at < 400;
    if (openKeyRef.current === key || justClosed) {
      openKeyRef.current = '';
      lastClosedRef.current = { key, at: Date.now() };
      setDetailsAnchor(null);
      setDetailsUser(null);
      return;
    }
    openKeyRef.current = key;
    lastClosedRef.current = { key: '', at: 0 };
    setDetailsAnchor(event.currentTarget);
    setDetailsUser(user);
  };

  const closeDetails = () => {
    const key = openKeyRef.current;
    if (key) lastClosedRef.current = { key, at: Date.now() };
    openKeyRef.current = '';
    setDetailsAnchor(null);
    setDetailsUser(null);
  };

  const detailRows = React.useMemo(() => {
    if (!detailsUser) return [];
    const info = detailsOf(positions, detailsUser) || {};
    return [
      { key: "position", label: "Должность", value: info.position || "" },
      { key: "department", label: "Департамент", value: info.department || "" },
      { key: "office", label: "Офис", value: info.office || "" },
      { key: "login", label: "Учётная запись", value: detailsUser.LoginName || "" },
    ].filter((row) => row.value);
  }, [detailsUser, positions]);

  return (
    <>
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
          const info = detailsOf(positions, user) || {};
          return (
            <Box component="li" {...props} key={userKey(user)}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                  {personDisplayName(user)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
                  {[info.position, info.department, info.office].filter(Boolean).join(" · ") || user.LoginName}
                </Typography>
              </Box>
            </Box>
          );
        }}
        renderTags={(items, getItemProps) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.25 }}>
            {items.map((user, index) => {
              const info = detailsOf(positions, user) || {};
              const chipProps = getItemProps({ index });
              const isOpen = Boolean(detailsUser && userKey(detailsUser) === userKey(user));
              return (
                <Chip
                  {...chipProps}
                  key={userKey(user)}
                  size="small"
                  data-testid={`person-chip-${userKey(user)}`}
                  onClick={(event) => {
                    // Клик по «крестику» удаляет значение, свойства не открываем.
                    if (event.target?.closest?.(".MuiChip-deleteIcon")) {
                      chipProps.onClick?.(event);
                      return;
                    }
                    chipProps.onClick?.(event);
                    openDetails(event, user);
                  }}
                  label={(
                    <Box sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.5, maxWidth: 320 }}>
                      <Box component="span" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{personDisplayName(user)}</Box>
                      {info.label && (
                        <Box component="span" sx={{ color: "text.secondary", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {info.label}
                        </Box>
                      )}
                    </Box>
                  )}
                  sx={{
                    borderRadius: 0.5,
                    height: 28,
                    cursor: "pointer",
                    ...(isOpen ? { borderColor: "#171c8f", bgcolor: "rgba(23,28,143,.06)" } : {}),
                  }}
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
      <Popover
        open={Boolean(detailsAnchor)}
        anchorEl={detailsAnchor}
        onClose={closeDetails}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        data-testid="person-details"
      >
        <Box sx={{ p: 1.25, minWidth: 260, maxWidth: 360 }} data-testid="person-details-body">
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#171c8f", mb: 0.5 }}>
            {personDisplayName(detailsUser)}
          </Typography>
          <Stack spacing={0.5}>
            {detailRows.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                Должность, департамент и офис не заполнены в профиле.
              </Typography>
            )}
            {detailRows.map((row) => (
              <Box key={row.key} sx={{ display: "flex", gap: 0.75, alignItems: "baseline" }}>
                <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 92 }}>
                  {row.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

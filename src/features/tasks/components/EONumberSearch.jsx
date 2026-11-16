// Поиск активных задач по ЕО: при вводе фильтрует сразу, Enter от сканера
// или клавиатуры подтверждает тот же запрос.
/* eslint-disable react/prop-types */
import { IconButton, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

export default function EONumberSearch({
  value = "",
  onChange = () => {},
  onSubmit = () => {},
  resultCount = null,
  queryValid = true,
}) {
  const helperText = resultCount == null
    ? "Сканируйте штрихкод или введите ЕО — поиск по всем активным задачам"
    : !queryValid
      ? "В штрихкоде ЕО должны быть цифры"
      : resultCount === 0
        ? "Активных задач по этому ЕО не найдено"
        : `Найдено задач: ${resultCount}`;

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onSubmit(value);
  };

  return (
    <TextField
      fullWidth
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Поиск по ЕО — сканируйте штрихкод"
      inputProps={{
        "aria-label": "Поиск по ЕО среди активных задач",
        "data-testid": "eo-search-input",
        inputMode: "numeric",
        autoComplete: "off",
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" color="action" />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="Очистить поиск по ЕО"
              size="small"
              onClick={() => onChange("")}
              edge="end"
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
      helperText={helperText}
      FormHelperTextProps={{ sx: { mx: 1, mt: 0.5, lineHeight: 1.2 } }}
      sx={{
        "& .MuiOutlinedInput-root": { borderRadius: 1.5 },
        "& .MuiInputBase-input": { minWidth: 0 },
      }}
    />
  );
}

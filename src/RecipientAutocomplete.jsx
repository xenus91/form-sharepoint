import React, { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";

import apiClient, { normalizeNextUrl } from "./api";

const MENU_PROPS = {
  PaperProps: {
    sx: {
      borderRadius: 1, // 16px ~ твои 14 достаточно близко, можно 1.75 для 14px
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    },
  },
};

const RecipientAutocomplete = ({
  onSelect,
  value,
  error,
  helperText,
  onFocus,
  disabled,
  isEOMissing,
  inputTabIndex,
}) => {
  const [lookupItems, setLookupItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedValue, setSelectedValue] = useState(value);

  const fetchLookupValues = async () => {
    setLoading(true);
    let items = [];
    let hasNext = true;
    let nextUrl =
      "/web/lists/getbytitle('SCList')/items?$select=ID,Title,SCNumberText,SCNumber&$top=1000&$orderby=SCNumber asc";

    try {
      while (hasNext) {
        const { data } = await apiClient.get(nextUrl);
        const fetchedItems = data.d.results.map((item) => ({
          id: item.ID,
          title: String(item.SCNumber ?? ""), // страхуемся от null
          description: item.Title || "",
        }));

        items = [...items, ...fetchedItems];

        if (data.d.__next) {
          nextUrl = normalizeNextUrl(data.d.__next);
          hasNext = !!nextUrl;
        } else {
          hasNext = false;
        }
      }
      // На всякий случай убираем повторы по Id: если страницы пагинации
      // наложатся, список не должен содержать один и тот же элемент дважды.
      const seen = new Set();
      setLookupItems(
        items.filter((item) => {
          if (item.id == null || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
      );
    } catch (e) {
      console.error("Ошибка при получении данных подстановки:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLookupValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автовыбор при "Нет ЕО"
  useEffect(() => {
    if (isEOMissing) {
      const itemToSelect = lookupItems.find((item) => item.id === 1373); // при необходимости поменяй id
      if (itemToSelect) {
        setSelectedValue(itemToSelect.id);
        onSelect(itemToSelect.id);
      }
    } else {
      if (value !== selectedValue) {
        setSelectedValue(value ?? "");
        onSelect(value ?? "");
      }
    }
  }, [isEOMissing, lookupItems, onSelect, value, selectedValue]);

  // Очистка видимого ввода, когда isEOMissing = false
  useEffect(() => {
    if (!isEOMissing) setInputValue("");
  }, [isEOMissing]);

  return (
    <div>
      <Autocomplete
        freeSolo
        disableClearable
        disabled={isEOMissing || disabled}
        options={lookupItems}
        getOptionKey={(option) =>
          typeof option === "string" ? option : String(option?.id ?? option?.title ?? "")
        }
        getOptionLabel={(option) => {
          if (typeof option === "string") return option;
          const t = option?.title;
          return t == null ? "" : String(t);
        }}
        // Без этого MUI берёт ключом getOptionLabel, то есть SCNumber. В SCList
        // разные элементы могут иметь одинаковый номер магазина — React падал с
        // «Encountered two children with the same key». Id элемента уникален.

        loading={loading}
        value={selectedValue ? lookupItems.find((it) => it.id === selectedValue) ?? null : null}
        inputValue={inputValue}
        onInputChange={(_, newVal) => setInputValue(newVal)}
        onChange={(_, newValue) => {
          if (newValue) {
            setSelectedValue(newValue.id);
            onSelect(newValue.id);
          } else {
            setSelectedValue("");
            onSelect("");
          }
        }}
        filterOptions={(options, { inputValue }) => {
          if (!inputValue) return options;
          const regex = new RegExp(`\\b${inputValue}`, "i");
          return options.filter((o) => regex.test(o.title));
        }}
        // единый вид контейнера (OutlinedInput) — прямо здесь
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 1,
            height: 56,
            backgroundColor: "rgba(23,28,143,0.03)",
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(23,28,143,0.25)",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(23,28,143,0.45)",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "#171c8f",
            },
            "&.Mui-error .MuiOutlinedInput-notchedOutline": {
              borderColor: "rgba(229,57,53,0.8)",
            },
            "& input": {
              padding: "0 14px",
              height: "100%",
              boxSizing: "border-box",
            },
          },
        }}
        renderInput={(params) => (
          <TextField
            required
            {...params}
            // Порядок Tab главной формы задаётся явно из App.jsx (см. handleFormKeyDown).
            inputProps={{ ...params.inputProps, ...(inputTabIndex != null ? { tabIndex: inputTabIndex } : {}) }}
            label="Номер получателя"
            error={error}
            onFocus={onFocus}
            InputProps={{
              ...params.InputProps,
              inputMode: "numeric",
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        ListboxProps={{ style: { maxHeight: 280 } }}
        slotProps={{ paper: MENU_PROPS.PaperProps }}
      />
      {error && <FormHelperText error>{helperText}</FormHelperText>}
    </div>
  );
};

export default RecipientAutocomplete;

import React, { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";

const RecipientAutocomplete = ({
  onSelect,
  value,
  error,
  helperText,
  onFocus,
  disabled,
  isEOMissing,
}) => {
  const [lookupItems, setLookupItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedValue, setSelectedValue] = useState(value); // Состояние для выбранного значения

  // Функция для получения данных подстановки с учетом пагинации и добавления поля описания
  const fetchLookupValues = async () => {
    setLoading(true);
    let items = [];
    let hasNext = true;
    let nextUrl =
      "https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('SCList')/items?$select=ID,Title,SCNumberText,SCNumber&$top=1000&$orderby=SCNumber asc";

    try {
      // Постраничная загрузка данных
      while (hasNext) {
        const response = await fetch(nextUrl, {
          method: "GET",
          headers: {
            Accept: "application/json;odata=verbose",
          },
        });

        const data = await response.json();
        const fetchedItems = data.d.results.map((item) => ({
          id: item.ID,
          title: item.SCNumber, // Название подстановки
          description: item.Title || "", // Поле описания
        }));

        items = [...items, ...fetchedItems];

        // Проверка на наличие следующей страницы
        if (data.d.__next) {
          nextUrl = data.d.__next; // Ссылка на следующую страницу данных
        } else {
          hasNext = false; // Если нет следующей страницы
        }
      }

      setLookupItems(items); // Обновление состояния с результатами
    } catch (error) {
      console.error("Ошибка при получении данных подстановки:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLookupValues();
  }, []);

  useEffect(() => {
    if (isEOMissing) {
      const itemToSelect = lookupItems.find(item => item.id === 1373); // Замените 1373 на нужный id
      if (itemToSelect) {
        setSelectedValue(itemToSelect.id); // Устанавливаем выбранный id
        onSelect(itemToSelect.id); // Устанавливаем выбранное значение в родительский компонент
      }
    } else {
      // Если isEOMissing = false, только обновляем выбранное значение, если оно изменилось
      if (value !== selectedValue) {
        setSelectedValue(value); // Сбрасываем значение только если оно отличается от текущего
        onSelect(value); // Передаем новое значение в родительский компонент
      }
    }
  }, [isEOMissing, lookupItems, onSelect, value, selectedValue]); // Зависимости обновляются при изменении isEOMissing, lookupItems или selectedValue

  useEffect(() => {
    if (!isEOMissing) {
      setInputValue(""); // Очистить inputValue только при isEOMissing = false
    }
  }, [isEOMissing]); // Очистка inputValue при смене isEOMissing

  return (
    <div>
      <Autocomplete
        freeSolo
        disableClearable
        disabled={isEOMissing || disabled}
        options={lookupItems}
        getOptionLabel={(option) => option.title}
        loading={loading}
        value={selectedValue ? lookupItems.find((item) => item.id === selectedValue) : null} // Используем состояние selectedValue
        inputValue={inputValue} // Управляем текстовым значением
        onInputChange={(_, newInputValue) => {
          setInputValue(newInputValue); // Обновляем текст при вводе
        }}
        onChange={(_, newValue) => {
          if (newValue) {
            setSelectedValue(newValue.id); // Обновляем выбранное значение
            onSelect(newValue.id); // Передаем значение в родительский компонент
          } else {
            setSelectedValue(''); // Если значение сбрасывается
            onSelect(''); // Сбрасываем значение в родительский компонент
          }
        }}
        filterOptions={(options, { inputValue }) => {
          const regex = new RegExp(`\\b${inputValue}`, 'i'); // Регулярное выражение для поиска вхождений
          return options.filter((option) =>
            regex.test(option.title) // Проверка на соответствие регулярному выражению
          );
        }}
        renderInput={(params) => (
          <TextField
            required
            {...params}
            label="Номер получателя"
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию
                },
                '&:hover fieldset': {
                  borderColor: '#171c8f', // Цвет при наведении
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#171c8f', // Цвет при фокусе
                },
              },
            }}
            error={error}
            InputProps={{
              inputMode: "numeric",
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
            onFocus={onFocus}
          />
        )}
      />
      {error && <FormHelperText error>{helperText}</FormHelperText>}{" "}
      {/* Отображаем текст ошибки */}
    </div>
  );
};

export default RecipientAutocomplete;

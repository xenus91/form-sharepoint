import React, { useEffect, useState } from 'react';
import { Grid, ToggleButton, ToggleButtonGroup, Box } from '@mui/material';

const BtnGroupLocation = ({ loading, errors, location, setLocation, isEOMissing }) => {
  const [selectedLocation, setSelectedLocation] = useState(location);
  const hasError = Boolean(errors); // строка ошибки -> true/false

  useEffect(() => { setSelectedLocation(location); }, [location]);

  const handleLocationChange = (event, newAlignment) => {
    if (newAlignment !== null) {
      setSelectedLocation(newAlignment);
      setLocation(newAlignment);
    }
  };

  return (
    <Grid item xs={12}>
      <Box
        sx={{
          borderRadius: 1,
          background: 'rgba(23,28,143,0.03)',
          border: `1px solid ${hasError ? 'rgba(229,57,53,0.6)' : 'rgba(23,28,143,0.25)'}`,
          '&:hover': { borderColor: hasError ? 'rgba(229,57,53,0.8)' : 'rgba(23,28,143,0.45)' },
          '&:focus-within': { borderColor: hasError ? 'rgba(229,57,53,1)' : '#171c8f' },
          minHeight: 56,
          display: 'flex',
          alignItems: 'stretch',
          p: 0,               // без внутренних отступов
          overflow: 'hidden', // чтобы радиусы контейнера "обрезали" кнопки
        }}
      >
        <ToggleButtonGroup
          value={selectedLocation}
          exclusive
          onChange={handleLocationChange}
          aria-label="location"
          fullWidth
          sx={{
            width: '100%',
            display: 'flex',
            '& .MuiToggleButtonGroup-grouped': {
              flex: 1,                // равная ширина
              m: 0,
              border: 'none',         // без собственных бордеров
              borderRadius: 0,        // убираем внутренние скругления
              height: 56,
              textTransform: 'none',
            },
            // тонкий разделитель между сегментами
            '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
              borderLeft: '1px solid rgba(23,28,143,0.12)',
            },
            // первая и последняя повторяют форму контейнера
            '& .MuiToggleButtonGroup-grouped:first-of-type': {
              borderTopLeftRadius: 14,
              borderBottomLeftRadius: 14,
            },
            '& .MuiToggleButtonGroup-grouped:last-of-type': {
              borderTopRightRadius: 14,
              borderBottomRightRadius: 14,
            },
          }}
        >
          <ToggleButton
            value="Зона отгрузки"
            aria-label="зона отгрузки"
            disabled={loading}
            sx={{
              backgroundColor: selectedLocation === 'Зона отгрузки' ? '#171c8f' : 'transparent',
              color: selectedLocation === 'Зона отгрузки' ? 'white' : 'gray',
              '&:hover': { backgroundColor: '#171c8f', color: 'white' },
              '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: '#171c8f', color: 'white' },
            }}
          >
            Зона отгрузки
          </ToggleButton>

          <ToggleButton
            value="Проблемная зона"
            aria-label="проблемная зона"
            disabled={loading}
            sx={{
              backgroundColor: selectedLocation === 'Проблемная зона' ? '#171c8f' : 'transparent',
              color: selectedLocation === 'Проблемная зона' ? 'white' : 'gray',
              '&:hover': { backgroundColor: '#171c8f', color: 'white' },
              '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: '#171c8f', color: 'white' },
            }}
          >
            Проблемная зона
          </ToggleButton>

          <ToggleButton
            value="Отгружен"
            aria-label="отгружен"
            disabled={loading || isEOMissing}
            sx={{
              backgroundColor: selectedLocation === 'Отгружен' ? '#171c8f' : 'transparent',
              color: selectedLocation === 'Отгружен' ? 'white' : 'gray',
              '&:hover': { backgroundColor: '#171c8f', color: 'white' },
              '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: '#171c8f', color: 'white' },
            }}
          >
            Отгружен
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* {hasError && <div style={{ color: '#e53935', marginTop: 6 }}>{errors}</div>} */}
    </Grid>
  );
};

export default BtnGroupLocation;

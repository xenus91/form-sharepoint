import React from 'react';
import { Grid, ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';

const BtnGroupLocation = ({ loading, errors, location, setLocation, isEOMissing }) => {
  const theme = useTheme();
  const [selectedLocation, setSelectedLocation] = useState(location);

  useEffect(() => {
    setSelectedLocation(location);
  }, [location]);

  const handleLocationChange = (event, newAlignment) => {
    if (newAlignment !== null) {
      setSelectedLocation(newAlignment);
      setLocation(newAlignment);
      // Убираем ошибку, если кнопка выбрана
      if (errors.location) {
        setErrors((prev) => ({ ...prev, location: '' }));
      }
    }
  };

  return (
    <Grid item xs={12} sx={{ mt: 1 }}>
      <ToggleButtonGroup
        value={selectedLocation}
        exclusive
        onChange={handleLocationChange}
        aria-label="location"
        fullWidth
        sx={{
          border: '0px solid #171c8f', // Цвет границы
          borderRadius: '4px', // Радиус углов
          '& .MuiToggleButton-root': {
            borderColor: '#171c8f', // Цвет границ для кнопок
          },
        }}

      >
        <ToggleButton
          value="Зона отгрузки"
          aria-label="зона отгрузки"
          disabled={loading}
          sx={{
            backgroundColor: selectedLocation === "Зона отгрузки" ? '#171c8f' : 'transparent',
            color: selectedLocation === "Зона отгрузки" ? 'white' : 'gray',
            '&:hover': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет при наведении
            },
            '&.Mui-selected:hover': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },
            '&.Mui-selected': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },

          }}
        >
          Зона отгрузки
        </ToggleButton>
        <ToggleButton
          value="Проблемная зона"
          aria-label="проблемная зона"
          disabled={loading}
          sx={{
            backgroundColor: selectedLocation === "Проблемная зона" ? '#171c8f' : 'transparent',
            color: selectedLocation === "Проблемная зона" ? 'white' : 'gray',
            '&:hover': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет при наведении
            },
            '&.Mui-selected:hover': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },
            '&.Mui-selected': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },
          }}
        >
          Проблемная зона
        </ToggleButton>
        <ToggleButton
          value="Отгружен"
          aria-label="отгружен"
          disabled={loading || isEOMissing}
          sx={{
            backgroundColor: selectedLocation === "Отгружен" ? '#171c8f' : 'transparent',
            color: selectedLocation === "Отгружен" ? 'white' : 'gray',
            '&:hover': {
              backgroundColor: '#171c8f',
              color: 'white'// Изменяем цвет при наведении
            },
            '&.Mui-selected:hover': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },
            '&.Mui-selected': {
              backgroundColor: '#171c8f',
              color: 'white' // Изменяем цвет для выбранной кнопки
            },
          }}
        >
          Отгружен
        </ToggleButton>
      </ToggleButtonGroup>
      {/* {errors.location && <div style={{ color: 'red' }}>{errors.location}</div>} */}
    </Grid>
  );
};

export default BtnGroupLocation;

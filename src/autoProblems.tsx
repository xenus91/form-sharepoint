
            {/* Селект с множественным выбором */}
            <Grid item xs={12} sx={{ mt: 1 }}>
              <Autocomplete
                multiple
                options={choices} // Все возможные варианты
                value={problems} // Выбранные проблемы
                onChange={handleChangeAuto} // Обработка выбора
                inputValue={searchQuery} // Значение поиска
                onInputChange={(event, newInputValue) =>
                  setSearchQuery(newInputValue)
                } // Обновление состояния поиска
                filterSelectedOptions // Скрывать уже выбранные
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    label="Выберите проблемы"
                    placeholder="Начните ввод для поиска..."
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
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      key={option}
                      label={option}
                      {...getTagProps({ index })}
                    />
                  ))
                }
              />
            </Grid>
// preview/RelatedScene.jsx — предпросмотр диалога «Связанная заявка» на мок-данных.
//
// Открывается из формы задачи кнопкой «Просмотреть связанную заявку»
// (#dob_tasks/<id>?list=03fc1b92-…). Показывает ровно то, что видит пользователь:
// заголовок, read-only поля, переключатель пустых полей, «Создано/Изменено», «Закрыть».
// Никаких чипов, поясняющих подписей и кнопки «Открыть форму заявки» здесь нет.
//
// Запуск: npm run preview:cards -- --open  →  http://localhost:5180/?scene=related

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RelatedItemDialog from "../src/features/dob/components/RelatedItemDialog";
import { DOB_LIST_GUID } from "./mockDob";

// Диалог тянет данные через react-query — в приложении провайдер есть выше по дереву,
// в изолированной сцене предпросмотра создаём свой.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export default function RelatedScene() {
  const [open, setOpen] = useState(true);

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Диалог «Связанная заявка» — предпросмотр (мок-данные)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Так диалог выглядит при нажатии «Просмотреть связанную заявку» в форме задачи
        (#dob_tasks/&lt;id&gt;?list=03fc1b92-…). Данные только для чтения.
      </Typography>
      <Box>
        <Button variant="outlined" onClick={() => setOpen(true)}>
          Открыть диалог
        </Button>
      </Box>

      <QueryClientProvider client={queryClient}>
        <RelatedItemDialog
          open={open}
          onClose={() => setOpen(false)}
          relatedRef={{ listId: DOB_LIST_GUID, itemId: 1 }}
        />
      </QueryClientProvider>
    </Box>
  );
}

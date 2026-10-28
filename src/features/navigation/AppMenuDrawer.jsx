// src/features/navigation/AppMenuDrawer.jsx
//
// ЕДИНОЕ бургер-меню приложения.
//
// Зачем отдельный компонент: разметка меню была скопирована в App.jsx трижды —
// для главной, для интерфейса задач и для #dob_requests. Копии разъехались:
// в меню заявок ДОБ пункт «Просмотр менеджерами» уехал в конец списка, а у
// пункта «Задачи» пропал бейдж с количеством активных задач («меню отличается
// порядком кнопок и не подтягивает задачи и их кол-во»). Теперь порядок и
// бейдж задаются в одном месте.
//
// Порядок пунктов (единый для всех интерфейсов):
//   1. Главная
//   2. Просмотр менеджерами — только для начальника смены группы отгрузки
//   3. Задачи — с бейджем активных задач
//   4. Заявки ДОБ

import PropTypes from "prop-types";
import {
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CloseIcon from "@mui/icons-material/Close";
import HomeIcon from "@mui/icons-material/Home";
import VisibilityIcon from "@mui/icons-material/Visibility";

const ICON_SX = { color: "#171c8f" };
const TEXT_PROPS = { fontWeight: 600 };
const PAPER_SX = {
  width: 280,
  bgcolor: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(16px)",
  borderRight: "1px solid rgba(23,28,143,0.1)",
};

export default function AppMenuDrawer({
  open,
  onClose,
  active = "",
  tasksCount = 0,
  canOpenManagerPreview = false,
  onOpenForm,
  onOpenTasks,
  onOpenManagerPreview,
  onOpenDashboard,
  userName = "",
  userTitle = "",
  userOffice = "",
  rcLabel = null,
  onOpenRcModal = null,
}) {
  const count = Number(tasksCount);
  return (
    <Drawer anchor="left" open={open} onClose={onClose} PaperProps={{ sx: PAPER_SX }}>
      <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: "#171c8f" }}>Меню</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} size="small" aria-label="Закрыть меню"><CloseIcon /></IconButton>
      </Box>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={onOpenForm} selected={active === "form"} data-testid="menu-item-form">
            <ListItemIcon><HomeIcon sx={ICON_SX} /></ListItemIcon>
            <ListItemText primary="Главная" primaryTypographyProps={TEXT_PROPS} />
          </ListItemButton>
        </ListItem>

        {canOpenManagerPreview && (
          <ListItem disablePadding>
            <ListItemButton onClick={onOpenManagerPreview} selected={active === "manager"} data-testid="menu-item-manager">
              <ListItemIcon><VisibilityIcon sx={ICON_SX} /></ListItemIcon>
              <ListItemText primary="Просмотр менеджерами" primaryTypographyProps={TEXT_PROPS} />
            </ListItemButton>
          </ListItem>
        )}

        <ListItem disablePadding>
          <ListItemButton onClick={onOpenDashboard} selected={active === "dashboard"} data-testid="menu-item-dashboard">
            <ListItemIcon><DashboardRoundedIcon sx={ICON_SX} /></ListItemIcon>
            <ListItemText primary="Дашборд" primaryTypographyProps={TEXT_PROPS} />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={onOpenTasks} selected={active === "tasks"} data-testid="menu-item-tasks">
            <ListItemIcon>
              {/* Бейдж активных задач — один источник правды (useActiveTasksCount),
                  поэтому число одинаковое в любом интерфейсе. */}
              <Badge badgeContent={count > 0 ? count : null} color="error" max={99}>
                <AssignmentIcon sx={ICON_SX} />
              </Badge>
            </ListItemIcon>
            <ListItemText primary="Задачи" primaryTypographyProps={TEXT_PROPS} />
          </ListItemButton>
        </ListItem>
      </List>

      <Box sx={{ flex: 1 }} />
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {`${userName || ""} • ${userTitle || ""}${userOffice ? ` — ${userOffice}` : ""}`}
        </Typography>
        {rcLabel !== null && onOpenRcModal && (
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={onOpenRcModal} sx={{ borderRadius: 2, fontSize: 12 }}>
              РЦ: {rcLabel || "—"}
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

AppMenuDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  /** Какой пункт подсвечен: "form" | "tasks" | "dob" | "manager" | "" */
  active: PropTypes.string,
  /** Активные (не завершённые) задачи — бейдж у пункта «Задачи» */
  tasksCount: PropTypes.number,
  canOpenManagerPreview: PropTypes.bool,
  onOpenForm: PropTypes.func,
  onOpenTasks: PropTypes.func,
  onOpenManagerPreview: PropTypes.func,
  userName: PropTypes.string,
  userTitle: PropTypes.string,
  userOffice: PropTypes.string,
  /** Подпись кнопки РЦ; null — кнопку не показываем */
  rcLabel: PropTypes.string,
  onOpenRcModal: PropTypes.func,
};

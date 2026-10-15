// src/features/navigation/BurgerWithCount.jsx
//
// Кнопка-бургер с чипом количества активных задач.
//
// Зачем отдельный компонент: бургер с бейджем был нарисован вручную в App.jsx
// (главная и задачи), а в интерфейсе ДОБ (#dob_requests, форма заявки, форма
// создания) бургер остался без чипа — «на бургере в /#dob_requests нет чипа с
// кол-вом задач». Теперь бейдж и его оформление задаются в одном месте, а число
// приходит сверху из useActiveTasksCount (один источник правды).

import PropTypes from "prop-types";
import { Badge, IconButton } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

export default function BurgerWithCount({
  onClick,
  count = 0,
  size = "small",
  buttonSx = null,
  iconSx = null,
  ariaLabel = "Открыть меню",
}) {
  const n = Number(count);
  return (
    <Badge
      badgeContent={n > 0 ? n : null}
      color="error"
      max={99}
      overlap="circular"
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      sx={{
        "& .MuiBadge-badge": {
          fontWeight: 800,
          minWidth: 20,
          height: 20,
          fontSize: "0.75rem",
          border: "2px solid white",
        },
      }}
    >
      <IconButton onClick={onClick} size={size} sx={buttonSx} aria-label={ariaLabel}>
        <MenuIcon sx={iconSx} />
      </IconButton>
    </Badge>
  );
}

BurgerWithCount.propTypes = {
  onClick: PropTypes.func,
  /** Активные (не завершённые) задачи — чип на бургере; 0 — чипа нет */
  count: PropTypes.number,
  size: PropTypes.oneOf(["small", "medium", "large"]),
  buttonSx: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  iconSx: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  ariaLabel: PropTypes.string,
};

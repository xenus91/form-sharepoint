// src/services/stylingIcons.js
// Иконки для StylingResultButton / StylingActions (ключ "i").
//
// Импортируем конкретные иконки, а не весь @mui/icons-material — иначе в бандл
// попадут тысячи модулей. Список небольшой: только то, что реально нужно кнопкам.
//
// Если имя не найдено в карте:
//   • строка до 4 символов (обычно emoji) — показывается как текст;
//   • иначе иконка игнорируется (кнопка просто без иконки).

import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import DoneIcon from "@mui/icons-material/Done";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import SendIcon from "@mui/icons-material/Send";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

/** name (нижний регистр) → компонент */
export const STYLING_ICONS = {
  add: AddIcon,
  arrowforward: ArrowForwardIcon,
  cancel: CancelIcon,
  checkcircle: CheckCircleIcon,
  check: CheckCircleIcon,
  close: CloseIcon,
  delete: DeleteIcon,
  done: DoneIcon,
  edit: EditIcon,
  error: ErrorOutlineIcon,
  erroroutline: ErrorOutlineIcon,
  help: HelpOutlineIcon,
  locationon: LocationOnIcon,
  location: LocationOnIcon,
  playarrow: PlayArrowIcon,
  play: PlayArrowIcon,
  save: SaveIcon,
  search: SearchIcon,
  searchoff: SearchOffIcon,
  send: SendIcon,
  warning: WarningAmberIcon,
  warningamber: WarningAmberIcon,
};

/**
 * Возвращает React-элемент иконки или null.
 * @param {string|null} name — значение ключа "i" из конфига
 * @param {function} createElement — React.createElement
 */
export function renderStylingIcon(name, createElement) {
  const raw = String(name || "").trim();
  if (!raw || !createElement) return null;
  const Component = STYLING_ICONS[raw.toLowerCase()];
  if (Component) return createElement(Component, { fontSize: "small" });
  // Короткая строка — считаем emoji и показываем как текст
  if ([...raw].length <= 4) return createElement("span", { style: { fontSize: "1rem", lineHeight: 1 } }, raw);
  return null;
}

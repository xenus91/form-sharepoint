import React, { useState, useRef, useEffect } from "react";
import apiClient from "./api";
import { useTheme, createTheme, ThemeProvider } from "@mui/material/styles";
import {
  Button,
  TextField,
  Grid,
  Container,
  Box,
  Tooltip,
  FormControl,
  OutlinedInput,
  InputLabel,
  Select,
  Checkbox,
  Badge,
  MenuItem,
  Chip,
  FormHelperText,
  Typography,
  Modal,
  IconButton,
  InputAdornment,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import ButtonGroup from "@mui/material/ButtonGroup";
import { useDropzone } from "react-dropzone";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import { green } from "@mui/material/colors";
import SendIcon from "@mui/icons-material/Send";
import CameraIcon from "@mui/icons-material/Camera";
import LoopIcon from "@mui/icons-material/Loop";
import { Html5QrcodeScanner } from "html5-qrcode";
import CloseIcon from "@mui/icons-material/Close";
import { Swiper, SwiperSlide } from "swiper/react";
import CheckIcon from "@mui/icons-material/Check";
import "swiper/swiper-bundle.css";
import SwiperCore from "swiper/core";
import { Pagination, Navigation } from "swiper/modules";
import RecipientAutocomplete from "./RecipientAutocomplete";
import BtnGroupLocation from "./btngroupLocation";
import CollectionsIcon from "@mui/icons-material/Collections";
import MonthlyCounter from "./MonthlyCounter";
import ManagerPreview from "./ManagerPreview";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import VisibilityIcon from "@mui/icons-material/Visibility";
import AssignmentIcon from "@mui/icons-material/Assignment";
import TasksView from "./TasksView";
import { useNotifications } from './NotificationsProvider';

SwiperCore.use([Pagination, Navigation]);

const INPUT_HEIGHT = 56;
const DC_THU_CACHE_KEY = "dcThuOverride";
const OPERATION_DATE_CACHE_KEY = "operationDateSelection";
const OPERATION_DATE_CACHE_DURATION_MS = 11 * 60 * 60 * 1000;
const DC_THU_DURATION_OPTIONS = [
  { value: "1h", label: "1 час", ms: 60 * 60 * 1000 },
  { value: "4h", label: "4 часа", ms: 4 * 60 * 60 * 1000 },
  { value: "8h", label: "8 часов", ms: 8 * 60 * 60 * 1000 },
  { value: "12h", label: "12 часов", ms: 12 * 60 * 60 * 1000 },
  { value: "24h", label: "24 часа", ms: 24 * 60 * 60 * 1000 },
  { value: "72h", label: "3 дня", ms: 72 * 60 * 60 * 1000 },
  { value: "none", label: "Без срока", ms: null },
];

const readDcThuCache = () => {
  const raw = localStorage.getItem(DC_THU_CACHE_KEY);
  if (!raw) return { value: "", expiresAt: null };

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      return { value: parsed, expiresAt: null };
    }
    const value = parsed?.value ?? "";
    const expiresAt = parsed?.expiresAt ?? null;
    if (expiresAt && Date.now() >= expiresAt) {
      return { value: "", expiresAt: null };
    }
    return { value, expiresAt };
  } catch (error) {
    return { value: raw, expiresAt: null };
  }
};

const readOperationDateCache = () => {
  const raw = localStorage.getItem(OPERATION_DATE_CACHE_KEY);
  if (!raw) return { value: null, expiresAt: null };

  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.value ?? null;
    const expiresAt = parsed?.expiresAt ?? null;
    if (!value || !expiresAt || Date.now() >= expiresAt) {
      return { value: null, expiresAt: null };
    }
    return { value, expiresAt };
  } catch (error) {
    return { value: null, expiresAt: null };
  }
};

const formatShiftDate = (date) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .replace(" г.", "");
};

const formatShiftDateShort = (date) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(".", "");
};

const getShiftDateOptions = () => {
  const today = new Date();
  const todayLocal = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const yesterdayLocal = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1
  );

  return {
    today: todayLocal,
    yesterday: yesterdayLocal,
  };
};

const toOperationDateIso = (date) => {
  if (!date) return null;
  const utcMidnight = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  );
  return utcMidnight.toISOString();
};

const formatRemainingTime = (ms) => {
  if (ms <= 0) return "Истекло";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const figmaTheme = createTheme({
  palette: {
    primary: { main: "#171c8f" },
    error: { main: "#e53935" },
    background: { default: "#ffffff" },
    text: { primary: "#0F123D" },
  },
  shape: { borderRadius: 28 },
  typography: {
    fontFamily: `'Poppins','Inter','Segoe UI',Roboto,Arial,sans-serif`,
    h5: { fontWeight: 800, letterSpacing: 0.2 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.2 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 2 },
        containedPrimary: {
          backgroundImage: "linear-gradient(180deg, #171c8f 0%, #10146a 100%)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          height: INPUT_HEIGHT,
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
          // выравниваем контент по высоте
          "& input": {
            padding: "0 14px",
            height: "100%",
            boxSizing: "border-box",
          },
          "& .MuiSelect-select": {
            padding: "0 14px",
            height: "100% !important",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: "rgba(23,28,143,0.08)",
          color: "#171c8f",
        },
      },
    },
  },
});

const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: 48 * 4.5 + 8,
      width: 250,
      borderRadius: 2,
    },
  },
};

const OneLineChips = ({ values }) => {
  const containerRef = React.useRef(null);
  const ghostRef = React.useRef(null);
  const [visibleCount, setVisibleCount] = React.useState(values.length);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    const ghost = ghostRef.current;
    if (!container || !ghost) return;

    const containerWidth = container.clientWidth;
    const chips = Array.from(ghost.querySelectorAll('[data-chip="1"]'));

    // если ширина контейнера неизвестна — показываем всё
    if (!containerWidth || chips.length === 0) {
      setVisibleCount(values.length);
      return;
    }

    // Проходим по чипам и считаем, сколько влезет.
    // Если потребуется "+N", зарезервируем под него ~48px (хватает для +999)
    let available = containerWidth;
    let used = 0;
    let count = 0;

    // Черновой проход — узнаем, влезают ли все
    for (const el of chips) {
      const w = el.offsetWidth; // ширина чипа
      if (used + w <= available) {
        used += w;
        count++;
      } else {
        break;
      }
    }

    if (count === values.length) {
      setVisibleCount(count);
      return;
    }

    // Нужен "+N" — пересчитаем с резервом под "+N"
    const PLUS_RESERVE = 48; // примерно один чип "+N"
    available = Math.max(0, containerWidth - PLUS_RESERVE);
    used = 0;
    count = 0;
    for (const el of chips) {
      const w = el.offsetWidth;
      if (used + w <= available) {
        used += w;
        count++;
      } else {
        break;
      }
    }

    setVisibleCount(count);
  }, [values]);

  // переизмеряем при изменении выбора
  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  // переизмеряем при ресайзе
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const overflow = values.length - visibleCount;

  return (
    <Box
      ref={containerRef}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        overflow: "hidden",
        whiteSpace: "nowrap",
        width: "100%",
      }}
    >
      {values.slice(0, visibleCount).map((v) => (
        <Chip key={v} label={v} size="small" sx={{ height: 28 }} />
      ))}
      {overflow > 0 && (
        <Chip label={`+${overflow}`} size="small" sx={{ height: 28 }} />
      )}

      {/* Невидимый «призрак» для измерений — рендерим все чипы */}
      <Box
        ref={ghostRef}
        sx={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          height: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {values.map((v) => (
          <Chip
            key={`ghost-${v}`}
            label={v}
            size="small"
            sx={{ height: 28 }}
            data-chip="1"
          />
        ))}
      </Box>
    </Box>
  );
};


const App = () => {
  const theme = useTheme();
  const [eoNumber, setEoNumber] = useState("");
  const [transportation, setTransportation] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [problems, setProblems] = useState([]);
  const [choices, setChoices] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoSource, setVideoSource] = useState("environment");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [location, setLocation] = useState("");
  const [isEOMissing, setIsEOMissing] = useState(false);
  const [cameraPhotos, setCameraPhotos] = useState([]);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [isTransportationRequired, setIsTransportationRequired] = useState(false);
  const [scannerTransportationOpen, setScannerTransportationOpen] = useState(false);
  const scannerTransportationRef = useRef(null);
  const qrReaderRef = useRef(null);
  const [selectedRadioValue, setSelectedRadioValue] = useState("");
  const monthlyCounterRef = useRef(null);
  const [showPhotoTips, setShowPhotoTips] = useState(false);
  const camBtnRef = useRef(null);
  //const galBtnRef = useRef(null);
  const [cameraVideos, setCameraVideos] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewVideoUrl, setPreviewVideoUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [cameraMode, setCameraMode] = useState("photo"); // "photo" | "video"

  const isPhotoEmpty = (cameraPhotos.length + galleryPhotos.length + cameraVideos.length) === 0;
  const handleRadioChange = (e) => setSelectedRadioValue(e.target.value);

  // Глобальное отключение эффектов фокуса
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      button:focus, button:active, .MuiButtonBase-root:focus {
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const { notify } = useNotifications();

  // Состояния для дубликатов ЕО
  const [duplicateEoDialogOpen, setDuplicateEoDialogOpen] = useState(false);
  const [duplicateEoItem, setDuplicateEoItem] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isFetchingItemData, setIsFetchingItemData] = useState(false);

  const ProblemsMenuProps = {
    PaperProps: {
      sx: {
        borderRadius: 1,            // одинаковое скругление
        overflow: 'hidden',          // чтобы элементы не торчали за радиус
        width: 280,                  // << сузили список (px). Можно 260–320 по вкусу
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      },
    },
    // Центруем выпадашку относительно селекта, раз ширина меньше контрола
    anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
    transformOrigin: { vertical: 'top', horizontal: 'center' },
    MenuListProps: {
      dense: true,                   // более компактные пункты
      sx: {
        py: 0.5,
        '& li': { whiteSpace: 'nowrap' }, // не переносить строки в пунктах
      },
    },
  };



  const handleScanSuccess = (decodedText) => {
    setTransportation(decodedText);
    stopScannerTransportation();
  };

  const startScannerTransportation = () => {
    if (scannerTransportationRef.current) return;
    if (qrReaderRef.current) {
      const html5QrCodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 30, qrbox: 250 },
        false
      );
      scannerTransportationRef.current = html5QrCodeScanner;
      html5QrCodeScanner.render(handleScanSuccess);
    }
  };

  const stopScannerTransportation = () => {
    if (scannerTransportationRef.current) {
      scannerTransportationRef.current.clear();
      scannerTransportationRef.current = null;
      setScannerTransportationOpen(false);
    }
  };

  const toggleScannerTransportation = () => {
    if (scannerTransportationOpen) stopScannerTransportation();
    else setScannerTransportationOpen(true);
  };

  useEffect(() => {
    if (scannerTransportationOpen) startScannerTransportation();
    else stopScannerTransportation();
    return () => stopScannerTransportation();
  }, [scannerTransportationOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const handleChange = (event) => setIsDesktopViewport(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const [key, setKey] = useState(0);
  const [userProfile, setUserProfile] = React.useState({
    userDepartment: "",
    userOffice: "",
    userDisplayName: "",
    userTitle: "",
  });
  const [isDesktopViewport, setIsDesktopViewport] = useState(window.matchMedia("(min-width: 1200px)").matches);
  const initialDcThuCacheRef = useRef(readDcThuCache());
  const [dcThuOverride, setDcThuOverride] = useState(
    initialDcThuCacheRef.current.value
  );
  const [dcThuExpiresAt, setDcThuExpiresAt] = useState(
    initialDcThuCacheRef.current.expiresAt
  );
  const [dcThuModalOpen, setDcThuModalOpen] = useState(false);
  const [dcThuDraft, setDcThuDraft] = useState("");
  const [dcThuDuration, setDcThuDuration] = useState("8h");
  const [dcThuNow, setDcThuNow] = useState(Date.now());
  const initialOperationDateCacheRef = useRef(readOperationDateCache());
  const [operationDateIso, setOperationDateIso] = useState(
    initialOperationDateCacheRef.current.value
  );
  const [operationDateExpiresAt, setOperationDateExpiresAt] = useState(
    initialOperationDateCacheRef.current.expiresAt
  );
  const [operationDateModalOpen, setOperationDateModalOpen] = useState(
    !initialOperationDateCacheRef.current.value
  );
  const [operationDateNow, setOperationDateNow] = useState(Date.now());

  const [errors, setErrors] = useState({
    eoNumber: "",
    selectedRecipient: "",
    location: "",
    problems: "",
    transportation: "",
    selectedRadioValue: "",
  });

  const handleFocus = (field) =>
    setErrors((prev) => ({ ...prev, [field]: "" }));

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scannerRef = useRef(null);
  const timer = useRef();
  const isSubmittingRef = useRef(false);

  const accept = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/heic": [".heic", ".heif"],
  };
  const { getRootProps, getInputProps } = useDropzone({
    accept,
    multiple: true,
    onDrop: (acceptedFiles) => {
      const newPhotos = acceptedFiles.map((file) => URL.createObjectURL(file));
      setGalleryPhotos((prevPhotos) => [...newPhotos, ...prevPhotos]);
    },
  });

  const buttonSxSubmit = {
    width: "50%",
    borderRadius: 1,
    bgcolor: success ? "#2e7d32" : "#171c8f",
    color: "white",
    "&:focus": { bgcolor: success ? "#1b5e20" : "" },
  };

  const photoBtnSx = (disabled, makeRed) => ({
    flex: 1,
    borderRadius: 1,

    // Красим ТОЛЬКО когда нужно (нет фото) или когда disabled — серый
    ...(makeRed || disabled
      ? {
        backgroundImage: "none !important",             // убрать градиент primary
        bgcolor: disabled ? "action.disabledBackground" : "#e53935",
        "&:hover": {
          bgcolor: disabled ? "action.disabledBackground" : "#d32f2f",
        },
        color: "#fff",
        "& .MuiSvgIcon-root": { color: "#fff !important" }, // иконки остаются белыми
        "&.Mui-disabled": {
          bgcolor: "action.disabledBackground",
          color: "#fff",
        },
      }
      : {})
  });

  useEffect(() => {
    fetchUserProfile();
    fetchChoices();
  }, []);

  useEffect(() => {
    if (dcThuOverride) {
      localStorage.setItem(
        DC_THU_CACHE_KEY,
        JSON.stringify({ value: dcThuOverride, expiresAt: dcThuExpiresAt })
      );
    } else {
      localStorage.removeItem(DC_THU_CACHE_KEY);
    }
  }, [dcThuOverride, dcThuExpiresAt]);

  useEffect(() => {
    if (operationDateIso) {
      localStorage.setItem(
        OPERATION_DATE_CACHE_KEY,
        JSON.stringify({
          value: operationDateIso,
          expiresAt: operationDateExpiresAt,
        })
      );
    } else {
      localStorage.removeItem(OPERATION_DATE_CACHE_KEY);
    }
  }, [operationDateIso, operationDateExpiresAt]);

  useEffect(() => {
    if (!operationDateExpiresAt || !operationDateIso) return;
    if (Date.now() >= operationDateExpiresAt) {
      setOperationDateIso(null);
      setOperationDateExpiresAt(null);
      setOperationDateModalOpen(true);
    }
  }, [operationDateExpiresAt, operationDateIso]);

  useEffect(() => {
    if (!operationDateExpiresAt || !operationDateIso) return;
    const remaining = operationDateExpiresAt - Date.now();
    if (remaining <= 0) return;
    const timeoutId = setTimeout(() => {
      setOperationDateIso(null);
      setOperationDateExpiresAt(null);
      setOperationDateModalOpen(true);
    }, remaining);
    return () => clearTimeout(timeoutId);
  }, [operationDateExpiresAt, operationDateIso]);

  useEffect(() => {
    if (!operationDateModalOpen) return;
    const intervalId = setInterval(() => {
      setOperationDateNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [operationDateModalOpen]);

  useEffect(() => {
    if (!dcThuExpiresAt || !dcThuOverride) return;
    if (Date.now() >= dcThuExpiresAt) {
      setDcThuOverride("");
      setDcThuExpiresAt(null);
    }
  }, [dcThuExpiresAt, dcThuOverride]);

  useEffect(() => {
    if (!dcThuExpiresAt || !dcThuOverride) return;
    const remaining = dcThuExpiresAt - Date.now();
    if (remaining <= 0) return;
    const timeoutId = setTimeout(() => {
      setDcThuOverride("");
      setDcThuExpiresAt(null);
    }, remaining);
    return () => clearTimeout(timeoutId);
  }, [dcThuExpiresAt, dcThuOverride]);

  useEffect(() => {
    if (!dcThuModalOpen || !dcThuExpiresAt) return;
    const intervalId = setInterval(() => {
      setDcThuNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [dcThuModalOpen, dcThuExpiresAt]);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const handleChange = (event) => {
    const {
      target: { value },
    } = event;
    const selectedProblems =
      typeof value === "string" ? value.split(",") : value;

    if (selectedProblems.includes("Не найдена")) {
      setLocation("Не найдена в зоне отгрузки");
    }
    setProblems(selectedProblems);
  };

  const resetButtonState = () => {
    timer.current = setTimeout(() => setSuccess(false), 3000);
  };

  const checkEoNumberInRecentRecords = async (eoNumber) => {
    // Если мы уже в режиме редактирования этого элемента или только что загрузили данные, не проверяем
    if (editingItemId) return;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const officeSuffix = getEffectiveDcThu();

    let userId = currentUserId;
    if (!userId) {
      try {
        const { data } = await apiClient.get("/web/currentuser");
        userId = data.d.Id;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Ошибка получения текущего пользователя:", err);
      }
    }

    try {
      const userFilter = userId ? ` and AuthorId eq ${userId}` : "";
      const response = await apiClient.get(
        `/web/lists/getbytitle('ProblemsPallet')/items?$filter=(THU eq '${eoNumber}' and DC_THU eq '${officeSuffix}' and Created ge datetime'${twentyFourHoursAgo}'${userFilter})&$select=Id,THU,DC_THU,Created,Author/Title&$expand=Author`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      if (response.data.d.results.length > 0) {
        const item = response.data.d.results[0];
        setDuplicateEoItem(item);
        setDuplicateEoDialogOpen(true);
      }
    } catch (error) {
      console.error("Ошибка при проверке Номер ЕО:", error);
    }
  };

  const loadDuplicateEoData = async (itemId) => {
    setIsFetchingItemData(true);
    setLoading(true);
    try {
      // 1. Получаем данные элемента
      const itemResp = await apiClient.get(
        `/web/lists/getbytitle('${LIST_TITLE}')/items(${itemId})?$select=*,Recipient/Id,Recipient/Title&$expand=Recipient,AttachmentFiles`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const item = itemResp.data.d;

      // 2. Мапим поля
      setEoNumber(item.THU || "");
      setTransportation(item.Shipment || "");
      setSelectedRecipient(item.RecipientId || null);
      setProblems(item.Problems?.results || []);
      setLocation(item.Location1 || "");
      setSelectedRadioValue(item.WhNotEO || "");
      if (item.THU === "ЕО отсутствует") {
        setIsEOMissing(true);
      } else {
        setIsEOMissing(false);
      }

      // 3. Загружаем фото
      const attachments = item.AttachmentFiles?.results || [];
      const photoUrls = attachments.map((att) => att.ServerRelativeUrl);
      // Превращаем относительные URL в абсолютные для fetch/toBlob
      const absoluteUrls = photoUrls.map(url => `${window.location.origin}${url}`);
      setGalleryPhotos(absoluteUrls);

      setEditingItemId(itemId);
      notify("Данные загружены для редактирования", { severity: "info" });
    } catch (err) {
      console.error("Ошибка загрузки данных ЕО:", err);
      notify("Не удалось загрузить данные для редактирования", { severity: "error" });
    } finally {
      setIsFetchingItemData(false);
      setLoading(false);
      setDuplicateEoDialogOpen(false);
    }
  };

  const handleBlurEoNumber = () => {
    const validPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;
    if (!validPattern.test(eoNumber)) {
      setErrors({ ...errors, eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'" });
    } else {
      setErrors({ ...errors, eoNumber: "" });
      if (eoNumber && eoNumber !== "ЕО отсутствует") {
        checkEoNumberInRecentRecords(eoNumber);
      }
    }
  };
  const fetchChoices = async () => {
    try {
      const { data } = await apiClient.get(
        `/web/lists/getbytitle('ProblemsPallet')/fields?$filter=InternalName eq 'Problems'`
      );
      const field = data?.d?.results?.[0];
      if (field?.Choices?.results) setChoices(field.Choices.results);
      else console.error("Поле выбора не найдено или не содержит значений");
    } catch (error) {
      console.error("Ошибка при получении вариантов выбора для поля:", error);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const response = await apiClient.get(
        "/SP.UserProfiles.PeopleManager/GetMyProperties",
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const userProperties = response.data.d.UserProfileProperties.results;

      const userDepartment =
        findUserProfileProperty(userProperties, "Department")?.Value || "Не указано";
      const userOffice =
        findUserProfileProperty(userProperties, "Office")?.Value || "Не указано";
      const userDisplayName =
        findUserProfileProperty(userProperties, "PreferredName")?.Value || "Не указано";
      const userTitle = response.data.d.Title;

      let updatedUserOffice = userOffice;
      if (userOffice === "РЦ-8117" && userDepartment === "Группа отгрузки РЦ") {
        updatedUserOffice = "РЦ-8114";
      }

      setUserProfile({
        userDepartment,
        userOffice: updatedUserOffice,
        userDisplayName,
        userTitle,
      });

      // Также получим ID пользователя для фильтрации дубликатов
      const meResp = await apiClient.get("/web/currentuser");
      if (meResp.data?.d?.Id) {
        setCurrentUserId(meResp.data.d.Id);
      }
    } catch (error) {
      console.error("Ошибка при получении профиля пользователя:", error);
    }
  };

  const getOfficeSuffix = (office) => {
    if (!office) return "";
    const officeParts = office.split("-");
    return officeParts.length > 1 ? officeParts[1].trim() : office.trim();
  };

  const normalizeDcThu = (value) => getOfficeSuffix(value);

  const isDcThuActive =
    dcThuOverride && (!dcThuExpiresAt || dcThuExpiresAt > Date.now());

  const getEffectiveDcThu = () =>
    isDcThuActive
      ? normalizeDcThu(dcThuOverride)
      : getOfficeSuffix(userProfile.userOffice);

  // Эффективный Office для задач — при локальной смене РЦ задачи должны перепоискаться по новому РЦ.
  // Если dcThuOverride активен, конструируем "РЦ-XXXX" из суффикса, иначе берём офис из профиля.
  const effectiveOfficeForTasks = isDcThuActive && normalizeDcThu(dcThuOverride)
    ? `РЦ-${normalizeDcThu(dcThuOverride)}`
    : userProfile.userOffice;
  const effectiveUserProfileForTasks = React.useMemo(() => {
    if (isDcThuActive && effectiveOfficeForTasks) {
      return { ...userProfile, userOffice: effectiveOfficeForTasks };
    }
    return userProfile;
  }, [userProfile, isDcThuActive, effectiveOfficeForTasks]);

  const operationDate = operationDateIso ? new Date(operationDateIso) : null;
  const { today: todayShiftDate, yesterday: yesterdayShiftDate } =
    getShiftDateOptions();
  const operationDateLabel = formatShiftDateShort(operationDate);
  const d = new Date(operationDateNow);

const datePart = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(d).replace(" г.", "");

const timePart = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
}).format(d);

const operationDateNowLabel = `${datePart} ${timePart}`;

  const handleOpenDcThuModal = () => {
    const baseValue = dcThuOverride || getOfficeSuffix(userProfile.userOffice);
    setDcThuDraft(baseValue);
    setDcThuNow(Date.now());
    setDcThuModalOpen(true);
  };

  const handleSaveDcThu = () => {
    const normalized = normalizeDcThu(dcThuDraft);
    const selectedOption = DC_THU_DURATION_OPTIONS.find(
      (option) => option.value === dcThuDuration
    );
    const expiresAt = selectedOption?.ms ? Date.now() + selectedOption.ms : null;
    if (normalized) {
      setDcThuOverride(normalized);
      setDcThuExpiresAt(expiresAt);
    } else {
      setDcThuOverride("");
      setDcThuExpiresAt(null);
    }
    setDcThuModalOpen(false);
  };

  const handleClearDcThu = () => {
    setDcThuOverride("");
    setDcThuExpiresAt(null);
    setDcThuDraft(getOfficeSuffix(userProfile.userOffice));
    setDcThuModalOpen(false);
  };

  const getDcThuRemainingMs = () => {
    if (!dcThuExpiresAt) return null;
    return dcThuExpiresAt - dcThuNow;
  };

  const handleSelectOperationDate = (date) => {
    const iso = toOperationDateIso(date);
    setOperationDateIso(iso);
    setOperationDateExpiresAt(Date.now() + OPERATION_DATE_CACHE_DURATION_MS);
    setOperationDateModalOpen(false);
  };

  const openCameraModal = () => {
    setCameraOpen(true);
    startCamera();
  };

  const closeCameraModal = () => {
    if (isRecording) stopRecording();
    stopCamera();
    setCameraOpen(false);
  };

  const startCamera = () => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: videoSource }, audio: false })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch((err) => {
        console.error("Ошибка доступа к камере:", err);
        if (withAudio) {
          console.warn("Попытка запуска без аудио...");
          startCamera(false);
        }
      });
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = () => {
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    beginMediaRecorder(stream);
  };

  const beginMediaRecorder = (stream) => {
    recordedChunksRef.current = [];
    
    // Список предпочтительных форматов в порядке убывания совместимости.
    // video/mp4 (H.264) — наиболее универсальный формат для всех устройств.
    const preferredTypes = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    let selectedType = "";
    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }

    const options = { mimeType: selectedType };

    try {
      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        // Всегда сохраняем с расширением .mp4 для максимальной совместимости в SharePoint и на iOS
        setCameraVideos((prev) => [...prev, { blob, url, name: `video_${Date.now()}.mp4` }]);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(30);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Ошибка при создании MediaRecorder:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const capturePhoto = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const imageDataUrl = canvas.toDataURL("image/png");
    setCameraPhotos((prev) => [imageDataUrl, ...prev]);
  };

  const handleCameraSwitch = () => {
    setVideoSource(videoSource === "environment" ? "user" : "environment");
    stopCamera();
    startCamera();
  };

  const handleCheckboxChange = () => {
    if (isEOMissing) {
      setIsEOMissing(false);
      setEoNumber("");
      setSelectedRadioValue("");
    } else {
      setIsEOMissing(true);
      setEoNumber("ЕО отсутствует");
    }
  };

  const handleApplyPhotos = () => closeCameraModal();

  const LIST_TITLE = "ProblemsPallet";

  async function uploadAttachmentRaw(listTitle, itemId, fileName, dataBlob) {
    const digest = await getRequestDigest();
    return apiClient.post(
      `/web/lists/getbytitle('${encodeURIComponent(
        listTitle
      )}')/items(${itemId})/AttachmentFiles/add(FileName='${encodeURIComponent(
        fileName
      )}')`,
      dataBlob,
      {
        headers: {
          Accept: "application/json;odata=verbose",
          "Content-Type": "application/octet-stream",
          "X-RequestDigest": digest,
        },
        transformRequest: [(d) => d],
        responseType: "text",
      }
    );
  }

  async function deleteListItemById(listTitle, itemId) {
    return apiClient.post(
      `/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`,
      null,
      {
        headers: {
          "IF-MATCH": "*",
          "X-HTTP-Method": "DELETE",
          "Content-Type": undefined,
        },
        transformRequest: [(d) => d],
      }
    );
  }

  async function toBlob(src) {
    if (src instanceof Blob) return src;
    if (typeof src === "string") {
      const resp = await fetch(src);
      return await resp.blob();
    }
    if (src && src.arrayBuffer) {
      return new Blob([await src.arrayBuffer()], {
        type: src.type || "application/octet-stream",
      });
    }
    throw new Error("Невозможно преобразовать фото к Blob");
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setErrors({
      eoNumber: "",
      selectedRecipient: "",
      location: "",
      problems: "",
      transportation: "",
      selectedRadioValue: "",
    });

    let formIsValid = true;
    const newErrors = {};

    const validEoNumberPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;
    if (!eoNumber) {
      newErrors.eoNumber = "Поле Номер ЕО обязательно для заполнения";
      formIsValid = false;
    } else if (!validEoNumberPattern.test(eoNumber)) {
      newErrors.eoNumber = "Введите 17 или 18 цифр или 'ЕО отсутствует'";
      formIsValid = false;
    }
    if (isEOMissing && !selectedRadioValue) {
      newErrors.selectedWarehouse = "Пожалуйста, выберите склад";
      formIsValid = false;
    }
    if (!selectedRecipient) {
      newErrors.selectedRecipient = "Пожалуйста, выберите получателя";
      formIsValid = false;
    }
    if (!location) {
      newErrors.location = "Поле Местоположение обязательно для заполнения";
      formIsValid = false;
    }
    if (isTransportationRequired && !transportation) {
      newErrors.transportation = "Поле Транспортировка обязательно для заполнения";
      formIsValid = false;
    }
    if (problems.length === 0) {
      newErrors.problems = "Пожалуйста, выберите хотя бы одну проблему";
      formIsValid = false;
    }
    if (!problems.includes("Не найдена")) {
      if (cameraPhotos.length === 0 && galleryPhotos.length === 0 && cameraVideos.length === 0) {
        // вместо alert — стеклянные подсказки
        setShowPhotoTips(true);
        // авто-скрытие через 2.5 сек
        setTimeout(() => setShowPhotoTips(false), 2500);
        //setErrors((e) => ({ ...e, problems: e.problems || "Добавьте фото!" }));
        isSubmittingRef.current = false;
        return;
      }
    }

    if (!operationDateIso) {
      setOperationDateModalOpen(true);
      setErrors(newErrors);
      isSubmittingRef.current = false;
      return;
    }

    if (!formIsValid) {
      setErrors(newErrors);
      isSubmittingRef.current = false;
      return;
    }

    let createdItemId = editingItemId;

    try {
      setSuccess(false);
      setLoading(true);

      const officeSuffix = getEffectiveDcThu();
      const digest = await getRequestDigest();

      if (editingItemId) {
        // РЕЖИМ РЕДАКТИРОВАНИЯ
        await apiClient.post(
          `/web/lists/getbytitle('${LIST_TITLE}')/items(${editingItemId})`,
          {
            __metadata: { type: "SP.Data.ProblemsPalletListItem" },
            THU: eoNumber,
            DC_THU: officeSuffix,
            RecipientId: selectedRecipient,
            Location1: location,
            Shipment: transportation,
            WhNotEO: selectedRadioValue,
            OperationDate: operationDateIso,
            Problems: {
              __metadata: { type: "Collection(Edm.String)" },
              results: problems,
            },
            Status: "Выполнено", // Сразу ставим статус
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "X-RequestDigest": digest,
              "IF-MATCH": "*",
              "X-HTTP-Method": "MERGE",
            },
          }
        );

        // Перед загрузкой новых фото удаляем старые вложения
        try {
          const filesResp = await apiClient.get(
            `/web/lists/getbytitle('${LIST_TITLE}')/items(${editingItemId})/AttachmentFiles`,
            { headers: { Accept: "application/json;odata=verbose" } }
          );
          const files = filesResp.data.d.results;
          for (const file of files) {
            await apiClient.post(
              `/web/lists/getbytitle('${LIST_TITLE}')/items(${editingItemId})/AttachmentFiles/getByFileName('${encodeURIComponent(file.FileName)}')`,
              null,
              {
                headers: {
                  "X-RequestDigest": digest,
                  "X-HTTP-Method": "DELETE",
                  "IF-MATCH": "*",
                },
              }
            );
          }
        } catch (delErr) {
          console.error("Ошибка при удалении старых вложений:", delErr);
        }
      } else {
        // РЕЖИМ СОЗДАНИЯ
        const createResp = await apiClient.post(
          `/web/lists/getbytitle('${LIST_TITLE}')/items`,
          {
            __metadata: { type: "SP.Data.ProblemsPalletListItem" },
            THU: eoNumber,
            DC_THU: officeSuffix,
            RecipientId: selectedRecipient,
            Location1: location,
            Shipment: transportation,
            WhNotEO: selectedRadioValue,
            OperationDate: operationDateIso,
            Problems: {
              __metadata: { type: "Collection(Edm.String)" },
              results: problems,
            },
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "X-RequestDigest": digest,
            },
          }
        );
        createdItemId = createResp?.data?.d?.Id;
      }

      if (!createdItemId) {
        throw new Error("SharePoint не вернул Id элемента.");
      }

      const allSources = [
        ...cameraPhotos.map(p => ({ src: p, type: 'photo' })),
        ...galleryPhotos.map(p => ({ src: p, type: 'photo' })),
        ...cameraVideos.map(v => ({ src: v.blob, type: 'video', name: v.name }))
      ];

      for (let i = 0; i < allSources.length; i++) {
        const item = allSources[i];
        const blob = await toBlob(item.src);

        let ext = "png";
        if (item.type === 'video') {
          // Тщательно очищаем расширение от кодеков и параметров (Safari fix)
          const rawExt = item.name.split('.').pop() || 'webm';
          ext = rawExt.split(';')[0]; 
        } else {
          if (blob?.type?.includes("jpeg")) ext = "jpg";
          if (blob?.type?.includes("png")) ext = "png";
          if (blob?.type?.includes("heic")) ext = "heic";
          if (blob?.type?.includes("heif")) ext = "heif";
          if (!blob?.type) ext = "bin";
        }

        const fileName = item.type === 'video' 
          ? `video_${i + 1}_${Date.now()}.${ext}` 
          : `photo_${i + 1}_${Date.now()}.${ext}`;
        await uploadAttachmentRaw(LIST_TITLE, createdItemId, fileName, blob);
      }

      if (!editingItemId) {
        await apiClient.post(
          `/web/lists/getbytitle('${LIST_TITLE}')/items(${createdItemId})`,
          {
            __metadata: { type: "SP.Data.ProblemsPalletListItem" },
            Status: "Выполнено",
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "IF-MATCH": "*",
              "X-HTTP-Method": "MERGE",
            },
          }
        );
      }

      setSuccess(true);
      notify('Данные отправлены', { severity: 'success', autoHideDuration: 3000 });
      setLoading(false);
      resetButtonState();

      if (monthlyCounterRef.current?.refresh) {
        monthlyCounterRef.current.refresh();
      }

      setEoNumber("");
      setIsEOMissing(false);
      cameraVideos.forEach(v => URL.revokeObjectURL(v.url));
      setCameraPhotos([]);
      setGalleryPhotos([]);
      setCameraVideos([]);
      setProblems([]);
      setSelectedRecipient(null);
      setLocation("");
      setTransportation("");
      setKey((prevKey) => prevKey + 1);
      setSelectedRadioValue("");
      setEditingItemId(null);
    } catch (err) {
      console.error("Ошибка отправки данных:", err);
      try {
        if (createdItemId) {
          await deleteListItemById(LIST_TITLE, createdItemId);
          console.warn(`Созданный элемент #${createdItemId} удалён из-за ошибки.`);
          notify('Не удалось отправить данные. Попробуйте ещё раз.', { severity: 'error' });
        }
      } catch (rollbackErr) {
        console.error("Откат (удаление элемента) не удался:", rollbackErr);
      }
      setSuccess(false);
      setLoading(false);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const getRequestDigest = async () => {
    const response = await apiClient.post(
      "/contextinfo",
      {},
      { headers: { Accept: "application/json;odata=verbose" } }
    );
    return response.data.d.GetContextWebInformation.FormDigestValue;
  };

  const findUserProfileProperty = (properties, propertyName) =>
    properties.find((prop) => prop.Key === propertyName);

  const handleBarcodeScanSuccess = (decodedText) => {
    setEoNumber(decodedText);
    const validPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;
    if (!validPattern.test(decodedText)) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'",
      }));
    } else {
      setErrors((prevErrors) => ({ ...prevErrors, eoNumber: "" }));
      checkEoNumberInRecentRecords(decodedText);
    }
    setScannerOpen(false);
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
    }
  };

  const startScanner = () => {
    const html5QrCodeScanner = new Html5QrcodeScanner(
      "reader",
      { fps: 30, qrbox: 250 },
      false
    );
    scannerRef.current = html5QrCodeScanner;
    html5QrCodeScanner.render(handleBarcodeScanSuccess);
  };
  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
      setScannerOpen(false);
    }
  };

  const toggleScanner = () => {
    setEoNumber("");
    if (scannerOpen) stopScanner();
    else {
      setScannerOpen(true);
      startScanner();
    }
  };

  const handleInputChange = (event) => {
    if (!isEOMissing) {
      const value = event.target.value;
      if (/^\d*$/.test(value) || value === "") {
        setEoNumber(value);
        setErrors({ ...errors, eoNumber: "" });
      } else {
        setErrors({
          ...errors,
          eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'",
        });
      }
    }
  };

  const canOpenManagerPreview =
    String(userProfile.userTitle || "").trim().toLowerCase() === "начальник смены" &&
    String(userProfile.userDepartment || "").toLowerCase().includes("группа отгрузки");

  const [managerPreviewOpen, setManagerPreviewOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // hash-роут: #tasks / #/tasks / #manager / #form (+ #tasks/id=10, #tasks/10, #tasks?id=10)
  const parseHash = () => {
    const raw = window.location.hash || "";
    const low = raw.toLowerCase();
    let view = "form";
    if (low.includes("tasks") || low.includes("tasksview")) view = "tasks";
    else if (low.includes("manager") || low.includes("managerpreview")) view = "manager";
    // elementId: поддерживает id=10, elementid=10, #tasks/10, #tasks?id=10, #tasks/id=10, #tasks&elementid=10
    let elementId = null;
    let elementAction = null;
    // 1) id=число (любой вариант: id=10, elementid=10, ?id=10 &id=10 /id=10)
    const mId = low.match(/(?:elementid|\bid)\s*=\s*(\d{1,19})/);
    if (mId) elementId = mId[1];
    else {
      // 2) путь /tasks/10
      const mPath = raw.match(/#\/?tasks\/(\d{1,19})/i);
      if (mPath) elementId = mPath[1];
      else {
        // 3) чистый ?10 после #tasks (редко) - пробуем последний числовой сегмент
        const after = low.replace(/^#\/?tasks\/?/, "");
        if (/^\d{1,19}([\/?&#].*)?$/.test(after.trim())) {
          const mNum = after.trim().match(/^(\d{1,19})/);
          if (mNum) elementId = mNum[1];
        }
      }
    }
    // SearchResult для имитации первого нажатия Найдена/Не найдена
    const mSearch = low.match(/searchresult\s*=\s*([a-z_]+)/);
    if (mSearch) {
      const v = mSearch[1].trim().toLowerCase();
      if (v === "searchcomplete" || v === "complete" || v === "found") elementAction = "found";
      else if (v === "searchfail" || v === "fail" || v === "notfound" || v === "not_found") elementAction = "notfound";
      else elementAction = v;
    }
    // action для следующего этапа (found/notfound)
    const mAct = low.match(/action\s*=\s*([a-zа-я_]+)/);
    if (!elementAction && mAct) {
      const v = mAct[1].trim();
      if (v === "found" || v === "найдена" || v === "найден") elementAction = "found";
      else if (v === "notfound" || v === "not_found" || v === "не_найдена" || v === "не-найдена" || v === "не найдена" || v === "не найден") elementAction = "notfound";
      else elementAction = v;
    } else if (!elementAction && (low.includes("/found") || low.includes("__found"))) elementAction = "found";
    else if (!elementAction && (low.includes("/notfound") || low.includes("not_found") || low.includes("не_найдена") || low.includes("not-found"))) elementAction = "notfound";
    return { view, elementId, elementAction };
  };
  const getViewFromHash = () => parseHash().view;
  const [currentView, setCurrentView] = useState(() => getViewFromHash());
  const [hashElementId, setHashElementId] = useState(() => parseHash().elementId);
  const [hashElementAction, setHashElementAction] = useState(() => parseHash().elementAction);
  const [tasksActiveCount, setTasksActiveCount] = useState(0);
  const [taskDistribution, setTaskDistribution] = useState(null);
  const [taskFieldsApp, setTaskFieldsApp] = useState([]);

  // синхронизация с hash — прямой переход по #tasks (+ elementId)
  useEffect(() => {
    const onHash = () => {
      const p = parseHash();
      setCurrentView(p.view);
      setHashElementId(p.elementId);
      setHashElementAction(p.elementAction);
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const desired = currentView === "tasks" ? "#tasks" : currentView === "manager" ? "#manager" : "#form";
    const parsed = parseHash();
    if (currentView === "form") {
      if (window.location.hash && window.location.hash.toLowerCase() !== "#form") window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }
    // если уже на нужном view и hash содержит ожидаемый префикс — не трогаем (сохраняем id=... в url)
    if (window.location.hash.toLowerCase().startsWith(desired.toLowerCase())) {
      return;
    }
    // иначе ставим желаемый hash (с сохранением elementId если был и view tasks)
    if (currentView === "tasks" && parsed.elementId) {
      window.location.hash = `${desired}/id=${parsed.elementId}` + (parsed.elementAction ? `&action=${parsed.elementAction}` : "");
    } else {
      window.location.hash = desired;
    }
  }, [currentView]);

  const handleOpenManagerPreview = () => {
    setCurrentView("manager");
    setDrawerOpen(false);
  };
  const handleOpenForm = () => {
    setCurrentView("form");
    setDrawerOpen(false);
  };
  const handleOpenTasks = () => {
    setCurrentView("tasks");
    setDrawerOpen(false);
  };

  const handleLocationChange = (value) => {
    setLocation(value);
    if (/отгружен/i.test(value)) setIsTransportationRequired(true);
    else setIsTransportationRequired(false);
  };

  // Keep legacy managerPreviewOpen sync with currentView
  useEffect(() => {
    if (managerPreviewOpen) setCurrentView("manager");
  }, [managerPreviewOpen]);

  // Poll active tasks count for burger badge - uses GUID directly, no discovery, every 60s + on focus/visibility
  const TASKS_LIST_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";
  const TASKS_LIST_API = `/web/lists(guid'${TASKS_LIST_GUID}')`;
  const DCEMAIL_LIST_TITLE = "DcEmail";

  function getGroupIdsFromDistributionApp(dist) {
    if (!dist) return [];
    const extractIds = (val) => {
      if (val == null) return [];
      if (Array.isArray(val)) return val.map((v) => (v != null && typeof v === "object" ? v.Id ?? v : v)).filter((v) => v != null && v !== "").map(Number).filter((n) => !Number.isNaN(n));
      if (typeof val === "object") {
        if (Array.isArray(val.results)) return val.results.map((v) => (v != null && typeof v === "object" ? v.Id ?? v : v)).filter((v) => v != null && v !== "").map(Number).filter((n) => !Number.isNaN(n));
        if (val.Id != null) { const n = Number(val.Id); return Number.isNaN(n) ? [] : [n]; }
        if (val.__deferred) return [];
      }
      if (typeof val === "number" || typeof val === "string") { const n = Number(val); return Number.isNaN(n) ? [] : [n]; }
      return [];
    };
    if (dist.Email != null) {
      const ids = extractIds(dist.Email);
      if (ids.length) return [...new Set(ids)];
    }
    for (const key of ["EmailId", "Email_x002e_Id", "Email_x0020_Id", "EMailId", "Email_X002e_Id"]) {
      if (dist[key] != null) {
        const ids = extractIds(dist[key]);
        if (ids.length) return [...new Set(ids)];
      }
    }
    for (const k of Object.keys(dist)) {
      if (/email/i.test(k) && /id/i.test(k) && dist[k] != null) {
        const ids = extractIds(dist[k]);
        if (ids.length) return [...new Set(ids)];
      }
    }
    return [];
  }

  async function resolveDistributionViaDcEmailApp(office, department) {
    if (!office && !department) return null;
    const officeStr = String(office).trim();
    const deptStr = String(department).trim();
    const full = `${officeStr}${deptStr}`;
    const candidates = [full];
    const suffix = officeStr.includes("-") ? officeStr.split("-").pop().trim() : "";
    if (suffix && suffix !== officeStr) {
      const v1 = `${suffix}${deptStr}`;
      if (!candidates.includes(v1)) candidates.push(v1);
      const v2 = `РЦ-${suffix}${deptStr}`;
      if (!candidates.includes(v2)) candidates.push(v2);
      const v3 = officeStr.replace("-", "") + deptStr;
      if (!candidates.includes(v3)) candidates.push(v3);
    }
    for (const offDepKey of candidates) {
      const offDepKeyEsc = offDepKey.replace(/'/g, "''");
      try {
        const { data } = await apiClient.get(
          `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,Email/Id&$expand=Email&$filter=OffDepKey eq '${offDepKeyEsc}'&$top=1`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const items = data?.d?.results || [];
        if (items.length) return items[0];
      } catch {}
    }
    try {
      const { data: data2 } = await apiClient.get(
        `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,Email/Id&$expand=Email&$top=100`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const items2 = data2?.d?.results || [];
      for (const cand of candidates) {
        const norm = cand.trim().toLowerCase();
        const found = items2.find((it) => String(it.OffDepKey || "").trim().toLowerCase() === norm);
        if (found) return found;
      }
    } catch {}
    for (const offDepKey of candidates) {
      const offDepKeyEsc = offDepKey.replace(/'/g, "''");
      try {
        const { data } = await apiClient.get(
          `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,EmailId&$filter=OffDepKey eq '${offDepKeyEsc}'&$top=1`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const items = data?.d?.results || [];
        if (items.length) return items[0];
      } catch (e2) {
        console.warn("DcEmail resolve (App) failed", e2?.message);
      }
    }
    return null;
  }
  // Resolve distribution for group-assigned tasks via DcEmail — учитывает локальный РЦ (dcThuOverride)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const officeForTasks = effectiveOfficeForTasks || userProfile.userOffice;
      const deptForTasks = userProfile.userDepartment;
      if (!officeForTasks && !deptForTasks) return;
      const dist = await resolveDistributionViaDcEmailApp(officeForTasks, deptForTasks);
      if (!cancelled) {
        setTaskDistribution(dist);
        // Лог для отладки локальной смены РЦ
        console.log("[tasks] distribution resolved", { officeForTasks, deptForTasks, distOffDepKey: dist?.OffDepKey, groupIds: dist ? getGroupIdsFromDistributionApp(dist) : [] });
      }
      try {
        const { data } = await apiClient.get(`${TASKS_LIST_API}/fields?$select=InternalName`, { headers: { Accept: "application/json;odata=verbose" } });
        if (!cancelled) setTaskFieldsApp((data?.d?.results || []).map((f) => f.InternalName));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userProfile.userOffice, userProfile.userDepartment, effectiveOfficeForTasks, isDcThuActive]);

  // Уведомление при локальной смене РЦ — задачи перепоискаются автоматически
  const prevOfficeRef = useRef(effectiveOfficeForTasks);
  useEffect(() => {
    if (prevOfficeRef.current !== effectiveOfficeForTasks && prevOfficeRef.current) {
      const msg = isDcThuActive
        ? `РЦ сменён на ${effectiveOfficeForTasks} — задачи перезагружены`
        : `Локальный РЦ сброшен, задачи для ${effectiveOfficeForTasks || "профиля"} перезагружены`;
      console.log("[tasks] local RC changed", { from: prevOfficeRef.current, to: effectiveOfficeForTasks });
      try { notify(msg, { severity: "info", autoHideDuration: 3000 }); } catch {}
    }
    prevOfficeRef.current = effectiveOfficeForTasks;
  }, [effectiveOfficeForTasks, isDcThuActive]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    async function fetchBadgeCountSimple() {
      try {
        // Build filter based on distribution (group assignment) if available
        // Email — поле Пользователь/Группа, берем Id групп для AssignedToId
        let filter;
        if (taskDistribution) {
          const groupIds = getGroupIdsFromDistributionApp(taskDistribution);
          if (groupIds.length > 0) {
            const allIds = [...new Set([...groupIds.map(Number), currentUserId].filter((v) => v != null && !Number.isNaN(v)).map(Number))];
            if (allIds.length === 1) filter = `AssignedToId eq ${allIds[0]}`;
            else if (allIds.length > 1) filter = `(${allIds.map((id) => `AssignedToId eq ${id}`).join(" or ")})`;
            else filter = `AssignedToId eq ${currentUserId}`;
          } else {
            filter = `AssignedToId eq ${currentUserId}`;
          }
        } else {
          filter = `AssignedToId eq ${currentUserId}`;
        }
        const url = `${TASKS_LIST_API}/items?$select=Id,Status,PercentComplete&$filter=${filter}&$top=100`;
        try {
          const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
          const results = data?.d?.results || [];
          let cnt = 0;
          for (const r of results) {
            const s = String(r.Status || "").toLowerCase();
            const pc = r.PercentComplete;
            const isCompleted = pc === 1 || pc === 100 || s.includes("заверш") || s.includes("completed") || (s.includes("выполн") && !s.includes("в процессе")) || s === "5";
            if (!isCompleted) cnt += 1;
          }
          if (!cancelled) setTasksActiveCount(cnt);
        } catch (e) {
          // Fallback to AssignedTo/Id if primary filter failed (e.g., field not exists)
          const altUrl = `${TASKS_LIST_API}/items?$select=Id,Status,PercentComplete&$filter=AssignedTo/Id eq ${currentUserId}&$top=100`;
          try {
            const { data } = await apiClient.get(altUrl, { headers: { Accept: "application/json;odata=verbose" } });
            const results = data?.d?.results || [];
            let cnt = 0;
            for (const r of results) {
              const s = String(r.Status || "").toLowerCase();
              const pc = r.PercentComplete;
              const isCompleted = pc === 1 || pc === 100 || s.includes("заверш") || s.includes("completed") || (s.includes("выполн") && !s.includes("в процессе")) || s === "5";
              if (!isCompleted) cnt += 1;
            }
            if (!cancelled) setTasksActiveCount(cnt);
          } catch {}
        }
      } catch {}
    }
    fetchBadgeCountSimple();
    const id = setInterval(fetchBadgeCountSimple, 60000);
    const onFocus = () => fetchBadgeCountSimple();
    const onVisible = () => { if (document.visibilityState === "visible") fetchBadgeCountSimple(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [currentUserId, taskDistribution, taskFieldsApp]);

  if (currentView === "manager") {
    return (
      <ThemeProvider theme={figmaTheme}>
        <ManagerPreview
          userProfile={userProfile}
          onBack={() => setCurrentView("form")}
        />
      </ThemeProvider>
    );
  }

  if (currentView === "tasks") {
    return (
      <ThemeProvider theme={figmaTheme}>
        {/* Burger button for tasks */}
        <Box
          sx={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 1302,
            display: drawerOpen ? "none" : "block",
          }}
        >
          <Badge
            badgeContent={tasksActiveCount > 0 ? tasksActiveCount : null}
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
            <IconButton
              onClick={() => setDrawerOpen(true)}
              sx={{
                bgcolor: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(23,28,143,0.15)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                width: 44,
                height: 44,
                "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
              }}
            >
              <MenuIcon sx={{ color: "#171c8f" }} />
            </IconButton>
          </Badge>
        </Box>
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: 280,
              bgcolor: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(16px)",
              borderRight: "1px solid rgba(23,28,143,0.1)",
            },
          }}
        >
          <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: "#171c8f" }}>Меню</Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton onClick={() => setDrawerOpen(false)} size="small"><CloseIcon /></IconButton>
          </Box>
          <Divider />
          <List>
            <ListItem disablePadding>
              <ListItemButton onClick={handleOpenForm}>
                <ListItemIcon><HomeIcon sx={{ color: "#171c8f" }} /></ListItemIcon>
                <ListItemText primary="Главная" primaryTypographyProps={{ fontWeight: 600 }} />
              </ListItemButton>
            </ListItem>
            {canOpenManagerPreview && (
              <ListItem disablePadding>
                <ListItemButton onClick={handleOpenManagerPreview}>
                  <ListItemIcon><VisibilityIcon sx={{ color: "#171c8f" }} /></ListItemIcon>
                  <ListItemText primary="Просмотр менеджерами" primaryTypographyProps={{ fontWeight: 600 }} />
                </ListItemButton>
              </ListItem>
            )}
            <ListItem disablePadding>
              <ListItemButton onClick={handleOpenTasks} selected>
                <ListItemIcon>
                  <Badge badgeContent={tasksActiveCount > 0 ? tasksActiveCount : null} color="error" max={99}>
                    <AssignmentIcon sx={{ color: "#171c8f" }} />
                  </Badge>
                </ListItemIcon>
                <ListItemText primary="Задачи" primaryTypographyProps={{ fontWeight: 600 }} />
              </ListItemButton>
            </ListItem>
          </List>
          <Box sx={{ flex: 1 }} />
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {userProfile.userDisplayName || ""} • {userProfile.userTitle || ""}
            </Typography>
          </Box>
        </Drawer>
        {/* Tasks view — без верхнего отступа, TasksView сам управляет высотой и шапкой */}
        <Box sx={{ pt: 0, width: "100%", minWidth: 0, boxSizing: "border-box", display: "block", overflowX: 'hidden' }}>
          <TasksView userProfile={effectiveUserProfileForTasks} currentUserId={currentUserId} isLocalRcActive={isDcThuActive} localRcValue={getEffectiveDcThu()} localRcOffice={effectiveOfficeForTasks} onClearLocalRc={handleClearDcThu} onCountChange={setTasksActiveCount} onBack={() => setCurrentView("form")} initialElementId={hashElementId} initialElementAction={hashElementAction} onClearElementHash={() => { setHashElementId(null); setHashElementAction(null); window.location.hash="#tasks"; }} />
        </Box>
        {/* Keep modals for operation date etc accessible in tasks view as well */}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={figmaTheme}>
      {/* Бургер кнопка слева вверху */}
      <Box
        sx={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 1302,
          display: drawerOpen ? "none" : "block",
        }}
      >
        <Badge
          badgeContent={tasksActiveCount > 0 ? tasksActiveCount : null}
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
          <IconButton
            onClick={() => setDrawerOpen(true)}
            sx={{
              bgcolor: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(23,28,143,0.15)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              width: 44,
              height: 44,
              "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
            }}
          >
            <MenuIcon sx={{ color: "#171c8f" }} />
          </IconButton>
        </Badge>
      </Box>
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(16px)",
            borderRight: "1px solid rgba(23,28,143,0.1)",
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#171c8f" }}>Меню</Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={() => setDrawerOpen(false)} size="small"><CloseIcon /></IconButton>
        </Box>
        <Divider />
        <List>
          <ListItem disablePadding>
            <ListItemButton onClick={handleOpenForm} selected={currentView === "form"}>
              <ListItemIcon><HomeIcon sx={{ color: "#171c8f" }} /></ListItemIcon>
              <ListItemText primary="Главная" primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
          {canOpenManagerPreview && (
            <ListItem disablePadding>
              <ListItemButton onClick={handleOpenManagerPreview}>
                <ListItemIcon><VisibilityIcon sx={{ color: "#171c8f" }} /></ListItemIcon>
                <ListItemText primary="Просмотр менеджерами" primaryTypographyProps={{ fontWeight: 600 }} />
              </ListItemButton>
            </ListItem>
          )}
          <ListItem disablePadding>
            <ListItemButton onClick={handleOpenTasks}>
              <ListItemIcon>
                <Badge badgeContent={tasksActiveCount > 0 ? tasksActiveCount : null} color="error" max={99}>
                  <AssignmentIcon sx={{ color: "#171c8f" }} />
                </Badge>
              </ListItemIcon>
              <ListItemText primary="Задачи" primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
        </List>
        <Box sx={{ flex: 1 }} />
        <Divider />
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {userProfile.userDisplayName || ""} • {userProfile.userTitle || ""} — {userProfile.userOffice || ""}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={handleOpenDcThuModal} sx={{ borderRadius: 2, fontSize: 12 }}>
              РЦ: {getEffectiveDcThu() || "—"}
            </Button>
          </Box>
        </Box>
      </Drawer>
      {/* Верхняя панель счётчика со смещением под бургер */}
      <MonthlyCounter
        ref={monthlyCounterRef}
        listTitle="ProblemsPallet"
        authorId={userProfile.userId}
        position="fixed"
        leftOffset={64}
        extraContent={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1,
              justifyContent: "center",
            }}
          >
            <Button
              variant="text"
              onClick={() => setOperationDateModalOpen(true)}
              sx={{
                px: 0.5,
                py: 0.25,
                borderRadius: 2,
                fontWeight: 700,
              }}
            >
              {operationDateLabel}
            </Button>
          </Box>
        }
      />

      <Container maxWidth="sm" sx={{ p: 2, pt: 7 }}>
        <Typography variant="h5" gutterBottom sx={{ textAlign: "center", my: 2 }}>
          Проблемные ЕО
        </Typography>
        {/* Меню просмотра менеджерами теперь в бургер-меню слева вверху */}
        {/* canOpenManagerPreview hidden button moved to drawer */}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <Button
            variant="outlined"
            onClick={handleOpenDcThuModal}
            sx={{ borderRadius: 1 }}
          >
            РЦ: {getEffectiveDcThu() || "—"}
            {isDcThuActive ? " (локально)" : ""}
          </Button>
        </Box>

        {/* Контейнер формы без «овала» — без фона и рамки */}
        <Box sx={{ p: 0, border: "none", background: "transparent" }}>
          <form onSubmit={handleFormSubmit}>
            <Grid container direction="column" sx={{ gap: 1.5 }}>
              {/* Номер ЕО */}
              <Grid item xs={12}>
                <TextField
                  type="text"
                  label="Номер ЕО"
                  fullWidth
                  disabled={loading}
                  required
                  error={!!errors.eoNumber}
                  helperText={errors.eoNumber}
                  value={eoNumber}
                  onChange={handleInputChange}
                  onBlur={handleBlurEoNumber}
                  inputProps={{ inputMode: "numeric" }}
                  InputProps={{
                    startAdornment: isEOMissing ? (
                      <InputAdornment position="start" sx={{ ml: 0.5 }}>
                        <Button
                          variant="text"
                          onClick={handleCheckboxChange}
                          sx={{
                            minWidth: "unset",
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            backgroundColor: isEOMissing
                              ? "rgba(46,204,113,0.3)"
                              : "rgba(23,28,143,0.10)",
                            color: isEOMissing ? "#0c5f2b" : "#171c8f",
                            border: "none",
                            "&:hover": {
                              backgroundColor: isEOMissing
                                ? "rgba(46,204,113,0.45)"
                                : "rgba(23,28,143,0.18)",
                            },
                          }}
                        >
                          <Checkbox
                            checked={isEOMissing}
                            onChange={handleCheckboxChange}
                            sx={{ p: 0.5, mr: 0.5 }}
                          />
                          Нет ЕО
                        </Button>
                      </InputAdornment>
                    ) : null,
                    endAdornment: !isEOMissing ? (
                      <InputAdornment position="end" sx={{ mr: 0.5 }}>
                        <Button
                          variant="text"
                          onClick={handleCheckboxChange}
                          sx={{
                            minWidth: "unset",
                            px: 1,
                            py: 0.5,
                            mr: 0.5,
                            borderRadius: 1,
                            backgroundColor: "rgba(23,28,143,0.10)",
                            color: "#171c8f",
                            "&:hover": { backgroundColor: "rgba(23,28,143,0.18)" },
                          }}
                        >
                          <Checkbox
                            checked={isEOMissing}
                            onChange={handleCheckboxChange}
                            sx={{ p: 0.5, mr: 0.5 }}
                          />
                          Нет ЕО
                        </Button>
                        <IconButton onClick={toggleScanner} title="Сканер ЕО" size="small">
                          <QrCodeScannerRoundedIcon sx={{ color: "#171c8f" }} />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                />
              </Grid>

              {/* Сканнер QR ЕО */}
              <Grid item xs={12}>
                <Box
                  id="reader"
                  sx={{
                    pt: 0,
                    display: scannerOpen ? "block" : "none",
                    maxWidth: "100%",
                    overflowX: "hidden",
                    borderRadius: 1,
                  }}
                />
              </Grid>

              {/* Радио-склад при Нет ЕО */}
              {isEOMissing && (
                <Grid item xs={12}>
                  <FormControl
                    component="fieldset"
                    error={!!errors.selectedWarehouse}
                    disabled={loading}
                    sx={{
                      borderRadius: 2,
                      px: 2,
                      py: 0,
                      background: "rgba(23,28,143,0.03)",
                      border: `1px solid ${!!errors.selectedWarehouse ? "rgba(229,57,53,0.6)" : "rgba(23,28,143,0.25)"
                        }`,
                      "&:hover": {
                        borderColor: !!errors.selectedWarehouse ? "rgba(229,57,53,0.8)" : "rgba(23,28,143,0.45)",
                      },
                      "&:focus-within": {
                        borderColor: !!errors.selectedWarehouse ? "rgba(229,57,53,1)" : "#171c8f",
                      },
                      // компактный заголовок, как label
                      "& legend": {
                        fontSize: 12,
                        opacity: 0.8,
                        padding: "0 6px",
                        //marginLeft: 6,
                      },
                    }}
                  >
                    <legend>Выберите склад:</legend>
                    <RadioGroup
                      value={selectedRadioValue}
                      onChange={handleRadioChange}
                      name="eo-selection"
                      sx={{ display: "flex", flexDirection: "row", justifyContent: "space-evenly" }}
                    >
                      {["A", "B", "C", "D", "E", "Транзит"].map((v) => (
                        <FormControlLabel key={v} value={v} control={<Radio />} label={v} />
                      ))}
                    </RadioGroup>
                    <FormHelperText>{errors.selectedWarehouse}</FormHelperText>
                  </FormControl>
                </Grid>
              )}

              {/* Получатель */}
              <Grid item xs={12}>
                <RecipientAutocomplete
                  value={selectedRecipient}
                  disabled={loading}
                  isEOMissing={isEOMissing}
                  key={key}
                  onSelect={(value) => setSelectedRecipient(value)}
                  error={!!errors.selectedRecipient}
                  helperText={errors.selectedRecipient}
                  onFocus={() => handleFocus("selectedRecipient")}

                />
              </Grid>

              {/* Проблемы */}
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errors.problems}>
                  <InputLabel required id="multiple-chip-label">Выберите проблемы</InputLabel>

                  <Select
                    labelId="multiple-chip-label"
                    id="select-multiple-chip"
                    multiple
                    required
                    disabled={loading}
                    value={problems}
                    onChange={handleChange}
                    onFocus={() => handleFocus("problems")}
                    // ВСТАВЛЯЕМ КРЕСТИК ВНУТРЬ ИНПУТА
                    input={
                      <OutlinedInput
                        label="Выберите проблемы"
                        endAdornment={
                          problems.length > 0 && !loading ? (
                            <InputAdornment position="end" sx={{ mr: 3 }}>
                              <IconButton
                                aria-label="Очистить выбранные проблемы"
                                size="small"
                                edge="end"
                                onClick={(e) => {
                                  e.stopPropagation();     // не открывать меню
                                  e.preventDefault();
                                  setProblems([]);         // очистка выбора
                                  handleFocus("problems"); // снять текст ошибки
                                }}
                                onMouseDown={(e) => e.preventDefault()} // подавить mousedown
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </InputAdornment>
                          ) : null
                        }
                      />
                    }
                    renderValue={(selected) => <OneLineChips values={selected} />}
                    MenuProps={ProblemsMenuProps}
                    sx={{
                      // место под endAdornment + стрелку селекта
                      "& .MuiSelect-select": { pr: "72px" },
                      // стрелка селекта ближе к правому краю
                      "& .MuiSelect-icon": { right: 8 },
                      // выравнивание чипов по центру по высоте
                      "& .MuiSelect-select > *": { verticalAlign: "middle" },
                    }}
                  >
                    {choices.map((choice) => (
                      <MenuItem key={choice} value={choice}>
                        {choice}
                      </MenuItem>
                    ))}
                  </Select>

                  <FormHelperText>{errors.problems}</FormHelperText>
                </FormControl>
              </Grid>


              {/* Быстрые локации */}
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errors.location}>
                  <BtnGroupLocation
                    isEOMissing={isEOMissing}
                    disabled={loading}
                    errors={errors.location}
                    location={location}
                    setLocation={(value) => handleLocationChange(value)}
                    handleFocus={handleFocus}
                  />
                </FormControl>
              </Grid>

              {/* Транспортировка */}
              {isTransportationRequired && (
                <Grid item xs={12}>
                  <TextField
                    error={!!errors?.transportation}
                    helperText={errors?.transportation || ""}
                    type="number"
                    label="Транспортировка"
                    fullWidth
                    disabled={loading}
                    required
                    value={transportation}
                    onChange={(e) => setTransportation(e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={toggleScannerTransportation} size="small">
                            <QrCodeScannerRoundedIcon sx={{ color: "#171c8f" }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              )}

              {/* Сканнер транспортировки */}
              <Grid item xs={12}>
                <Box
                  id="qr-reader"
                  ref={qrReaderRef}
                  sx={{
                    pt: 0,
                    display: scannerTransportationOpen ? "block" : "none",
                    maxWidth: "100%",
                    overflowX: "hidden",
                    borderRadius: 1,
                  }}
                />
              </Grid>

              {/* Другая локация */}
              <Grid item xs={12}>
                <TextField
                  error={!!errors.location}
                  helperText={errors.location}
                  type="text"
                  label="Другое местоположение"
                  fullWidth
                  disabled={loading}
                  required
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onFocus={() => handleFocus("location")}
                />
              </Grid>

              <Box sx={{ height: 96 }} />
            </Grid>

            {/* Нижняя панель действий */}
            <Box
              sx={{
                position: "sticky",
                left: 0,
                right: 0,
                bottom: 0,
                px: 0,
                py: 0,
                zIndex: 10,                                  // чтобы лежала поверх контента
                backdropFilter: "blur(2px) saturate(80%)", // ← РАЗМЫТИЕ + чуть насыщенности
                WebkitBackdropFilter: "blur(3px) saturate(50%)", // Safari
                background:
                  "linear-gradient(180deg, rgba(255, 255, 255, 0.38) 10%, rgba(255,255,255,0.56) 50%)", // полупрозрачный стеклянный градиент
                borderTop: "1px solid rgba(23,28,143,0.10)", // тонкая граница сверху
                boxShadow: "0 -10px 30px rgba(0,0,0,0.08)",  // мягкая тень вверх
                borderRadius: 2,
              }}
            >
              <ButtonGroup
                variant="contained"
                color="inherit"
                fullWidth
                sx={{
                  "& .MuiButtonBase-root": {
                    fontSize: "1.05rem",
                    padding: "0px 0px",
                    height: 56,
                    borderRadius: 2,
                  },
                  background: "transparent",
                  gap: 1,
                }}
              >
                {/* ОДИН Tooltip на ДВЕ кнопки */}
                <Tooltip
                  open={showPhotoTips}
                  arrow
                  placement="top"
                  title="Добавьте фото с камеры или галереи"
                  disableFocusListener
                  disableHoverListener
                  disableTouchListener
                  componentsProps={{
                    tooltip: {
                      sx: {
                        backdropFilter: "blur(6px)",
                        background: "rgba(255,255,255,0.35)",
                        color: "#e53935",
                        border: "1px solid rgba(229,57,53,0.35)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        fontWeight: 600,
                      },
                    },
                    arrow: { sx: { color: "rgba(255,255,255,0.35)" } },
                  }}
                >
                  {/* ВАЖНО: единый ребенок Tooltip — контейнер со ДВУМЯ кнопками */}
                  <Box component="span" sx={{ display: "inline-flex", gap: 1, flex: 1 }}>
                    <Button
                      onClick={openCameraModal}
                      disabled={loading}
                      color={isPhotoEmpty ? "inherit" : "primary"}
                      sx={photoBtnSx(loading, isPhotoEmpty)}
                    >
                      <Badge badgeContent={cameraPhotos.length + cameraVideos.length} color="secondary" overlap="circular">
                        <CameraIcon sx={{ fontSize: 28 }} />
                      </Badge>
                    </Button>

                    <Box {...getRootProps()} style={{ flex: 1 }}>
                      <input
                        {...getInputProps()}
                        id="file-upload"
                        style={{ display: "none" }}
                        aria-label="Загрузить фото"
                        accept=".jpg,.png,.jpeg"
                        type="file"
                        title="Нажмите для загрузки фото"
                      />
                      <label htmlFor="file-upload" style={{ cursor: "pointer", display: "block" }}>
                        <Button
                          disabled={loading}
                          color={isPhotoEmpty ? "inherit" : "primary"}
                          sx={photoBtnSx(loading, isPhotoEmpty)}
                        >
                          <Badge badgeContent={galleryPhotos.length} color="secondary" overlap="circular">
                            <CollectionsIcon sx={{ fontSize: 28 }} />
                          </Badge>
                        </Button>
                      </label>
                    </Box>
                  </Box>
                </Tooltip>

                {/* Отправить */}
                <Button
                  disabled={loading}
                  type="submit"
                  endIcon={loading ? "" : <SendIcon />}
                  sx={buttonSxSubmit}
                >
                  {loading ? (
                    <CircularProgress size={22} sx={{ color: "white" }} />
                  ) : success ? (
                    <>
                      <CheckIcon sx={{ mr: 1 }} />
                      Данные отправлены
                    </>
                  ) : (
                    "Отправить"
                  )}
                </Button>
              </ButtonGroup>
            </Box>

          </form>
        </Box>
      </Container>

      {/* камера */}
      <Modal open={cameraOpen} onClose={closeCameraModal}>
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "center",
            bgcolor: "rgba(0, 0, 0, 0.7)",
            zIndex: 1300,
          }}
        >
          <video
            ref={videoRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: -1,
            }}
            playsInline
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {isRecording && (
            <Box
              sx={{
                position: "absolute",
                top: 20,
                left: "50%",
                transform: "translateX(-50%)",
                bgcolor: "rgba(0,0,0,0.5)",
                color: "white",
                px: 2,
                py: 0.5,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: 1,
                zIndex: 10,
              }}
            >
              <FiberManualRecordIcon sx={{ color: "red", fontSize: 16, animation: "blink 1s infinite" }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {new Date(recordingSeconds * 1000).toISOString().substr(14, 5)}
              </Typography>
              <style>
                {`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}
              </style>
            </Box>
          )}

          {(cameraPhotos.length > 0 || cameraVideos.length > 0) && (
            <Box
              sx={{
                width: "100%",
                height: "16vh", // Еще меньше высота превью
                bgcolor: "rgba(0, 0, 0, 0.35)",
                mb: "0.5vh",
              }}
            >
              <Swiper
                spaceBetween={10}
                slidesPerView={3}
                navigation
                pagination={{ clickable: true, el: ".swiper-pagination" }}
                style={{ height: "100%" }}
              >
                {cameraPhotos.map((photo, index) => (
                  <SwiperSlide key={`photo-${index}`}>
                    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
                      <img
                        src={photo}
                        alt={`Фото ${index + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          color: "white",
                          bgcolor: "rgba(0, 0, 0, 0.6)",
                          px: 0.5,
                        }}
                      >
                        Фото {index + 1}
                      </Typography>
                      <IconButton
                        onClick={() => setCameraPhotos(cameraPhotos.filter((_, i) => i !== index))}
                        sx={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          bgcolor: "rgba(255,0,0,0.7)",
                          color: "white",
                          p: 0.5,
                          "&:hover": { bgcolor: "red" }
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </SwiperSlide>
                ))}
                {cameraVideos.map((video, index) => (
                  <SwiperSlide key={`video-${index}`}>
                    <Box 
                      onClick={() => setPreviewVideoUrl(video.url)}
                      sx={{ position: "relative", width: "100%", height: "100%", bgcolor: "#000", cursor: 'pointer' }}
                    >
                      <Box sx={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <PlayCircleOutlineIcon sx={{ color: "white", fontSize: 48 }} />
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          color: "white",
                          bgcolor: "rgba(0, 0, 0, 0.6)",
                          px: 0.5,
                        }}
                      >
                        Видео {index + 1}
                      </Typography>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          URL.revokeObjectURL(video.url);
                          setCameraVideos(cameraVideos.filter((_, i) => i !== index));
                        }}
                        sx={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          bgcolor: "rgba(255,0,0,0.7)",
                          color: "white",
                          p: 0.5,
                          "&:hover": { bgcolor: "red" }
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </SwiperSlide>
                ))}
                <div className="swiper-pagination" />
              </Swiper>
            </Box>
          )}

          {/* Режимы и Кнопка затвора */}
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.25, // Минимальный зазор
              pb: 0.75,  // Экстремально компактный низ
              pt: 1,     // Меньше верхний отступ
              backdropFilter: "blur(12px)",
              background: "rgba(0,0,0,0.35)",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Liquid Glass Switcher */}
            {!isRecording && (
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  width: 170,
                  height: 38,
                  bgcolor: "rgba(255,255,255,0.1)",
                  borderRadius: 20,
                  p: 0.5,
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                onClick={() => setCameraMode(cameraMode === "photo" ? "video" : "photo")}
              >
                {/* Анимированная стеклянная подложка */}
                <Box
                  sx={{
                    position: "absolute",
                    top: 2,
                    left: cameraMode === "photo" ? 2 : "calc(50% + 1px)",
                    width: "calc(50% - 3px)",
                    height: "calc(100% - 4px)",
                    bgcolor: "rgba(255,255,255,0.25)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                    borderRadius: 18,
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                />
                <Box sx={{ flex: 1, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Typography variant="caption" sx={{ color: "white", fontSize: 13, fontWeight: 800, letterSpacing: 0.5, opacity: cameraMode === "photo" ? 1 : 0.4, transition: "opacity 0.3s" }}>
                    ФОТО
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Typography variant="caption" sx={{ color: "white", fontSize: 13, fontWeight: 800, letterSpacing: 0.5, opacity: cameraMode === "video" ? 1 : 0.4, transition: "opacity 0.3s" }}>
                    ВИДЕО
                  </Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", px: 3.5 }}>
              <IconButton
                onClick={handleCameraSwitch}
                disabled={isRecording}
                sx={{
                  color: "white",
                  bgcolor: "rgba(23,28,143, 0.25)", // Заливка основным цветом
                  p: 1.5,
                  width: 52, // Стандартный размер
                  height: 52,
                  mx: 1, // Отступ от края
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  "&:hover": { bgcolor: "rgba(23,28,143, 0.45)" },
                  "&.Mui-disabled": { opacity: 0 },
                  transition: "all 0.3s ease"
                }}
              >
                <LoopIcon sx={{ fontSize: 26 }} />
              </IconButton>

              {/* Единая умная кнопка затвора */}
              <Box sx={{ position: "relative", width: 88, height: 88, display: "flex", justifyContent: "center", alignItems: "center" }}>
                {isRecording && (
                  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                    <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                    <circle 
                      cx="44" cy="44" r="38" fill="none" stroke="#fff" strokeWidth="4" 
                      strokeDasharray={238.76} 
                      strokeDashoffset={238.76 * (1 - recordingSeconds / 30)}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </svg>
                )}
                <IconButton
                  onClick={cameraMode === "photo" ? capturePhoto : (isRecording ? stopRecording : startRecording)}
                  sx={{
                    width: isRecording ? 52 : 72, // Сделали красную кнопку при записи еще меньше
                    height: isRecording ? 52 : 72,
                    bgcolor: isRecording ? "#e53935" : "white",
                    color: isRecording ? "white" : "#171c8f",
                    transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                    "&:hover": { bgcolor: isRecording ? "#c62828" : "rgba(255,255,255,0.9)" },
                    boxShadow: isRecording ? "0 0 10px rgba(229,57,53,0.4)" : "0 4px 20px rgba(0,0,0,0.3)",
                  }}
                >
                  {isRecording ? (
                    <Box 
                      sx={{ 
                        width: 18, 
                        height: 18, 
                        bgcolor: "white", 
                        borderRadius: "2px",
                        animation: "stopScale 0.2s ease-out" 
                      }} 
                    />
                  ) : (
                    cameraMode === "photo" ? 
                      <CameraIcon sx={{ fontSize: 36, animation: "stopScale 0.2s ease-out" }} /> : 
                      <FiberManualRecordIcon sx={{ fontSize: 36, color: "#e53935", animation: "stopScale 0.2s ease-out" }} />
                  )}
                  <style>
                    {`@keyframes stopScale { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}
                  </style>
                </IconButton>
              </Box>

              <IconButton
                onClick={handleApplyPhotos}
                disabled={isRecording}
                sx={{
                  color: "white",
                  bgcolor: "rgba(23,28,143, 0.25)", // Заливка основным цветом
                  p: 1.5,
                  width: 52, // Стандартный размер
                  height: 52,
                  mx: 1, // Отступ от края
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  position: "relative",
                  "&:hover": { bgcolor: "rgba(23,28,143, 0.45)" },
                  "&.Mui-disabled": { opacity: 0.5 },
                  transition: "all 0.3s ease"
                }}
              >
                <SendIcon sx={{ fontSize: 26 }} />
                {(cameraPhotos.length + cameraVideos.length) > 0 && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      bgcolor: "#595de3",
                      borderRadius: "50%",
                      minWidth: 20,
                      height: 20,
                      px: 0.5,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      border: "2px solid rgba(0,0,0,0.3)",
                    }}
                  >
                    <Typography variant="caption" sx={{ color: "white", fontSize: 11, fontWeight: 800 }}>
                      {cameraPhotos.length + cameraVideos.length}
                    </Typography>
                  </Box>
                )}
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Modal>
      <Modal open={operationDateModalOpen} onClose={() => { }} disableEscapeKeyDown>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 3,
            borderRadius: 2,
            width: "90%",
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography variant="h6" sx={{ textAlign: "center" }}>
            Выберите дату начала смены
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Выберите дату начала смены. Необходимо для корректного учета операций.
          </Typography>
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            Сейчас: {operationDateNowLabel}
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <ButtonGroup
              fullWidth
              sx={{
                "& .MuiButtonBase-root": {
                  borderRadius: 2,
                  minWidth: 0,
                  flex: 1,
                  px: 1,
                },
              }}
            >
              <Button
                onClick={() => handleSelectOperationDate(yesterdayShiftDate)}
                sx={{ py: 0.5 }}
              >
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography variant="button">Вчера</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {formatShiftDate(yesterdayShiftDate)}
                  </Typography>
                </Box>
              </Button>
              <Button
                onClick={() => handleSelectOperationDate(todayShiftDate)}
                sx={{ py: 0.5 }}
              >
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography variant="button">Сегодня</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {formatShiftDate(todayShiftDate)}
                  </Typography>
                </Box>
              </Button>

            </ButtonGroup>
          </Box>
        </Box>
      </Modal>
      <Modal open={dcThuModalOpen} onClose={() => setDcThuModalOpen(false)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 3,
            borderRadius: 2,
            width: "90%",
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography variant="h6">Локальный РЦ</Typography>
          <Typography variant="body2" color="text.secondary">
            Укажите код РЦ (например, 8114). Значение сохранится в браузере и будет
            использовано вместо данных профиля.
          </Typography>
          <TextField
            label="РЦ"
            value={dcThuDraft}
            onChange={(event) => setDcThuDraft(event.target.value)}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel id="dc-thu-duration-label">Срок хранения</InputLabel>
            <Select
              labelId="dc-thu-duration-label"
              value={dcThuDuration}
              label="Срок хранения"
              onChange={(event) => setDcThuDuration(event.target.value)}
            >
              {DC_THU_DURATION_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {dcThuExpiresAt && (
            <Typography variant="body2" color="text.secondary">
              До окончания хранения:{" "}
              {formatRemainingTime(getDcThuRemainingMs())}
            </Typography>
          )}
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button variant="text" onClick={() => setDcThuModalOpen(false)}>
              Отмена
            </Button>
            <Button variant="outlined" onClick={handleClearDcThu}>
              Сбросить
            </Button>
            <Button variant="contained" onClick={handleSaveDcThu}>
              Сохранить
            </Button>
          </Box>
        </Box>
      </Modal>
        <Dialog
          open={duplicateEoDialogOpen}
          onClose={() => {
            setDuplicateEoDialogOpen(false);
            setEoNumber("");
          }}
          PaperProps={{
            sx: { borderRadius: 3, p: 1 }
          }}
        >
          <DialogTitle sx={{ fontWeight: 800 }}>Дубликат ЕО</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Вы уже отправляли заявку с этим номером ЕО ({duplicateEoItem?.THU}) за последние 24 часа. Хотите изменить её?
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ pb: 2, px: 3 }}>
            <Button 
              onClick={() => {
                setDuplicateEoDialogOpen(false);
                setEoNumber("");
              }}
              color="inherit"
              sx={{ fontWeight: 700 }}
            >
              Нет
            </Button>
            <Button
              onClick={() => loadDuplicateEoData(duplicateEoItem?.Id)}
              variant="contained"
              autoFocus
              sx={{ 
                borderRadius: 2,
                fontWeight: 700,
                backgroundImage: "linear-gradient(180deg, #171c8f 0%, #10146a 100%)",
              }}
            >
              Да, изменить
            </Button>
          </DialogActions>
        </Dialog>

        {/* Просмотр видео */}
        <Dialog
          open={!!previewVideoUrl}
          onClose={() => setPreviewVideoUrl(null)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { bgcolor: '#000', borderRadius: 0.5, overflow: 'hidden' }
          }}
        >
          <Box sx={{ position: 'relative', width: '100%', pt: '56.25%', bgcolor: '#000' }}>
            {previewVideoUrl && (
              <video
                src={previewVideoUrl}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                className="swiper-no-swiping"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'auto'
                }}
              />
            )}
            <IconButton
              onClick={() => setPreviewVideoUrl(null)}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.5)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Dialog>
    </ThemeProvider>
  );
};

export default App;

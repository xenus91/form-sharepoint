import React from "react";
import apiClient from "./api";
import { API_BASE_URL } from "../config";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Zoom } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";

function getIdFromQuery() {
  const usp = new URLSearchParams(window.location.search || "");
  return usp.get("ID") || usp.get("Id") || usp.get("id");
}

const prettyDate = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");
const toMonthValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};
const getMonthBoundaries = (monthValue) => {
  const [y, m] = monthValue.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const isImageByName = (name = "") =>
  /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(name);

function pickServerRelUrl(file) {
  return file?.ServerRelativeUrl || file?.ServerRelativePath?.DecodedUrl || "";
}

function fileValueUrl(serverRelativeUrl = "") {
  const enc = encodeURIComponent(serverRelativeUrl).replace(/%2F/gi, "/");
  return `${API_BASE_URL}/web/GetFileByServerRelativeUrl('${enc}')/$value`;
}

function escapeOdataString(value = "") {
  return String(value).replace(/'/g, "''");
}

function isAllowedProfile(profile) {
  const title = String(profile?.title || "").trim().toLowerCase();
  const department = String(profile?.department || "").trim().toLowerCase();
  return title === "начальник смены" && department.includes("группа отгрузки");
}

export default function ItemViewer() {
  const queryId = React.useMemo(() => getIdFromQuery(), []);
  const [isDesktop, setIsDesktop] = React.useState(window.matchMedia("(min-width: 1200px)").matches);

  const [profile, setProfile] = React.useState({ title: "", department: "" });
  const [accessLoading, setAccessLoading] = React.useState(true);
  const [accessError, setAccessError] = React.useState("");

  const [monthValue, setMonthValue] = React.useState("");
  const [authorFilter, setAuthorFilter] = React.useState("all");
  const [authorOptions, setAuthorOptions] = React.useState([]);
  const [listLoading, setListLoading] = React.useState(false);
  const [listItems, setListItems] = React.useState([]);

  const [itemLoading, setItemLoading] = React.useState(true);
  const [itemError, setItemError] = React.useState("");
  const [activeItemId, setActiveItemId] = React.useState(null);
  const [item, setItem] = React.useState(null);
  const [images, setImages] = React.useState([]);

  const swiperRef = React.useRef(null);
  const [isFs, setIsFs] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)");
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const loadItemById = React.useCallback(async (id) => {
    setItemLoading(true);
    setItemError("");
    try {
      const { data } = await apiClient.get(
        `/web/lists/getbytitle('ProblemsPallet')/items(${id})` +
          `?$select=Id,THU,DC_THU,Location1,Shipment,WhNotEO,Problems,Warehouse,Created,` +
          `Recipient/Id,Recipient/Title,Recipient/SCNumberText,Author/Title&$expand=Recipient,Author`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );

      const d = data?.d;
      if (!d) throw new Error("Элемент не найден");

      const problemsArr = Array.isArray(d?.Problems?.results)
        ? d.Problems.results
        : d?.Problems
          ? [d.Problems]
          : [];

      setItem({
        Id: d?.Id,
        THU: d?.THU ?? "",
        DC_THU: d?.DC_THU ?? "",
        RecipientRegion: d?.Recipient?.Title ?? "",
        Recipient: d?.Recipient?.SCNumberText ?? "",
        Warehouse: d?.Warehouse ?? "",
        Location1: d?.Location1 ?? "",
        Shipment: d?.Shipment ?? "",
        WhNotEO: d?.WhNotEO ?? "",
        Problems: problemsArr,
        Author: d?.Author?.Title ?? "",
        Created: d?.Created ?? "",
      });

      const a = await apiClient.get(
        `/web/lists/getbytitle('ProblemsPallet')/items(${id})/AttachmentFiles`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const results = a?.data?.d?.results ?? [];
      const imgs = results
        .filter((f) => isImageByName(f?.FileName))
        .map((f) => {
          const rel = pickServerRelUrl(f);
          return { name: f?.FileName || "", src: rel ? fileValueUrl(rel) : "" };
        })
        .filter((x) => x.src);

      setImages(imgs);
      setActiveItemId(d?.Id ?? null);

      return d;
    } catch (error) {
      console.error(error);
      setItemError("Не удалось загрузить элемент или вложения.");
      return null;
    } finally {
      setItemLoading(false);
    }
  }, []);

  const loadMonthItems = React.useCallback(async (selectedMonth) => {
    if (!selectedMonth) return;

    setListLoading(true);
    try {
      const { startIso, endIso } = getMonthBoundaries(selectedMonth);
      const { data } = await apiClient.get(
        `/web/lists/getbytitle('ProblemsPallet')/items` +
          `?$select=Id,THU,Created,Problems,Attachments,Author/Title` +
          `&$expand=Author` +
          `&$filter=(Created ge datetime'${startIso}' and Created lt datetime'${endIso}' and Attachments eq 1)` +
          `&$orderby=Created desc&$top=500`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );

      const rows = (data?.d?.results ?? []).map((row) => ({
        Id: row?.Id,
        THU: row?.THU ?? "",
        Author: row?.Author?.Title ?? "Не указан",
        Created: row?.Created ?? "",
        Problems: Array.isArray(row?.Problems?.results)
          ? row.Problems.results
          : row?.Problems
            ? [row.Problems]
            : [],
      }));

      const authors = Array.from(new Set(rows.map((r) => r.Author).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ru-RU")
      );

      setListItems(rows);
      setAuthorOptions(authors);
    } catch (error) {
      console.error(error);
      setListItems([]);
      setAuthorOptions([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      setAccessLoading(true);
      setAccessError("");
      try {
        const response = await apiClient.get("/SP.UserProfiles.PeopleManager/GetMyProperties", {
          headers: { Accept: "application/json;odata=verbose" },
        });

        const profileProps = response?.data?.d?.UserProfileProperties?.results ?? [];
        const department = profileProps.find((p) => p.Key === "Department")?.Value || "";
        const title = response?.data?.d?.Title || "";

        if (ignore) return;
        setProfile({ title, department });

        if (!queryId) {
          setAccessError("Не передан параметр ID в URL.");
          return;
        }

        const loaded = await loadItemById(queryId);
        if (!loaded || ignore) return;

        const initialMonth = toMonthValue(loaded?.Created) || toMonthValue(new Date().toISOString());
        setMonthValue(initialMonth);
      } catch (error) {
        console.error(error);
        if (!ignore) setAccessError("Не удалось получить профиль пользователя.");
      } finally {
        if (!ignore) setAccessLoading(false);
      }
    }

    bootstrap();
    return () => {
      ignore = true;
    };
  }, [queryId, loadItemById]);

  React.useEffect(() => {
    loadMonthItems(monthValue);
  }, [monthValue, loadMonthItems]);

  const filteredItems = React.useMemo(() => {
    if (authorFilter === "all") return listItems;
    return listItems.filter((row) => row.Author === authorFilter);
  }, [listItems, authorFilter]);

  const allowed = isAllowedProfile(profile);

  const toggleFullscreen = () => {
    const el = swiperRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  if (accessLoading) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isDesktop) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            Предпросмотр доступен только в desktop-версии.
          </Typography>
          <Typography color="text.secondary">
            Откройте ссылку с параметром ?ID= на экране шириной от 1200px.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (accessError) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 620 }}>
          <Typography color="error">{accessError}</Typography>
        </Paper>
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 760 }}>
          <Typography variant="h6" gutterBottom>
            Доступ к расширенному предпросмотру ограничен.
          </Typography>
          <Typography color="text.secondary">
            Требуется должность «Начальник смены» и подразделение, содержащее «Группа отгрузки».
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "fixed", inset: 0, display: "flex", bgcolor: "#000" }}>
      <Box ref={swiperRef} sx={{ position: "relative", flex: 1, minWidth: 0, bgcolor: "black" }}>
        {itemLoading ? (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : itemError || !item ? (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography color="error">{itemError || "Элемент не найден."}</Typography>
            </Paper>
          </Box>
        ) : images.length === 0 ? (
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <Typography sx={{ color: "white", opacity: 0.7 }}>Вложений-изображений нет</Typography>
          </Box>
        ) : (
          <Swiper
            modules={[Navigation, Pagination, Zoom]}
            navigation
            pagination={{ clickable: true }}
            zoom={{ maxRatio: 3 }}
            slidesPerView={1}
            style={{ width: "100%", height: "100%" }}
          >
            {images.map((f, i) => (
              <SwiperSlide key={`${f.name}-${i}`}>
                <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                  <img
                    alt={f.name || `Фото ${i + 1}`}
                    src={f.src}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        )}

        <Tooltip title={isFs ? "Выйти из полноэкранного" : "Открыть на весь экран"}>
          <IconButton
            onClick={toggleFullscreen}
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 5,
              bgcolor: "rgba(0,0,0,0.4)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(0,0,0,0.55)" },
            }}
            size="large"
          >
            {isFs ? <FullscreenExitIcon fontSize="large" /> : <FullscreenIcon fontSize="large" />}
          </IconButton>
        </Tooltip>

        {item && (
          <Paper
            elevation={0}
            sx={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
              p: 1.5,
              color: "#fff",
              bgcolor: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
              <Typography><b>ID:</b> {item.Id}</Typography>
              <Typography><b>ЕО:</b> {item.THU || "—"}</Typography>
              <Typography><b>РЦ:</b> {item.DC_THU || "—"}</Typography>
              <Typography><b>Автор:</b> {item.Author || "—"}</Typography>
              <Typography><b>Создан:</b> {prettyDate(item.Created)}</Typography>
            </Stack>
            {item.Problems?.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                {item.Problems.map((p, idx) => (
                  <Chip key={`${p}-${idx}`} label={p} size="small" sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }} variant="outlined" />
                ))}
              </Stack>
            )}
          </Paper>
        )}
      </Box>

      <Box
        sx={{
          width: 390,
          borderLeft: "1px solid #d8d8d8",
          bgcolor: "#fff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ p: 2, borderBottom: "1px solid #e8e8e8" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Элементы с вложениями
          </Typography>

          <Stack spacing={1.5}>
            <TextField
              size="small"
              type="month"
              label="Месяц"
              InputLabelProps={{ shrink: true }}
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />

            <FormControl size="small" fullWidth>
              <InputLabel id="author-filter-label">Автор</InputLabel>
              <Select
                labelId="author-filter-label"
                value={authorFilter}
                label="Автор"
                onChange={(e) => setAuthorFilter(e.target.value)}
              >
                <MenuItem value="all">Все авторы</MenuItem>
                {authorOptions.map((author) => (
                  <MenuItem key={author} value={escapeOdataString(author).replace(/''/g, "'")}>
                    {author}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Box>

        <Box sx={{ p: 1.5, flex: 1, overflowY: "auto" }}>
          {listLoading ? (
            <Box sx={{ py: 4, display: "grid", placeItems: "center" }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredItems.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 1 }}>
              За выбранный период нет элементов с вложениями.
            </Typography>
          ) : (
            filteredItems.map((row) => (
              <Paper
                key={row.Id}
                onClick={() => loadItemById(row.Id)}
                sx={{
                  p: 1.25,
                  mb: 1,
                  cursor: "pointer",
                  border: activeItemId === row.Id ? "1px solid #171c8f" : "1px solid #ececec",
                  boxShadow: activeItemId === row.Id ? "0 0 0 2px rgba(23,28,143,0.12)" : "none",
                }}
              >
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography fontWeight={700}>ID {row.Id}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {prettyDate(row.Created)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.3 }}>
                  <b>ЕО:</b> {row.THU || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <b>Автор:</b> {row.Author || "—"}
                </Typography>
                {row.Problems?.length > 0 && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
                    {row.Problems.slice(0, 3).map((problem, idx) => (
                      <Chip key={`${row.Id}-${idx}`} label={problem} size="small" />
                    ))}
                    {row.Problems.length > 3 && <Chip size="small" label={`+${row.Problems.length - 3}`} />}
                  </Stack>
                )}
              </Paper>
            ))
          )}
        </Box>

        <Divider />
        <Box sx={{ p: 1.25 }}>
          <Typography variant="caption" color="text.secondary">
            Профиль: {profile.title || "—"} / {profile.department || "—"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

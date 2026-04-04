import React from "react";
import apiClient, { normalizeNextUrl } from "./api";
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
  Button,
  Popover,
  InputAdornment,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Zoom } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";

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

function isAllowedProfile(profile) {
  const title = String(profile?.title || "").trim().toLowerCase();
  const department = String(profile?.department || "").trim().toLowerCase();
  return title === "начальник смены" && department.includes("группа отгрузки");
}

function toAllowedPayload(userProfile) {
  return {
    title: userProfile?.userTitle,
    department: userProfile?.userDepartment,
  };
}

export default function ManagerPreview({ userProfile, onBack }) {
  const [isDesktop, setIsDesktop] = React.useState(window.matchMedia("(min-width: 1200px)").matches);

  const [monthValue, setMonthValue] = React.useState(toMonthValue(new Date().toISOString()));
  const [authorFilter, setAuthorFilter] = React.useState("all");
  const [problemFilter, setProblemFilter] = React.useState("all");
  const [sortOrder, setSortOrder] = React.useState("desc");
  const [authorOptions, setAuthorOptions] = React.useState([]);
  const [problemOptions, setProblemOptions] = React.useState([]);
  const [listLoading, setListLoading] = React.useState(false);
  const [listItems, setListItems] = React.useState([]);

  const [itemLoading, setItemLoading] = React.useState(false);
  const [itemError, setItemError] = React.useState("");
  const [activeItemId, setActiveItemId] = React.useState(null);
  const [item, setItem] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [problemsAnchorEl, setProblemsAnchorEl] = React.useState(null);
  const [problemsPopoverList, setProblemsPopoverList] = React.useState([]);
  const [problemsPopoverTitle, setProblemsPopoverTitle] = React.useState("");

  const swiperRef = React.useRef(null);
  const [isFs, setIsFs] = React.useState(false);
  const [swiperInstance, setSwiperInstance] = React.useState(null);
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0);
  const detailsCacheRef = React.useRef(new Map());
  const requestSeqRef = React.useRef(0);
  const monthInputRef = React.useRef(null);

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

  React.useEffect(() => {
    if (!swiperInstance) return;
    if (activeSlideIndex >= images.length) {
      setActiveSlideIndex(0);
      swiperInstance.slideTo(0, 0);
    }
  }, [activeSlideIndex, images.length, swiperInstance]);

  const loadItemById = React.useCallback(async (id) => {
    if (!id) return null;
    setActiveItemId(id);

    const cached = detailsCacheRef.current.get(id);
    if (cached) {
      setItem(cached.item);
      setImages(cached.images);
      setActiveSlideIndex(0);
      setItemError("");
      return cached.raw;
    }

    const requestSeq = ++requestSeqRef.current;
    setItemLoading(true);
    setItemError("");

    try {
      const [itemResp, attachmentsResp] = await Promise.all([
        apiClient.get(
          `/web/lists/getbytitle('ProblemsPallet')/items(${id})` +
            `?$select=Id,THU,DC_THU,Location1,Shipment,WhNotEO,Problems,Warehouse,Created,` +
            `Recipient/Id,Recipient/Title,Recipient/SCNumberText,Author/Title&$expand=Recipient,Author`,
          { headers: { Accept: "application/json;odata=verbose" } }
        ),
        apiClient.get(
          `/web/lists/getbytitle('ProblemsPallet')/items(${id})/AttachmentFiles`,
          { headers: { Accept: "application/json;odata=verbose" } }
        ),
      ]);

      if (requestSeq !== requestSeqRef.current) return null;

      const d = itemResp?.data?.d;
      if (!d) throw new Error("Элемент не найден");

      const problemsArr = Array.isArray(d?.Problems?.results)
        ? d.Problems.results
        : d?.Problems
          ? [d.Problems]
          : [];

      const mappedItem = {
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
      };
      const results = attachmentsResp?.data?.d?.results ?? [];
      const imgs = results
        .filter((f) => isImageByName(f?.FileName))
        .map((f) => {
          const rel = pickServerRelUrl(f);
          return { name: f?.FileName || "", src: rel ? fileValueUrl(rel) : "" };
        })
        .filter((x) => x.src);

      detailsCacheRef.current.set(id, { item: mappedItem, images: imgs, raw: d });

      setItem(mappedItem);
      setImages(imgs);
      setActiveSlideIndex(0);
      return d;
    } catch (error) {
      console.error(error);
      setItemError("Не удалось загрузить элемент или вложения.");
      return null;
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setItemLoading(false);
      }
    }
  }, []);

  const loadMonthItems = React.useCallback(async (selectedMonth) => {
    if (!selectedMonth) return;

    setListLoading(true);
    try {
      const { startIso, endIso } = getMonthBoundaries(selectedMonth);
      let nextUrl =
        `/web/lists/getbytitle('ProblemsPallet')/items` +
        `?$select=Id,THU,Created,Problems,Attachments,Author/Title` +
        `&$expand=Author` +
        `&$filter=(OperationDate ge datetime'${startIso}' and OperationDate lt datetime'${endIso}' and Attachments eq 1)` +
        `&$orderby=Created desc&$top=500`;

      const allRows = [];

      while (nextUrl) {
        const { data } = await apiClient.get(nextUrl, {
          headers: { Accept: "application/json;odata=verbose" },
        });

        const pageRows = data?.d?.results ?? [];
        allRows.push(...pageRows);
        nextUrl = normalizeNextUrl(data?.d?.__next) || null;
      }

      const rows = allRows.map((row) => ({
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
      const problems = Array.from(
        new Set(rows.flatMap((r) => r.Problems || []).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "ru-RU"));

      setListItems(rows);
      setAuthorOptions(authors);
      setProblemOptions(problems);
    } catch (error) {
      console.error(error);
      setListItems([]);
      setAuthorOptions([]);
      setProblemOptions([]);
    } finally {
      setListLoading(false);
    }
  }, []);


  const allowed = isAllowedProfile(toAllowedPayload(userProfile));

  React.useEffect(() => {
    if (!allowed) return;
    setAuthorFilter("all");
    setProblemFilter("all");
    loadMonthItems(monthValue);
  }, [allowed, monthValue, loadMonthItems]);

  const filteredItems = React.useMemo(() => {
    let result = listItems;
    if (authorFilter !== "all") {
      result = result.filter((row) => row.Author === authorFilter);
    }
    if (problemFilter !== "all") {
      result = result.filter((row) => (row.Problems || []).includes(problemFilter));
    }
    const sorted = [...result].sort((a, b) => {
      const aTs = new Date(a.Created || 0).getTime();
      const bTs = new Date(b.Created || 0).getTime();
      return sortOrder === "asc" ? aTs - bTs : bTs - aTs;
    });
    return sorted;
  }, [listItems, authorFilter, problemFilter, sortOrder]);

  const toggleFullscreen = () => {
    const el = swiperRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleOpenProblemsPopover = (event, row) => {
    setProblemsAnchorEl(event.currentTarget);
    setProblemsPopoverList(row?.Problems || []);
    setProblemsPopoverTitle(`ID ${row?.Id ?? ""}`);
  };

  const handleCloseProblemsPopover = () => {
    setProblemsAnchorEl(null);
  };


  if (!isDesktop) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            Меню просмотра менеджерами доступно только в desktop-версии.
          </Typography>
          <Typography color="text.secondary">
            Откройте этот режим на экране шириной от 1200px.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 760 }}>
          <Typography variant="h6" gutterBottom>
            Доступ к меню просмотра менеджерами ограничен.
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
        <Box sx={{ position: "absolute", top: 12, left: 12, zIndex: 6, display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            onClick={onBack}
            sx={{
              color: "#fff",
              borderColor: "rgba(255,255,255,0.45)",
              bgcolor: "rgba(10,10,10,0.32)",
              backdropFilter: "blur(16px) saturate(140%)",
              WebkitBackdropFilter: "blur(16px) saturate(140%)",
              "&:hover": {
                borderColor: "rgba(255,255,255,0.7)",
                bgcolor: "rgba(10,10,10,0.45)",
              },
            }}
          >
            Назад в форму
          </Button>
        </Box>

        {!item ? (
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <Typography sx={{ color: "white", opacity: 0.8 }}>
              Выберите элемент справа, чтобы открыть фотографии.
            </Typography>
          </Box>
        ) : itemLoading ? (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : itemError ? (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography color="error">{itemError}</Typography>
            </Paper>
          </Box>
        ) : images.length === 0 ? (
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <Typography sx={{ color: "white", opacity: 0.7 }}>Вложений-изображений нет</Typography>
          </Box>
        ) : (
          <Swiper
            modules={[Pagination, Zoom]}
            onSwiper={setSwiperInstance}
            onSlideChange={(swiper) => setActiveSlideIndex(swiper.activeIndex || 0)}
            pagination={{ clickable: true }}
            zoom={{ maxRatio: 3 }}
            slidesPerView={1}
            speed={280}
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

        {item && images.length > 1 && (
          <>
            {activeSlideIndex > 0 && (
              <IconButton
                onClick={(event) => {
                  event.stopPropagation();
                  swiperInstance?.slidePrev();
                }}
                sx={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 7,
                  bgcolor: "rgba(0,0,0,0.42)",
                  color: "#fff",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.58)" },
                  "&:focus, &:focus-visible": {
                    outline: "none",
                    boxShadow: "none",
                  },
                }}
              >
                <ChevronLeftIcon />
              </IconButton>
            )}
            {activeSlideIndex < images.length - 1 && (
              <IconButton
                onClick={(event) => {
                  event.stopPropagation();
                  swiperInstance?.slideNext();
                }}
                sx={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 7,
                  bgcolor: "rgba(0,0,0,0.42)",
                  color: "#fff",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.58)" },
                  "&:focus, &:focus-visible": {
                    outline: "none",
                    boxShadow: "none",
                  },
                }}
              >
                <ChevronRightIcon />
              </IconButton>
            )}
          </>
        )}

        {item && (
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
        )}

        {item && (
          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 6,
              display: "flex",
              justifyContent: "center",
              px: 1.5,
              pb: 0.75,
              pointerEvents: "none",
            }}
          >
            <Paper
              elevation={0}
              sx={{
                width: { xs: "100%", sm: "72%" },
                p: 1.5,
                borderRadius: "24px 24px 0 0",
                color: "#fff",
                bgcolor: "rgba(10,10,10,0.32)",
                border: "1px solid rgba(255,255,255,0.35)",
                backdropFilter: "blur(18px) saturate(150%)",
                WebkitBackdropFilter: "blur(18px) saturate(150%)",
                pointerEvents: "auto",
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
                    <Chip
                      key={`${p}-${idx}`}
                      label={p}
                      size="small"
                      sx={{
                        color: "white",
                        borderColor: "rgba(255,255,255,0.6)",
                        bgcolor: "rgba(255,255,255,0.08)",
                        "& .MuiChip-label": { color: "#fff" },
                      }}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              )}
            </Paper>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: 390,
          borderLeft: "1px solid rgba(255,255,255,0.35)",
          bgcolor: "rgba(10, 10, 10, 0.35)",
          backdropFilter: "blur(20px) saturate(150%) contrast(1.05)",
          WebkitBackdropFilter: "blur(20px) saturate(150%) contrast(1.05)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ p: 2, borderBottom: "1px solid rgba(255,255,255,0.25)" }}>
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
              inputRef={monthInputRef}
              onChange={(e) => setMonthValue(e.target.value)}
              onClick={() => monthInputRef.current?.showPicker?.()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <CalendarMonthIcon
                      sx={{ color: "rgba(255,255,255,0.9)", cursor: "pointer" }}
                      onClick={() => monthInputRef.current?.showPicker?.()}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                },
                "& .MuiInputBase-input": {
                  colorScheme: "dark",
                },
                "& .MuiInputBase-input::-webkit-calendar-picker-indicator": {
                  opacity: 0,
                  width: 0,
                },
                "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.8)" },
              }}
            />

            <FormControl size="small" fullWidth>
              <InputLabel id="author-filter-label" sx={{ color: "rgba(255,255,255,0.8)" }}>Автор</InputLabel>
              <Select
                labelId="author-filter-label"
                value={authorFilter}
                label="Автор"
                onChange={(e) => setAuthorFilter(e.target.value)}
                sx={{
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: "rgba(20,20,20,0.95)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.2)",
                    },
                  },
                }}
              >
                <MenuItem value="all">Все авторы</MenuItem>
                {authorOptions.map((author) => (
                  <MenuItem key={author} value={author}>
                    {author}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="problem-filter-label" sx={{ color: "rgba(255,255,255,0.8)" }}>Проблема</InputLabel>
              <Select
                labelId="problem-filter-label"
                value={problemFilter}
                label="Проблема"
                onChange={(e) => setProblemFilter(e.target.value)}
                sx={{
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: "rgba(20,20,20,0.95)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.2)",
                    },
                  },
                }}
              >
                <MenuItem value="all">Все проблемы</MenuItem>
                {problemOptions.map((problem) => (
                  <MenuItem key={problem} value={problem}>
                    {problem}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="sort-order-label" sx={{ color: "rgba(255,255,255,0.8)" }}>Сортировка даты</InputLabel>
              <Select
                labelId="sort-order-label"
                value={sortOrder}
                label="Сортировка даты"
                onChange={(e) => setSortOrder(e.target.value)}
                sx={{
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: "rgba(20,20,20,0.95)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.2)",
                    },
                  },
                }}
              >
                <MenuItem value="desc">Сначала новые</MenuItem>
                <MenuItem value="asc">Сначала старые</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Box>

        <Box
          sx={{
            p: 1.5,
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(190,190,190,0.45) rgba(25,25,25,0.55)",
            "&::-webkit-scrollbar": {
              width: 10,
            },
            "&::-webkit-scrollbar-track": {
              background: "rgba(25,25,25,0.55)",
              borderRadius: 10,
            },
            "&::-webkit-scrollbar-thumb": {
              background: "linear-gradient(180deg, rgba(185,185,185,0.5), rgba(145,145,145,0.55))",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              background: "linear-gradient(180deg, rgba(210,210,210,0.65), rgba(165,165,165,0.7))",
            },
          }}
        >
          {listLoading ? (
            <Box sx={{ py: 4, display: "grid", placeItems: "center" }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredItems.length === 0 ? (
            <Typography sx={{ p: 1, color: "rgba(255,255,255,0.75)" }}>
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
                  color: "#fff",
                  bgcolor: activeItemId === row.Id ? "rgba(90,120,255,0.2)" : "rgba(255,255,255,0.08)",
                  border: activeItemId === row.Id ? "1px solid rgba(140,170,255,0.85)" : "1px solid rgba(255,255,255,0.2)",
                  boxShadow: activeItemId === row.Id ? "0 0 0 2px rgba(140,170,255,0.25)" : "none",
                }}
              >
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography fontWeight={700}>ID {row.Id}</Typography>
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)" }}>
                    {prettyDate(row.Created)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.3 }}>
                  <b>ЕО:</b> {row.THU || "—"}
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)" }}>
                  <b>Автор:</b> {row.Author || "—"}
                </Typography>
                {row.Problems?.length > 0 && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
                    <Chip
                      label={row.Problems[0]}
                      size="small"
                      sx={{
                        color: "#fff",
                        bgcolor: "rgba(255,255,255,0.14)",
                        border: "1px solid rgba(255,255,255,0.35)",
                        "& .MuiChip-label": { color: "#fff" },
                      }}
                    />
                    {row.Problems.length > 1 && (
                      <Chip
                        clickable
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenProblemsPopover(event, row);
                        }}
                        size="small"
                        label={`+${row.Problems.length - 1}`}
                        sx={{
                          color: "#fff",
                          bgcolor: "rgba(120,150,255,0.25)",
                          border: "1px solid rgba(180,205,255,0.6)",
                          "& .MuiChip-label": { color: "#fff", fontWeight: 700 },
                        }}
                      />
                    )}
                  </Stack>
                )}
              </Paper>
            ))
          )}
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.25)" }} />
        <Box sx={{ p: 1.25 }}>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)" }}>
            Профиль: {userProfile?.userTitle || "—"} / {userProfile?.userDepartment || "—"}
          </Typography>
        </Box>
      </Box>

      <Popover
        open={Boolean(problemsAnchorEl)}
        anchorEl={problemsAnchorEl}
        onClose={handleCloseProblemsPopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            mt: 0.75,
            p: 1.25,
            minWidth: 260,
            maxWidth: 420,
            bgcolor: "rgba(18,18,18,0.95)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
          Проблемы {problemsPopoverTitle}
        </Typography>
        <Stack spacing={0.5}>
          {problemsPopoverList.map((problem, idx) => (
            <Typography key={`${problem}-${idx}`} variant="body2">
              • {problem}
            </Typography>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}

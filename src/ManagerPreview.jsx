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
  Grid,
  Skeleton,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Zoom, FreeMode, Thumbs } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";

const DEBUG = false;
const log = (...a) => DEBUG && console.log("[ManagerPreview]", ...a);

const FONT = { xs: 18, sm: 20, md: 22, lg: 24 };
const LINE = 1.2;

const FieldCompact = ({ label, value, mono, maxCh, minCh, forceFull = false }) => {
    const valueSx = forceFull
        ? {
            whiteSpace: "nowrap",
            overflow: "visible",
            textOverflow: "clip",
            minWidth: minCh ? `${minCh}ch` : undefined,
            maxWidth: "none",
        }
        : {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: minCh ? `${minCh}ch` : undefined,
            maxWidth: maxCh ? `${maxCh}ch` : undefined,
        };

    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography
                sx={{
                    fontSize: FONT,
                    lineHeight: LINE,
                    color: "rgba(255,255,255,0.9)",
                    letterSpacing: 0.2,
                    whiteSpace: "nowrap",
                    textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                    fontWeight: 700,
                }}
            >
                {label}:
            </Typography>
            <Typography
                sx={{
                    fontWeight: 800,
                    fontSize: FONT,
                    lineHeight: LINE,
                    color: "#fff",
                    textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                    ...(mono ? { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas" } : {}),
                    minWidth: 0,
                    ...valueSx,
                }}
                title={!forceFull ? String(value || "") : undefined}
            >
                {value ?? "—"}
            </Typography>
        </Stack>
    );
};

const prettyDate = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");

function getDefaultValue(type) {
  const now = new Date();
  if (type === "month") {
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${m}`;
  } else if (type === "day") {
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  } else if (type === "week") {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
}

function getPeriodBoundaries(type, value) {
  if (!value) return null;
  if (type === "month") {
    const [y, m] = value.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  } else if (type === "day") {
    const [y, m, d] = value.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + 1));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  } else if (type === "week") {
    const match = value.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    const y = parseInt(match[1], 10);
    const w = parseInt(match[2], 10);
    const d = new Date(Date.UTC(y, 0, 4));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() || 7) + 1 + (w - 1) * 7);
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
}

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

function getOfficeSuffix(office) {
  if (!office) return "";
  const parts = office.split("-");
  return parts.length > 1 ? parts[1].trim() : office.trim();
}

function toAllowedPayload(userProfile) {
  return {
    title: userProfile?.userTitle,
    department: userProfile?.userDepartment,
  };
}

const ManagerListItem = React.memo(({ row, isActive, loadItemById, handleOpenProblemsPopover }) => {
  return (
    <Paper
      id={`manager-item-${row.Id}`}
      onClick={() => loadItemById(row.Id)}
      sx={{
        p: 1.25,
        mb: 1,
        cursor: "pointer",
        color: "#fff",
        bgcolor: isActive ? "rgba(90,120,255,0.2)" : "rgba(255,255,255,0.08)",
        border: isActive ? "1px solid rgba(140,170,255,0.85)" : "1px solid rgba(255,255,255,0.2)",
        boxShadow: isActive ? "0 0 0 2px rgba(140,170,255,0.25)" : "none",
        willChange: "background-color, border-color, box-shadow",
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
  );
});

export default function ManagerPreview({ userProfile, onBack }) {
  const [isDesktop, setIsDesktop] = React.useState(window.matchMedia("(min-width: 1200px)").matches);

  const [periodType, setPeriodType] = React.useState("month");
  const [periodValue, setPeriodValue] = React.useState(getDefaultValue("month"));
  const [authorFilter, setAuthorFilter] = React.useState("all");
  const [problemFilter, setProblemFilter] = React.useState("all");
  const [sortOrder, setSortOrder] = React.useState("desc");
  const [authorOptions, setAuthorOptions] = React.useState([]);
  const [problemOptions, setProblemOptions] = React.useState([]);
  const [listLoading, setListLoading] = React.useState(false);
  const [listItems, setListItems] = React.useState([]);
  const listItemsRef = React.useRef([]);

  const [itemLoading, setItemLoading] = React.useState(false);
  const [itemError, setItemError] = React.useState("");
  const [activeItemId, setActiveItemId] = React.useState(null);
  const [item, setItem] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [problemsAnchorEl, setProblemsAnchorEl] = React.useState(null);
  const [problemsPopoverList, setProblemsPopoverList] = React.useState([]);
  const [problemsPopoverTitle, setProblemsPopoverTitle] = React.useState("");

  const swiperRef = React.useRef(null);
  const mainSwiperRef = React.useRef(null);
  const [isFs, setIsFs] = React.useState(false);
  const [fsFallback, setFsFallback] = React.useState(false);
  const [thumbsSwiper, setThumbsSwiper] = React.useState(null);
  const detailsCacheRef = React.useRef(new Map());
  const requestSeqRef = React.useRef(0);
  const monthInputRef = React.useRef(null);

  const [expanded, setExpanded] = React.useState(false);
  const handleRef = React.useRef(null);
  const headerRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [collapsedH, setCollapsedH] = React.useState(112);
  const [expandedH, setExpandedH] = React.useState(360);

  const BODY_GAP_EXP = 10;
  const PB_COLL = 10;
  const PB_EXP = 14;
  const MIN_COLLAPSED = 96;
  const MIN_EXPANDED = 140;
  const SAFETY = 2;

  const computeHeightsNow = React.useCallback(() => {
      const wH = window.innerHeight || 600;
      const handleH = handleRef.current?.offsetHeight || 0;
      const headerH = headerRef.current?.scrollHeight || 0;
      const bodyH = bodyRef.current?.scrollHeight || 0;

      if (headerH < 12 || handleH < 4) {
          const collapsedFinal = Math.max(MIN_COLLAPSED, 112);
          const expandedFinal = Math.max(MIN_EXPANDED, Math.min(wH - 8, collapsedFinal + 280));
          return { collapsedFinal, expandedFinal };
      }

      const collapsedFinal = Math.round(handleH + headerH + PB_COLL + SAFETY);
      const full = Math.round(handleH + headerH + BODY_GAP_EXP + bodyH + PB_EXP + SAFETY);
      const viewportMax = Math.max(wH - 8, collapsedFinal + 1);
      const expandedFinal = Math.min(full, viewportMax);

      return {
          collapsedFinal: Math.max(collapsedFinal, MIN_COLLAPSED),
          expandedFinal: Math.max(expandedFinal, MIN_EXPANDED),
      };
  }, []);

  const applyHeights = React.useCallback(() => {
      const { collapsedFinal, expandedFinal } = computeHeightsNow();
      setCollapsedH(collapsedFinal);
      setExpandedH(expandedFinal);
  }, [computeHeightsNow]);

  React.useLayoutEffect(() => {
      if (!item) return;
      let raf = 0;
      let tries = 0;
      const tick = () => {
          tries += 1;
          applyHeights();
          const headerH = headerRef.current?.scrollHeight || 0;
          if (headerH < 20 && tries < 24) {
              raf = requestAnimationFrame(tick);
          }
      };
      tick();
      return () => cancelAnimationFrame(raf);
  }, [item, applyHeights]);

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
      const onResize = () => applyHeights();
      window.addEventListener("resize", onResize);
      document.fonts?.ready?.then(applyHeights).catch(() => { });
      return () => window.removeEventListener("resize", onResize);
  }, [applyHeights]);

  React.useEffect(() => {
      const ro = new ResizeObserver(() => applyHeights());
      handleRef.current && ro.observe(handleRef.current);
      headerRef.current && ro.observe(headerRef.current);
      bodyRef.current && ro.observe(bodyRef.current);
      return () => ro.disconnect();
  }, [applyHeights]);

  const handleToggle = React.useCallback(() => {
      applyHeights();
      setExpanded((v) => !v);
  }, [applyHeights]);

  const loadItemById = React.useCallback(async (id) => {
    if (!id) return null;
    setActiveItemId(id);

    const cached = detailsCacheRef.current.get(id);
    if (cached) {
      setItem(cached.item);
      setImages(cached.images);
      setItemError("");
      return cached.raw;
    }

    // --- Оптимистичный UI ---
    const row = listItemsRef.current.find(r => r.Id === id);
    if (row) {
        setItem({
            Id: row.Id,
            THU: row.THU || "",
            Author: row.Author || "",
            Created: row.Created || "",
            Problems: row.Problems || [],
            DC_THU: "", Warehouse: "", Recipient: "", RecipientRegion: "", Location1: "", Shipment: "", WhNotEO: ""
        });
        setImages([]);
    }

    setItemLoading(true);
    setItemError("");

    const requestSeq = ++requestSeqRef.current;

    setTimeout(async () => {
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
    }, 0);
  }, []);

  const loadMonthItems = React.useCallback(async (pType, pValue) => {
    if (!pValue) return;

    setListLoading(true);
    try {
      const bounds = getPeriodBoundaries(pType, pValue);
      if (!bounds) throw new Error("Invalid period");
      const { startIso, endIso } = bounds;

      const dcThu = getOfficeSuffix(userProfile?.userOffice);
      const dcThuFilter = dcThu ? ` and DC_THU eq '${dcThu}'` : "";

      let nextUrl =
        `/web/lists/getbytitle('ProblemsPallet')/items` +
        `?$select=Id,THU,Created,Problems,Attachments,Author/Title` +
        `&$expand=Author` +
        `&$filter=(OperationDate ge datetime'${startIso}' and OperationDate lt datetime'${endIso}' and Attachments eq 1${dcThuFilter})` +
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
      listItemsRef.current = rows;
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
  }, [userProfile]);


  const allowed = isAllowedProfile(toAllowedPayload(userProfile));

  React.useEffect(() => {
    if (!allowed) return;
    setAuthorFilter("all");
    setProblemFilter("all");
    loadMonthItems(periodType, periodValue);
  }, [allowed, periodType, periodValue, loadMonthItems]);

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

  React.useEffect(() => {
    if (activeItemId) {
      const el = document.getElementById(`manager-item-${activeItemId}`);
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "auto", block: "nearest" });
      }
    }
  }, [activeItemId]);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        
        const currentIndex = filteredItems.findIndex(r => r.Id === activeItemId);
        let nextIndex = 0;
        
        if (currentIndex === -1) {
          nextIndex = 0;
        } else if (e.key === "ArrowUp") {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        } else if (e.key === "ArrowDown") {
          nextIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : filteredItems.length - 1;
        }

        const nextItem = filteredItems[nextIndex];
        if (nextItem && nextItem.Id !== activeItemId) {
          loadItemById(nextItem.Id);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!mainSwiperRef.current) return;
        if (e.key === "ArrowLeft") {
          mainSwiperRef.current.slidePrev();
        } else if (e.key === "ArrowRight") {
          mainSwiperRef.current.slideNext();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeItemId, filteredItems, loadItemById]);

  const toggleFullscreen = () => {
    const el = swiperRef.current;
    if (!document.fullscreenElement) {
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFsFallback(true));
      else setFsFallback(true);
    } else document.exitFullscreen?.();
  };

  const handleOpenProblemsPopover = React.useCallback((event, row) => {
    setProblemsAnchorEl(event.currentTarget);
    setProblemsPopoverList(row?.Problems || []);
    setProblemsPopoverTitle(`ID ${row?.Id ?? ""}`);
  }, []);

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
      <Box ref={swiperRef} sx={{ position: "relative", flex: 1, minWidth: 0, bgcolor: "black", overflow: "hidden" }}>
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
        ) : itemError ? (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2, zIndex: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Typography color="error">{itemError}</Typography>
            </Paper>
          </Box>
        ) : (
          <>
            {itemLoading ? (
              <Box sx={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", justifyContent: "center", alignItems: "center", bgcolor: "transparent" }}>
                <CircularProgress />
              </Box>
            ) : images.length === 0 ? (
              <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                <Typography sx={{ color: "white", opacity: 0.7, fontSize: FONT, lineHeight: LINE }}>
                  Вложений-изображений нет
                </Typography>
              </Box>
            ) : (
                <Swiper
                    onSwiper={(s) => { mainSwiperRef.current = s; }}
                    modules={[Navigation, Pagination, Zoom, Thumbs]}
                    navigation
                    pagination={{ clickable: true }}
                    zoom={{ maxRatio: 3 }}
                    spaceBetween={12}
                    slidesPerView={1}
                    style={{ width: "100%", height: "100%" }}
                    thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                >
                    {images.map((f, i) => (
                        <SwiperSlide key={i}>
                            <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                                <img alt={f.name || `Фото ${i + 1}`} src={f.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>
            )}

            {/* Пояс миниатюр (thumbs) — СВЕРХУ, по центру */}
            {images.length > 1 && (
                <Box
                    sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 12,
                        zIndex: 5,
                        display: "flex",
                        justifyContent: "center",
                        pointerEvents: "none",
                    }}
                >
                    <Box
                        sx={{
                            pointerEvents: "auto",
                            bgcolor: "rgba(0,0,0,0.35)",
                            border: "1px solid rgba(255,255,255,0.35)",
                            backdropFilter: "blur(8px) saturate(140%)",
                            WebkitBackdropFilter: "blur(8px) saturate(140%)",
                            borderRadius: "12px",
                            px: 1,
                            py: 0.5,
                            maxWidth: "min(90vw, 680px)",
                        }}
                    >
                        <Swiper
                            className="thumbs-swiper"
                            onSwiper={setThumbsSwiper}
                            modules={[FreeMode, Thumbs]}
                            watchSlidesProgress
                            freeMode
                            slidesPerView="auto"
                            spaceBetween={8}
                            style={{ padding: "6px 4px" }}
                        >
                            {images.map((f, i) => (
                                <SwiperSlide key={`thumb-${i}`} style={{ width: 72, height: 72 }}>
                                    <img
                                        src={f.src}
                                        alt={f.name || `Миниатюра ${i + 1}`}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            borderRadius: 8,
                                            display: "block",
                                        }}
                                    />
                                </SwiperSlide>
                            ))}
                        </Swiper>
                    </Box>
                </Box>
            )}

            <style>{`
            .thumbs-swiper .swiper-slide {
                opacity: 0.65;
                outline: 1px solid rgba(255,255,255,0.35);
                border-radius: 8px;
                overflow: hidden;
            }
            .thumbs-swiper .swiper-slide-thumb-active {
                opacity: 1;
                outline: 2px solid #fff;
            }
            .swiper-button-next, .swiper-button-prev {
                color: #ffffff !important;
            }
            `}</style>
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
                zIndex: 6,
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

        {fsFallback && (
            <Box onClick={() => setFsFallback(false)} sx={{ position: "fixed", inset: 0, zIndex: 6, bgcolor: "transparent" }}>
                <Swiper modules={[Navigation, Pagination, Zoom]} navigation pagination={{ clickable: true }} zoom={{ maxRatio: 4 }}
                    spaceBetween={12} slidesPerView={1} style={{ width: "100vw", height: "100vh" }}>
                    {images.map((f, i) => (
                        <SwiperSlide key={`fs-${i}`}>
                            <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                                <img alt={f.name || `Фото ${i + 1}`} src={f.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>
                <Box sx={{ position: "fixed", top: 12, right: 12 }}>
                    <IconButton sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "#fff" }} onClick={() => setFsFallback(false)}>
                        <FullscreenExitIcon />
                    </IconButton>
                </Box>
            </Box>
        )}

        {item && (
            <Box
                sx={{
                    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4,
                    display: "flex", justifyContent: "center", pb: 0, pointerEvents: "none",
                }}
            >
                <Box
                    role="button"
                    aria-expanded={expanded}
                    onClick={handleToggle}
                    sx={{
                        pointerEvents: "auto",
                        width: "100%", // Левая панель в ManagerPreview не 100vw, а flex:1
                        height: expanded
                            ? `${Math.round(Math.max(expandedH, MIN_EXPANDED))}px`
                            : `${Math.round(Math.max(collapsedH, MIN_COLLAPSED))}px`,
                        transition: "height 280ms ease",
                        willChange: "height",
                        borderRadius: "28px 28px 0 0",
                        border: "1px solid rgba(255,255,255,0.40)",
                        backdropFilter: "blur(20px) saturate(150%) contrast(1.05)",
                        WebkitBackdropFilter: "blur(20px) saturate(150%) contrast(1.05)",
                        background: "rgba(10, 10, 10, 0.25)",
                        boxShadow: "0 16px 44px rgba(0,0,0,0.25)",
                        overflow: "hidden",
                        cursor: "pointer",
                        boxSizing: "border-box",
                    }}
                >
                    {/* ручка */}
                    <Box ref={handleRef} sx={{ display: "flex", justifyContent: "center", pt: 1, pb: 1.25 }}>
                        <Box
                            sx={{
                                width: { xs: 52, md: 60 },
                                height: { xs: 6, md: 7 },
                                borderRadius: 8,
                                bgcolor: "rgba(255,255,255,0.85)",
                            }}
                        />
                    </Box>

                    {/* контент */}
                    <Box ref={contentRef} sx={{ px: { xs: 1.5, md: 2 }, pb: expanded ? `${PB_EXP}px` : `${PB_COLL}px`, color: "#fff" }}>
                        <Box ref={headerRef}>
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.75, alignItems: "center" }}>
                                <Box sx={{ flex: "0 1 auto", minWidth: 0 }}>
                                    <FieldCompact label="РЦ" value={item.DC_THU} mono minCh={4} maxCh={5} />
                                </Box>
                                <Box sx={{ flex: "0 1 auto", minWidth: 0 }}>
                                    <FieldCompact label="Склад" value={item.Warehouse} mono minCh={0} maxCh={8} />
                                </Box>
                                <Box sx={{ flex: "0 0 auto", minWidth: { xs: "18ch", md: "20ch" } }}>
                                    <FieldCompact label="ЕО" value={item.THU} mono maxCh={18} forceFull />
                                </Box>
                            </Box>

                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1 }}>
                                <Box sx={{ flex: "0 auto", minWidth: 0 }}>
                                    <FieldCompact label="Получатель" value={item.Recipient} />
                                </Box>
                                <Box sx={{ flex: "1 auto", minWidth: 0 }}>
                                    <FieldCompact label="Регион" value={item.RecipientRegion} />
                                </Box>
                            </Box>

                            <Divider sx={{ my: { xs: 0.75, md: 1 }, borderColor: "rgba(255,255,255,0.35)" }} />

                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    columnGap: 0.6,
                                    rowGap: 0.6,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: FONT,
                                        lineHeight: LINE,
                                        color: "rgba(255,255,255,0.95)",
                                        textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                                        fontWeight: 800,
                                        letterSpacing: 0.2,
                                        mb: 0,
                                        mr: 0.5,
                                    }}
                                >
                                    Проблемы:
                                </Typography>

                                {item.Problems?.length ? (
                                    item.Problems.map((v, i) => (
                                        <Chip
                                            key={`${v}-${i}`}
                                            label={v}
                                            variant="outlined"
                                            sx={{
                                                color: "#fff",
                                                borderColor: "rgba(255,255,255,0.55)",
                                                background: "transparent",
                                                backdropFilter: "inherit",
                                                WebkitBackdropFilter: "inherit",
                                                height: "auto",
                                                "& .MuiChip-label": {
                                                    px: 1.25,
                                                    py: 0.3,
                                                    fontSize: FONT,
                                                    lineHeight: LINE,
                                                    fontWeight: 700,
                                                },
                                            }}
                                        />
                                    ))
                                ) : (
                                    <Typography sx={{ opacity: 0.8, fontSize: FONT, lineHeight: LINE }}>—</Typography>
                                )}
                            </Box>
                        </Box>

                        <Box
                            ref={bodyRef}
                            sx={{
                                mt: expanded ? `${BODY_GAP_EXP}px` : 0,
                                visibility: expanded ? "visible" : "hidden",
                                pointerEvents: expanded ? "auto" : "none",
                                background: "transparent",
                            }}
                        >
                            <Grid container spacing={1}>
                                <Grid item xs={12} sm={6}><FieldCompact label="Автор" value={item.Author} /></Grid>
                                <Grid item xs={12} sm={6}><FieldCompact label="Создан" value={prettyDate(item.Created)} /></Grid>
                            </Grid>

                            <Divider sx={{ my: { xs: 0.75, md: 1 }, borderColor: "rgba(255,255,255,0.35)" }} />

                            {(item.Location1 || item.Shipment || item.WhNotEO) && (
                                <Box sx={{ mt: 1 }}>
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.75, alignItems: "center" }}>
                                        {item.Location1 && (
                                            <Box sx={{ flex: "0 1 auto", minWidth: 0 }}>
                                                <FieldCompact label="Местоположение" value={item.Location1} />
                                            </Box>
                                        )}
                                        {item.Shipment && (
                                            <Box sx={{ flex: "0 1 auto", minWidth: 0 }}>
                                                <FieldCompact label="Тран-ка" value={item.Shipment} mono />
                                            </Box>
                                        )}
                                    </Box>

                                    {item.WhNotEO && (
                                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                                            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                                                <FieldCompact label="Нет ЕО — склад" value={item.WhNotEO} />
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
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
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ width: 110 }}>
                <InputLabel id="period-type-label" sx={{ color: "rgba(255,255,255,0.8)" }}>Период</InputLabel>
                <Select
                  labelId="period-type-label"
                  value={periodType}
                  label="Период"
                  onChange={(e) => {
                    const newType = e.target.value;
                    setPeriodType(newType);
                    setPeriodValue(getDefaultValue(newType));
                  }}
                  sx={{
                    color: "#fff",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                    "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                  }}
                  MenuProps={{ PaperProps: { sx: { bgcolor: "rgba(20,20,20,0.95)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" } } }}
                >
                  <MenuItem value="day">День</MenuItem>
                  <MenuItem value="week">Неделя</MenuItem>
                  <MenuItem value="month">Месяц</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                type={periodType === "day" ? "date" : periodType}
                label={periodType === "day" ? "День" : periodType === "week" ? "Неделя" : "Месяц"}
                InputLabelProps={{ shrink: true }}
                value={periodValue}
                inputRef={monthInputRef}
                onChange={(e) => setPeriodValue(e.target.value)}
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
                  flex: 1,
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
            </Stack>

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
              <ManagerListItem
                 key={row.Id}
                 row={row}
                 isActive={activeItemId === row.Id}
                 loadItemById={loadItemById}
                 handleOpenProblemsPopover={handleOpenProblemsPopover}
              />
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

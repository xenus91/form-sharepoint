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
  Drawer,
  AppBar,
  Toolbar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import MenuIcon from "@mui/icons-material/Menu";
import FilterListIcon from "@mui/icons-material/FilterList";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SortIcon from "@mui/icons-material/Sort";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Zoom, FreeMode, Thumbs, Virtual } from "swiper/modules";
import "swiper/css/virtual";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";

const DEBUG = false;
const log = (...a) => DEBUG && console.log("[ManagerPreview]", ...a);

const FONT = { xs: 18, sm: 20, md: 22, lg: 24 };
const LINE = 1.2;
const EMPTY_ARRAY = [];
const PB_COLL = 14;
const PB_EXP = 120;
const BODY_GAP_EXP = 12;
const FONT_SMALL = "0.76rem";
const LINE_SMALL = "1.05";

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
const isVideoByName = (name = "") =>
  /\.(mp4|webm|ogg|mov)$/i.test(name);

function pickServerRelUrl(file) {
  return file?.ServerRelativeUrl || file?.ServerRelativePath?.DecodedUrl || "";
}

function fileValueUrl(serverRelativeUrl = "") {
  const enc = encodeURIComponent(serverRelativeUrl).replace(/%2F/gi, "/");
  return `${API_BASE_URL}/web/GetFileByServerRelativeUrl('${enc}')/$value`;
}

const VideoPlayerCustom = ({ src, name, collapsedH = 112 }) => {
  const [playing, setPlaying] = React.useState(false);
  const [showIcon, setShowIcon] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(true);
  const videoRef = React.useRef(null);
  const timerRef = React.useRef(null);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      // Пытаемся включить звук при осознанном клике
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.play().catch(err => {
        console.warn("Play blocked", err);
        // Если заблокировано, пробуем играть без звука
        videoRef.current.muted = true;
        setIsMuted(true);
        videoRef.current.play();
      });
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
    setShowIcon(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowIcon(false), 800);
  };

  return (
    <Box sx={{ 
      width: "100%", 
      height: collapsedH === 0 ? "100%" : `calc(100% - ${collapsedH}px)`, 
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      bgcolor: "#000" 
    }}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        webkit-playsinline="true"
        preload="auto"
        muted={isMuted}
        controlsList="nodownload"
        className="swiper-no-swiping"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
      />
      
      {/* Central Overlay for Interaction */}
      <Box
        onClick={togglePlay}
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 2,
          bottom: 0 
        }}
      >
        {(!playing || showIcon) && (
          <Box sx={{
            bgcolor: "rgba(0,0,0,0.45)",
            borderRadius: "50%",
            p: 2.5,
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.25)",
            transition: "opacity 0.25s ease-out",
            opacity: (!playing || showIcon) ? 1 : 0,
          }}>
            {playing ? <PauseIcon sx={{ color: "#fff", fontSize: 64 }} /> : <PlayArrowIcon sx={{ color: "#fff", fontSize: 64 }} />}
          </Box>
        )}
      </Box>
    </Box>
  );
};

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = React.useState(false);

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
  const [isSwiping, setIsSwiping] = React.useState(false);

  const [itemLoading, setItemLoading] = React.useState(false);
  const [itemError, setItemError] = React.useState("");
  const [activeItemId, setActiveItemId] = React.useState(null);
  const [itemsMap, setItemsMap] = React.useState({});
  const [mediaMap, setMediaMap] = React.useState({});
  const [problemsAnchorEl, setProblemsAnchorEl] = React.useState(null);
  const [problemsPopoverList, setProblemsPopoverList] = React.useState([]);
  const [problemsPopoverTitle, setProblemsPopoverTitle] = React.useState("");

  const swiperRef = React.useRef(null);
  const mainSwiperRef = React.useRef(null);
  const [isFs, setIsFs] = React.useState(false);
  const [fsFallback, setFsFallback] = React.useState(false);
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
  const [isAnimating, setIsAnimating] = React.useState(false);
  const isAnimatingRef = React.useRef(false);
  const isSwipingRef = React.useRef(false);
  const parentVerticalSwiperRef = React.useRef(null);

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
    if (isAnimatingRef.current || isSwipingRef.current) return;
    const { collapsedFinal, expandedFinal } = computeHeightsNow();
    
    setCollapsedH((prev) => (Math.abs(prev - collapsedFinal) > 2 ? collapsedFinal : prev));
    setExpandedH((prev) => (Math.abs(prev - expandedFinal) > 2 ? expandedFinal : prev));
  }, [computeHeightsNow]);

  React.useLayoutEffect(() => {
      if (!itemsMap[activeItemId]) return;
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
  }, [itemsMap, activeItemId, applyHeights]);

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
      const onResize = () => {
        if (!isAnimatingRef.current) applyHeights();
      };
      window.addEventListener("resize", onResize);
      document.fonts?.ready?.then(() => {
        if (!isAnimatingRef.current) applyHeights();
      }).catch(() => { });
      return () => window.removeEventListener("resize", onResize);
  }, [applyHeights]);

  React.useEffect(() => {
      const ro = new ResizeObserver(() => {
        if (!isAnimatingRef.current) applyHeights();
      });
      handleRef.current && ro.observe(handleRef.current);
      headerRef.current && ro.observe(headerRef.current);
      bodyRef.current && ro.observe(bodyRef.current);
      return () => ro.disconnect();
  }, [applyHeights]);

  const handleToggle = React.useCallback(() => {
      isAnimatingRef.current = true;
      setIsAnimating(true);
      setExpanded((v) => !v);
      
      setTimeout(() => {
        applyHeights();
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }, 350); // Чуть больше чем CSS transition для гарантии
  }, [applyHeights]);

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

  const mapItemData = (d) => {
    const problemsArr = Array.isArray(d?.Problems?.results)
      ? d.Problems.results
      : d?.Problems ? [d.Problems] : [];
    return {
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
  };

  const mapAttachments = (results) => {
    return results.map((f) => {
      const name = f?.FileName || f?.Name || "unnamed";
      const lowerName = name.toLowerCase();
      const isImg = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(lowerName);
      const isVid = /\.(mp4|webm|ogg|mov|m4v)(;|$)/i.test(lowerName);
      if (!isImg && !isVid) return null;
      const rel = pickServerRelUrl(f);
      return {
        name: name,
        src: rel ? fileValueUrl(rel) : "",
        type: isVid ? "video" : "image"
      };
    }).filter((x) => x && x.src);
  };

  const prefetchItems = React.useCallback(async (currentId) => {
    if (!currentId) return;
    const idx = filteredItems.findIndex(r => r.Id === currentId);
    if (idx === -1) return;

    const neighbors = [];
    if (idx > 0) neighbors.push(filteredItems[idx - 1]);
    if (idx < filteredItems.length - 1) neighbors.push(filteredItems[idx + 1]);

    const neighborsToFetch = neighbors.filter(n => {
      const nid = n.Id;
      return !itemsMap[nid]; // Fetch only if we don't have full details
    });

    if (neighborsToFetch.length === 0) return;

    try {
      await Promise.all(neighborsToFetch.map(async (neighbor) => {
        const nid = neighbor.Id;
        try {
          const [itemResp, attResp] = await Promise.all([
            apiClient.get(
              `/web/lists/getbytitle('ProblemsPallet')/items(${nid})` +
              `?$select=Id,THU,DC_THU,Location1,Shipment,WhNotEO,Problems,Warehouse,Created,` +
              `Recipient/Id,Recipient/Title,Recipient/SCNumberText,Author/Title&$expand=Recipient,Author`,
              { headers: { Accept: "application/json;odata=verbose" } }
            ),
            apiClient.get(
              `/web/lists/getbytitle('ProblemsPallet')/items(${nid})/AttachmentFiles`,
              { headers: { Accept: "application/json;odata=verbose" } }
            )
          ]);

          if (activeItemId !== currentId) return;

          const d = itemResp?.data?.d;
          if (!d) return;

          const mapped = mapItemData(d);
          const imgs = mapAttachments(attResp?.data?.d?.results ?? []);

          setItemsMap(prev => prev[nid] ? prev : { ...prev, [nid]: mapped });
          setMediaMap(prev => prev[nid] ? prev : { ...prev, [nid]: imgs });
          detailsCacheRef.current.set(nid, { item: mapped, images: imgs, raw: d });
        } catch (e) {
          console.warn("Prefetch error for", nid, e);
        }
      }));
    } catch (err) { }
  }, [filteredItems, itemsMap, activeItemId]);

  const loadItemById = React.useCallback(async (id) => {
    if (!id) return null;
    setActiveItemId(id);

    if (itemsMap[id] && mediaMap[id]) {
      return itemsMap[id];
    }

    setItemLoading(true);
    setItemError("");

    const requestSeq = ++requestSeqRef.current;

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

      const mappedItem = mapItemData(d);
      const imgs = mapAttachments(attachmentsResp?.data?.d?.results ?? []);

      setItemsMap(prev => ({ ...prev, [id]: mappedItem }));
      setMediaMap(prev => ({ ...prev, [id]: imgs }));

      prefetchItems(id);
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
  }, [itemsMap, mediaMap, prefetchItems]);

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
      if (rows.length > 0) {
        loadItemById(rows[0].Id);
      }
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


  // МОБИЛЬНЫЙ ХЕДЕР
  const MobileHeader = (
    <AppBar position="static" sx={{ bgcolor: "rgba(10,10,10,0.85)", backdropFilter: "blur(10px)", touchAction: "none", zIndex: 10 }}>
      <Toolbar sx={{ justifyContent: "space-between" }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={onBack} sx={{ color: "#fff" }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontSize: 18, fontWeight: 700 }}>Менеджер</Typography>
        </Stack>
        <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: "#fff" }}>
          <MenuIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );

  // МОБИЛЬНОЕ МЕНЮ (DRAWER)
  const FilterDrawer = (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      PaperProps={{
        sx: {
          width: 280,
          bgcolor: "rgba(15,15,15,0.98)",
          color: "#fff",
          backdropFilter: "blur(12px)",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          p: 2
        }
      }}
    >
      <Typography variant="h6" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <FilterListIcon /> Фильтры
      </Typography>
      
      <Stack spacing={3}>
        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Период</InputLabel>
          <Select
            value={periodType}
            label="Период"
            onChange={(e) => {
              const newType = e.target.value;
              setPeriodType(newType);
              setPeriodValue(getDefaultValue(newType));
            }}
            sx={{
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.05)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.3)" }
            }}
          >
            <MenuItem value="day">День</MenuItem>
            <MenuItem value="week">Неделя</MenuItem>
            <MenuItem value="month">Месяц</MenuItem>
          </Select>
        </FormControl>

        <TextField
          fullWidth
          size="small"
          type={periodType === "day" ? "date" : periodType}
          label={periodType === "day" ? "Дата" : periodType === "week" ? "Неделя" : "Месяц"}
          InputLabelProps={{ shrink: true }}
          value={periodValue}
          onChange={(e) => setPeriodValue(e.target.value)}
          sx={{
            "& .MuiOutlinedInput-root": {
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.05)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.3)" }
            },
            "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
            "& .MuiInputBase-input": { colorScheme: "dark" }
          }}
        />

        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Автор</InputLabel>
          <Select
            value={authorFilter}
            label="Автор"
            onChange={(e) => setAuthorFilter(e.target.value)}
            sx={{
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.05)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.3)" }
            }}
          >
            <MenuItem value="all">Все авторы</MenuItem>
            {authorOptions.map((a) => (
              <MenuItem key={a} value={a}>{a}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Проблема</InputLabel>
          <Select
            value={problemFilter}
            label="Проблема"
            onChange={(e) => setProblemFilter(e.target.value)}
            sx={{
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.05)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.3)" }
            }}
          >
            <MenuItem value="all">Любая</MenuItem>
            {problemOptions.map((p) => (
              <MenuItem key={p} value={p}>{p}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Сортировка</InputLabel>
          <Select
            value={sortOrder}
            label="Сортировка"
            onChange={(e) => setSortOrder(e.target.value)}
            sx={{
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.05)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.3)" }
            }}
          >
            <MenuItem value="desc">Сначала новые</MenuItem>
            <MenuItem value="asc">Сначала старые</MenuItem>
          </Select>
        </FormControl>

        <Button 
          fullWidth 
          variant="contained" 
          onClick={() => setDrawerOpen(false)}
          sx={{ mt: 2, bgcolor: "rgba(120,150,255,0.8)", "&:hover": { bgcolor: "rgba(120,150,255,1)" } }}
        >
          Применить
        </Button>
      </Stack>
    </Drawer>
  );

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

  // --- ВСПОМОГАТЕЛЬНЫЕ РЕНДЕРЫ ---

  const renderMediaArea = (targetId) => {
    const slideItem = itemsMap[targetId];
    const slideImages = mediaMap[targetId] || [];
    const isSlideActive = targetId === activeItemId;
    const isSlideLoading = itemLoading && isSlideActive;

    return (
      <MediaContent 
        targetId={targetId}
        isSlideActive={isSlideActive}
        itemData={slideItem}
        slideImages={slideImages}
        isSlideLoading={isSlideLoading}
        itemError={activeItemId === targetId ? itemError : ""}
        isMobile={isMobile}
        isFs={isSlideActive ? isFs : false}
        toggleFullscreen={isSlideActive ? toggleFullscreen : null}
        mainSwiperRef={mainSwiperRef}
        parentVerticalSwiperRef={parentVerticalSwiperRef}
        isSwipingRef={isSwipingRef} // Передаем реф для блокировки высоты
        isSwiping={isSlideActive ? isSwiping : false}
        collapsedH={collapsedH}
      />
    );
  };

  const renderInfoPanel = () => {
    if (!itemsMap[activeItemId]) return null;
    return (
      <Box sx={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", zIndex: 10, touchAction: "none" }}>
        <Box
          role="button"
          aria-expanded={expanded}
          onClick={handleToggle}
          sx={{
            width: isMobile ? "100%" : { xs: "100%", md: "90%" },
            // Контейнер теперь всегда имеет полную высоту раскрытого состояния,
            // но мы будем «прятать» его часть за пределы видимости или использовать translateY
            height: `${expandedH}px`,
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: `translateX(-50%) translateY(${expanded ? 0 : (expandedH - collapsedH)}px)`,
            transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1), backdrop-filter 0.2s ease",
            bgcolor: "rgba(10, 10, 10, 0.3)",
            border: "1px solid rgba(255,255,255,0.4)",
            borderBottom: "none",
            borderRadius: isMobile ? "0" : "28px 28px 0 0",
            backdropFilter: (isSwiping || isAnimating) ? "none" : "blur(20px) saturate(150%)",
            overflow: "hidden",
            cursor: "pointer",
            boxSizing: "border-box",
            willChange: "transform",
            zIndex: 10
          }}
        >
          <Box ref={handleRef} sx={{ display: "flex", justifyContent: "center", pt: 1, pb: 1.25 }}>
            <Box sx={{ width: 52, height: 6, borderRadius: 8, bgcolor: "rgba(255,255,255,0.85)" }} />
          </Box>

          <InfoPanelContent 
            item={itemsMap[activeItemId]} 
            expanded={expanded} 
            contentRef={contentRef}
            headerRef={headerRef}
            bodyRef={bodyRef}
            prettyDate={prettyDate}
          />
        </Box>
      </Box>
    );
  };

  // --- ОСНОВНОЙ РЕНДЕР ---

  if (isMobile) {
    return (
      <Box sx={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", bgcolor: "#000", overflow: "hidden" }}>
        {MobileHeader}
        {FilterDrawer}

        <Box sx={{ flex: 1, position: "relative", minHeight: 0 }}>
          {filteredItems.length === 0 ? (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "#fff" }}>
              <Typography sx={{ opacity: 0.6 }}>Элементы не найдены</Typography>
            </Box>
          ) : (
            <>
              {/* FIXED FULLSCREEN BUTTON (OVERLAY) */}
              <Tooltip title={isFs ? "Выйти из полноэкранного" : "Открыть на весь экран"}>
                <IconButton
                  onClick={toggleFullscreen}
                  sx={{ 
                    position: "absolute", 
                    top: 12, 
                    right: 12, 
                    zIndex: 20, 
                    bgcolor: "rgba(0,0,0,0.45)", 
                    color: "#fff", 
                    backdropFilter: "blur(6px)",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.6)" } 
                  }}
                  size="large"
                >
                  {isFs ? <FullscreenExitIcon fontSize="large" /> : <FullscreenIcon fontSize="large" />}
                </IconButton>
              </Tooltip>

              <Swiper
                direction="vertical"
                slidesPerView={1}
                speed={350} 
                threshold={10} 
                longSwipesRatio={0.4} 
                followFinger={true}
                touchReleaseOnEdges={true}
                preventInteractionOnTransition={true}
                modules={[Virtual]}
                virtual={{ 
                  enabled: true, 
                  addSlidesBefore: 2, 
                  addSlidesAfter: 2
                }}
                style={{ width: "100%", height: "100%" }}
                initialSlide={0}
                onSwiper={(s) => { parentVerticalSwiperRef.current = s; }}
                onSlideChangeTransitionStart={() => {
                   setIsSwiping(true);
                   isSwipingRef.current = true;
                }}
                onSlideChangeTransitionEnd={() => {
                   setIsSwiping(false);
                   isSwipingRef.current = false;
                   applyHeights(); // Пересчитываем высоту ТОЛЬКО в конце свайпа
                   
                   // Загружаем данные только когда слайд ПОЛНОСТЬЮ ОСТАНОВИЛСЯ
                   if (parentVerticalSwiperRef.current) {
                     const idx = parentVerticalSwiperRef.current.activeIndex;
                     const target = filteredItems[idx];
                     if (target && target.Id !== activeItemId) loadItemById(target.Id);
                   }
                }}
                onSlideChange={(s) => {
                  // Пусто. Мы перенесли загрузку в TransitionEnd для стабильности Safari
                }}
              >
                {(() => {
                  const cIdx = filteredItems.findIndex(r => r.Id === activeItemId);
                  return filteredItems.map((row, index) => {
                    const isNear = Math.abs(index - cIdx) <= 1;
                    return (
                      <SwiperSlide 
                        key={row.Id} 
                        virtualIndex={index}
                        style={{ 
                          height: "100%",
                          WebkitBackfaceVisibility: "hidden",
                          transform: "translate3d(0,0,0)"
                        }}
                      >
                        <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
                          {isNear ? renderMediaArea(row.Id) : (
                            <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center", bgcolor: "#000" }}>
                              <CircularProgress sx={{ opacity: 0.2 }} />
                            </Box>
                          )}
                        </Box>
                      </SwiperSlide>
                    );
                  });
                })()}
              </Swiper>
            </>
          )}
        </Box>

        {renderInfoPanel()}

        {/* Fallback FS */}
        {fsFallback && (
          <Box onClick={() => setFsFallback(false)} sx={{ position: "fixed", inset: 0, zIndex: 1000, bgcolor: "#000" }}>
             <Swiper modules={[Navigation, Pagination, Zoom]} navigation pagination={{ clickable: true }} zoom={{ maxRatio: 4 }} style={{ width: "100vw", height: "100vh" }}>
               {images.map((f, i) => (
                 <SwiperSlide key={i}><div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                   <img src={f.src} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                 </div></SwiperSlide>
               ))}
             </Swiper>
             <IconButton sx={{ position: "fixed", top: 12, right: 12, color: "#fff", bgcolor: "rgba(0,0,0,0.5)" }} onClick={() => setFsFallback(false)}>
               <FullscreenExitIcon />
             </IconButton>
          </Box>
        )}
      </Box>
    );
  }

  // DESKTOP LAYOUT
  return (
    <Box sx={{ position: "fixed", inset: 0, display: "flex", bgcolor: "#000" }}>
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, bgcolor: "black", overflow: "hidden" }}>
        <Box ref={swiperRef} sx={{ flex: 1, position: "relative", minHeight: 0, zIndex: 0 }}>
          <Box sx={{ position: "absolute", top: 12, left: 12, zIndex: 6 }}>
            <Button variant="outlined" onClick={onBack} sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.45)", bgcolor: "rgba(10,10,10,0.32)", backdropFilter: "blur(16px)", "&:hover": { bgcolor: "rgba(10,10,10,0.45)" } }}>Назад в форму</Button>
          </Box>
          {/* DESKTOP FULLSCREEN BUTTON */}
          <Tooltip title={isFs ? "Выйти из полноэкранного" : "Открыть на весь экран"}>
            <IconButton
              onClick={toggleFullscreen}
              sx={{ position: "absolute", top: 12, right: 12, zIndex: 6, bgcolor: "rgba(0,0,0,0.4)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.55)" } }}
              size="large"
            >
              {isFs ? <FullscreenExitIcon fontSize="large" /> : <FullscreenIcon fontSize="large" />}
            </IconButton>
          </Tooltip>
          {renderMediaArea(activeItemId)}
        </Box>
        {renderInfoPanel()}
      </Box>

      {/* ПРАВАЯ ПАНЕЛЬ (ТОЛЬКО ДЕСКТОП) */}
      <Box sx={{ width: 390, borderLeft: "1px solid rgba(255,255,255,0.35)", bgcolor: "rgba(10, 10, 10, 0.35)", backdropFilter: "blur(20px)", color: "#fff", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 2, borderBottom: "1px solid rgba(255,255,255,0.25)" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Элементы с вложениями</Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ width: 110 }}>
                <InputLabel sx={{ color: "rgba(255,255,255,0.8)" }}>Период</InputLabel>
                <Select value={periodType} label="Период" onChange={(e) => { setPeriodType(e.target.value); setPeriodValue(getDefaultValue(e.target.value)); }} sx={{ color: "#fff", "& fieldset": { borderColor: "rgba(255,255,255,0.45)" } }}>
                  <MenuItem value="day">День</MenuItem><MenuItem value="week">Неделя</MenuItem><MenuItem value="month">Месяц</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" type={periodType === "day" ? "date" : periodType} label="Дата" InputLabelProps={{ shrink: true }} value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} sx={{ flex: 1, "& .MuiOutlinedInput-root": { color: "#fff", "& fieldset": { borderColor: "rgba(255,255,255,0.45)" } }, "& .MuiInputBase-input": { colorScheme: "dark" } }} />
            </Stack>
            
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: "rgba(255,255,255,0.8)" }}>Автор</InputLabel>
              <Select
                value={authorFilter}
                label="Автор"
                onChange={(e) => setAuthorFilter(e.target.value)}
                sx={{
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                }}
                MenuProps={{ PaperProps: { sx: { bgcolor: "rgba(20,20,20,0.95)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" } } }}
              >
                <MenuItem value="all">Все авторы</MenuItem>
                {authorOptions.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: "rgba(255,255,255,0.8)" }}>Проблема</InputLabel>
              <Select
                value={problemFilter}
                label="Проблема"
                onChange={(e) => setProblemFilter(e.target.value)}
                sx={{
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "& .MuiSelect-icon": { color: "rgba(255,255,255,0.9)" },
                }}
                MenuProps={{ PaperProps: { sx: { bgcolor: "rgba(20,20,20,0.95)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" } } }}
              >
                <MenuItem value="all">Любая</MenuItem>
                {problemOptions.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
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
            "&::-webkit-scrollbar": { width: 10 },
            "&::-webkit-scrollbar-track": { background: "rgba(25,25,25,0.55)", borderRadius: 10 },
            "&::-webkit-scrollbar-thumb": {
              background: "linear-gradient(180deg, rgba(185,185,185,0.5), rgba(145,145,145,0.55))",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
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
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              p: 1.25,
              minWidth: 260,
              maxWidth: 420,
              bgcolor: "rgba(18,18,18,0.95)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
            },
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
          Проблемы {problemsPopoverTitle}
        </Typography>
        <Stack spacing={0.5}>
          {(problemsPopoverList || EMPTY_ARRAY).map((problem, idx) => (
            <Typography key={`${problem}-${idx}`} variant="body2">
              • {problem}
            </Typography>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}

// --- МЕМОИЗИРОВАННЫЙ КОНТЕНТ ИНФО-ПАНЕЛИ ---
const InfoPanelContent = React.memo(({ item, expanded, contentRef, headerRef, bodyRef, prettyDate }) => {
  return (
    <Box ref={contentRef} sx={{ px: 1.5, pb: expanded ? `${PB_EXP}px` : `${PB_COLL}px`, color: "#fff" }}>
      <Box ref={headerRef}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.75, alignItems: "center" }}>
          <Box sx={{ flex: "0 1 auto", minWidth: 0 }}><FieldCompact label="РЦ" value={item.DC_THU} mono minCh={4} maxCh={5} /></Box>
          <Box sx={{ flex: "0 1 auto", minWidth: 0 }}><FieldCompact label="Склад" value={item.Warehouse} mono minCh={0} maxCh={8} /></Box>
          <Box sx={{ flex: "0 0 auto", minWidth: "18ch" }}><FieldCompact label="ЕО" value={item.THU} mono maxCh={18} forceFull /></Box>
          <Box sx={{ flex: "0 auto", ml: "auto" }}><Typography sx={{ opacity: 0.8, fontSize: FONT_SMALL, fontWeight: 700 }}>ID {item.Id}</Typography></Box>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1 }}>
          <Box sx={{ flex: "0 auto", minWidth: 0 }}><FieldCompact label="Получатель" value={item.Recipient} /></Box>
          <Box sx={{ flex: "1 auto", minWidth: 0 }}><FieldCompact label="Регион" value={item.RecipientRegion} /></Box>
        </Box>
        <Divider sx={{ my: 0.75, borderColor: "rgba(255,255,255,0.35)" }} />
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.6, rowGap: 0.6 }}>
          <Typography sx={{ fontSize: FONT_SMALL, lineHeight: LINE_SMALL, color: "rgba(255,255,255,0.95)", fontWeight: 800, mr: 0.5 }}>Проблемы:</Typography>
          {item.Problems?.length ? item.Problems.map((v, idx) => (
            <Chip key={`${v}-${idx}`} label={v} variant="outlined" sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.55)", height: "auto", "& .MuiChip-label": { px: 1.25, py: 0.3, fontSize: FONT_SMALL, fontWeight: 700 } }} />
          )) : <Typography sx={{ opacity: 0.8, fontSize: FONT_SMALL }}>—</Typography>}
        </Box>
      </Box>

      <Box 
        ref={bodyRef} 
        sx={{ 
          mt: `${BODY_GAP_EXP}px`, // Теперь отступ постоянен, чтобы макет не «прыгал» при клике
          opacity: expanded ? 1 : 0, 
          transition: "opacity 0.2s ease",
          pointerEvents: expanded ? "auto" : "none" 
        }}
      >
        <Grid container spacing={1}>
          <Grid item xs={12} sm={6}><FieldCompact label="Автор" value={item.Author} /></Grid>
          <Grid item xs={12} sm={6}><FieldCompact label="Создан" value={prettyDate(item.Created)} /></Grid>
        </Grid>
        <Divider sx={{ my: 0.75, borderColor: "rgba(255,255,255,0.35)" }} />
        {(item.Location1 || item.Shipment || item.WhNotEO) && (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 0.75, alignItems: "center" }}>
              {item.Location1 && <Box sx={{ flex: "0 1 auto" }}><FieldCompact label="Местоположение" value={item.Location1} /></Box>}
              {item.Shipment && <Box sx={{ flex: "0 1 auto" }}><FieldCompact label="Тран-ка" value={item.Shipment} mono /></Box>}
            </Box>
            {item.WhNotEO && <FieldCompact label="Нет ЕО — склад" value={item.WhNotEO} />}
          </Box>
        )}
      </Box>
    </Box>
  );
});

// --- МЕМОИЗИРОВАННЫЙ КОМПОНЕНТ ДЛЯ СЛАЙДА ---
const MediaContent = React.memo(({ 
  targetId, isSlideActive, itemData, slideImages, isSlideLoading, itemError, 
  isMobile, isFs, toggleFullscreen, mainSwiperRef, parentVerticalSwiperRef, isSwipingRef, isSwiping, collapsedH 
}) => {
  const [thumbsSwiper, setThumbsSwiper] = React.useState(null);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const localSwiperRef = React.useRef(null);
  const glassPanelRef = React.useRef(null);

  // ПРИНУДИТЕЛЬНЫЙ СБРОС: при смене сотрудника всегда возвращаемся к 1-й фотографии
  React.useEffect(() => {
    setActiveIdx(0);
    if (localSwiperRef.current) {
      localSwiperRef.current.slideTo(0, 0);
    }
  }, [targetId]);

  if (!itemData) {
    return (
      <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
        <Typography sx={{ color: "white", opacity: 0.8 }}>
          {isMobile ? "Загрузка..." : "Выберите элемент справа, чтобы открыть фотографии."}
        </Typography>
      </Box>
    );
  }

  if (itemError) {
    return (
      <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2, zIndex: 3 }}>
        <Paper sx={{ p: 2 }}><Typography color="error">{itemError}</Typography></Paper>
      </Box>
    );
  }

  // --- РЕЖИМ ЛЕГКОГО ПРЕВЬЮ ДЛЯ СОСЕДНИХ СЛАЙДОВ (ОПТИМИЗАЦИЯ СВАЙПА) ---
  if (!isSlideActive) {
    const firstMedia = slideImages[0];
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#000" }}>
        {!firstMedia ? (
          <CircularProgress size={30} sx={{ opacity: 0.3 }} />
        ) : firstMedia.type === "video" ? (
          <PlayCircleOutlineIcon sx={{ color: "rgba(255,255,255,0.4)", fontSize: 60 }} />
        ) : (
          <img 
            src={firstMedia.src} 
            alt="preview" 
            style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.6 }} 
          />
        )}
      </Box>
    );
  }

  // --- ПОЛНОЦЕННЫЙ ИНТЕРАКТИВНЫЙ РЕЖИМ ТОЛЬКО ДЛЯ АКТИВНОГО СЛАЙДА ---
  return (
    <>
      {isSlideLoading ? (
        <Box sx={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <CircularProgress />
        </Box>
      ) : slideImages.length === 0 ? (
        <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
          <Typography sx={{ color: "white", opacity: 0.7, fontSize: 13 }}>Вложения не найдены</Typography>
        </Box>
      ) : (
        <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          <Swiper
            onSwiper={(s) => { 
              localSwiperRef.current = s;
              if (isSlideActive) mainSwiperRef.current = s; 
            }}
          modules={[Zoom]}
          nested={true}
          touchReleaseOnEdges={true}
          observer={true}
          observeParents={true}
          cssMode={true} // Переход на нативный режим (CSS Scroll Snap)
          navigation={false}
          zoom={{ maxRatio: 3 }}
          spaceBetween={12} slidesPerView={1}
          onTouchStart={() => {
            setIsSwiping(true);
            if (isSwipingRef) isSwipingRef.current = true;
            if (glassPanelRef.current) glassPanelRef.current.style.backdropFilter = "none";
            if (parentVerticalSwiperRef?.current) {
              parentVerticalSwiperRef.current.allowTouchMove = false;
            }
          }}
          onTouchEnd={() => {
            setIsSwiping(false);
            if (isSwipingRef) isSwipingRef.current = false;
            if (glassPanelRef.current) glassPanelRef.current.style.backdropFilter = "blur(8px)";
            if (parentVerticalSwiperRef?.current) {
              parentVerticalSwiperRef.current.allowTouchMove = true;
            }
          }}
          onTransitionEnd={() => {
            if (isSwipingRef) isSwipingRef.current = false;
            if (glassPanelRef.current) glassPanelRef.current.style.backdropFilter = "blur(8px)";
            if (parentVerticalSwiperRef?.current) {
              parentVerticalSwiperRef.current.allowTouchMove = true;
            }
          }}
           onActiveIndexChange={(s) => {
            if (activeIdx !== s.activeIndex) {
              setActiveIdx(s.activeIndex);
            }
          }}
          style={{ 
            width: "100%", 
            height: isMobile ? `calc(100% - ${collapsedH}px)` : "100%",
            touchAction: "pan-y !important",
            "--swiper-pagination-color": "#fff",
            "--swiper-pagination-bottom": "20px",
          }}
          pagination={false}
        >
          {slideImages.map((f, i) => (
            <SwiperSlide 
              key={i}
              style={{
                width: "100%", height: "100%",
                WebkitBackfaceVisibility: "hidden",
                transform: "translate3d(0,0,0)"
              }}
            >
              <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                {f.type === "video" ? (
                  <VideoPlayerCustom src={f.src} name={f.name} collapsedH={collapsedH} />
                ) : (
                  <img alt={f.name} src={f.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

          {/* КАСТОМНЫЕ КНОПКИ НАВИГАЦИИ (ДЛЯ ИСКЛЮЧЕНИЯ ПЕРЕСКОКА) */}
          {!isSlideLoading && slideImages.length > 1 && (
            <>
              <IconButton
                onClick={(e) => { e.stopPropagation(); localSwiperRef.current?.slidePrev(); }}
                sx={{
                  position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 20,
                  bgcolor: "rgba(0,0,0,0.45)", color: "#fff", backdropFilter: "blur(4px)",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
                  display: "flex",
                  opacity: activeIdx === 0 ? 0 : 1, transition: "all 0.2s"
                }}
              >
                <ArrowBackIcon />
              </IconButton>
              <IconButton
                onClick={(e) => { e.stopPropagation(); localSwiperRef.current?.slideNext(); }}
                sx={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 20,
                  bgcolor: "rgba(0,0,0,0.45)", color: "#fff", backdropFilter: "blur(4px)",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
                  display: "flex",
                  opacity: activeIdx === slideImages.length - 1 ? 0 : 1, transition: "all 0.2s"
                }}
              >
                <ArrowBackIcon sx={{ transform: "rotate(180deg)" }} />
              </IconButton>
            </>
          )}

          {slideImages.length > 1 && isSlideActive && (
            <Box sx={{ position: "absolute", left: 0, right: 0, top: isMobile ? 2 : 12, zIndex: 5, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Box ref={glassPanelRef} sx={{ 
                pointerEvents: "auto", bgcolor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", 
                backdropFilter: "blur(8px)", borderRadius: "12px", px: isMobile ? 0.5 : 1, py: 0.5, maxWidth: "min(90vw, 680px)",
                transition: "backdrop-filter 0.1s ease"
              }}>
                <Swiper 
                  key={`thumbs-${targetId}`} className="thumbs-swiper" onSwiper={setThumbsSwiper} 
                  modules={[FreeMode, Thumbs]} watchSlidesProgress freeMode slidesPerView="auto" spaceBetween={8} 
                  slideToClickedSlide={true} // Переход по клику на миниатюру
                  style={{ padding: isMobile ? "2px" : "6px 4px" }}
                >
                  {slideImages.map((f, i) => {
                    const isActive = activeIdx === i;
                    return (
                      <SwiperSlide 
                        key={`thumb-${targetId}-${i}`} 
                        onClick={() => {
                          if (mainSwiperRef.current) mainSwiperRef.current.slideTo(i);
                        }}
                        style={{ 
                          width: isMobile ? 50 : 72, 
                          height: isMobile ? 50 : 72,
                          cursor: "pointer",
                          opacity: isActive ? 1 : 0.4,
                          border: isActive ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
                          borderRadius: 10,
                          overflow: "hidden",
                          transition: "all 0.2s ease",
                          boxSizing: "border-box"
                        }}
                      >
                        {f.type === "video" ? (
                          <Box sx={{ width: "100%", height: "100%", bgcolor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <PlayCircleOutlineIcon sx={{ color: "#fff", fontSize: isMobile ? 24 : 40 }} />
                          </Box>
                        ) : (
                          <img src={f.src} alt="thumb" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                      </SwiperSlide>
                    );
                  })}
                </Swiper>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </>
  );
}, (prev, next) => {
  return prev.targetId === next.targetId && 
         prev.isSlideActive === next.isSlideActive && 
         prev.isSlideLoading === next.isSlideLoading &&
         prev.itemData === next.itemData &&
         prev.slideImages === next.slideImages &&
         prev.itemError === next.itemError &&
         prev.isFs === next.isFs &&
         prev.collapsedH === next.collapsedH;
});



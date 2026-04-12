// ItemViewer.jsx
import React from "react";
import apiClient from "./api";
import { API_BASE_URL } from "../config";
// Cache bust: 2026-04-12 01:58
import {
    Box, Chip, CircularProgress, Grid, Paper, Stack, Typography,
    IconButton, Tooltip, Divider, Button, Dialog
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Zoom, Thumbs, FreeMode } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";

const DEBUG = false;
const log = (...a) => DEBUG && console.log("[ItemViewer]", ...a);

// ЕДИНЫЙ МАСШТАБ ШРИФТОВ
const FONT = { xs: 18, sm: 20, md: 22, lg: 24 };
const LINE = 1.2;

const isMobile = window.innerWidth <= 600;

// ───────── helpers ─────────
function getIdFromQuery() {
    const usp = new URLSearchParams(window.location.search || "");
    return usp.get("ID") || usp.get("Id") || usp.get("id");
}
const prettyDate = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");
const isImageByName = (name = "") =>
    /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(name);
const isVideoByName = (name = "") =>
    /\.(mp4|webm|ogg|mov)$/i.test(name);
function pickServerRelUrl(file) {
    return file?.ServerRelativeUrl || file?.ServerRelativePath?.DecodedUrl || "";
}
function fileValueUrl(serverRelativeUrl = "") {
    if (!serverRelativeUrl) return "";
    
    // SharePoint требует, чтобы пути начинались со слэша.
    const relPath = serverRelativeUrl.startsWith("/") ? serverRelativeUrl : "/" + serverRelativeUrl;
    
    // Экранируем спецсимволы, оставляя слэши для структуры
    const encPath = encodeURIComponent(relPath).replace(/%2F/gi, "/");
    
    // Возвращаемся к использованию API эндпоинта $value
    return `${API_BASE_URL}/web/GetFileByServerRelativeUrl('${encPath}')/$value`;
}

const VideoPreviewDialog = ({ url, onClose }) => {
  if (!url) return null;
  return (
    <Dialog
      open={!!url}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { bgcolor: "#000", borderRadius: 2, overflow: "hidden", position: "relative" }
      }}
    >
      <Box sx={{ position: "relative", width: "100%", pt: "56.25%", bgcolor: "#000" }}>
        <video
          src={url}
          controls
          autoPlay
          playsInline
          webkit-playsinline="true"
          crossOrigin="use-credentials" 
          controlsList="nodownload"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        >
          <source src={url} type="video/webm" />
        </video>
        <IconButton
          onClick={onClose}
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            color: "white",
            bgcolor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
            zIndex: 10
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
    </Dialog>
  );
};

// компактное поле: ЛЕЙБЛ и ЗНАЧЕНИЕ — ОДИНАКОВЫЕ размеры
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

export default function ItemViewer() {
    const id = React.useMemo(() => getIdFromQuery(), []);
    const [loading, setLoading] = React.useState(true);
    const [item, setItem] = React.useState(null);
    const [images, setImages] = React.useState([]);
    const [videoPreviewUrl, setVideoPreviewUrl] = React.useState(null);
    const [error, setError] = React.useState("");

    // Swiper fullscreen + thumbs
    const localSwiperRef = React.useRef(null);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const swiperRef = React.useRef(null);
    const [isFs, setIsFs] = React.useState(false);
    const [fsFallback, setFsFallback] = React.useState(false);
    const [thumbsSwiper, setThumbsSwiper] = React.useState(null);

    // Инфо-панель
    const [expanded, setExpanded] = React.useState(false);

    // refs для измерений
    const handleRef = React.useRef(null);  // «ручка»
    const headerRef = React.useRef(null);  // 2 строки + ПРОБЛЕМЫ (всегда видимы)
    const bodyRef = React.useRef(null);  // скрываемый блок (в DOM всегда)
    const contentRef = React.useRef(null);

    // высоты панели
    const [collapsedH, setCollapsedH] = React.useState(112);
    const [expandedH, setExpandedH] = React.useState(360);

    // отступы и «страховки»
    const BODY_GAP_EXP = 10;
    const PB_COLL = 10;     // паддинг снизу в коллапсе — чтобы чипы/текст не подрезались
    const PB_EXP = 14;
    const MIN_COLLAPSED = 96;
    const MIN_EXPANDED = 140;
    const SAFETY = 2;

    const toggleFullscreen = () => {
        const el = swiperRef.current;
        if (!document.fullscreenElement) {
            if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFsFallback(true));
            else setFsFallback(true);
        } else document.exitFullscreen?.();
    };
    React.useEffect(() => {
        const onFs = () => setIsFs(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    // загрузка данных
    React.useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!id) { setError("Не передан параметр ID в URL."); setLoading(false); return; }
            setLoading(true);
            try {
                const { data } = await apiClient.get(
                    `/web/lists/getbytitle('ProblemsPallet')/items(${id})` +
                    `?$select=Id,THU,DC_THU,Location1,Shipment,WhNotEO,Problems,Warehouse,Created,` +
                    `Recipient/Id,Recipient/Title,Recipient/SCNumberText,Author/Title&$expand=Recipient,Author`,
                    { headers: { Accept: "application/json;odata=verbose" } }
                );
                if (cancelled) return;

                const d = data?.d;
                const problemsArr = Array.isArray(d?.Problems?.results)
                    ? d.Problems.results
                    : d?.Problems ? [d.Problems] : [];

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
                if (cancelled) return;
                const results = a?.data?.d?.results ?? [];
                const imgs = results
                    .map((f) => {
                        const name = f?.FileName || f?.Name || f?.FileLeafRef || "unnamed";
                        const lowerName = name.toLowerCase();
                        const isImg = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(lowerName);
                        const isVid = /\.(mp4|webm|ogg|mov|m4v)(;|$)/i.test(lowerName);
                        
                        if (!isImg && !isVid) return null;

                        const rel = pickServerRelUrl(f);
                        return {
                            name: name,
                            src: rel ? fileValueUrl(rel) : "",
                            serverRelativeUrl: rel,
                            type: isVid ? "video" : "image"
                        };
                    }).filter((x) => x && x.src);
                setImages(imgs);
                setError("");
            } catch (e) {
                console.error(e);
                if (!cancelled) setError("Не удалось загрузить элемент или вложения.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [id]);

    // расчёт высот
    const computeHeightsNow = React.useCallback(() => {
        const wH = window.innerHeight || 600;
        const handleH = handleRef.current?.offsetHeight || 0;
        const headerH = headerRef.current?.scrollHeight || 0;
        const bodyH = bodyRef.current?.scrollHeight || 0;

        if (headerH < 12 || handleH < 4) {
            const collapsedFinal = isMobile ? 32 : Math.max(MIN_COLLAPSED, 112);
            const expandedFinal = Math.max(MIN_EXPANDED, Math.min(wH - 8, collapsedFinal + 280));
            return { collapsedFinal, expandedFinal };
        }

        const collapsedFinal = isMobile ? 32 : Math.round(handleH + headerH + PB_COLL + SAFETY);
        const full = Math.round(handleH + headerH + BODY_GAP_EXP + bodyH + PB_EXP + SAFETY);
        const viewportMax = Math.max(wH - 8, collapsedFinal + 1);
        const expandedFinal = Math.min(full, viewportMax);

        return {
            collapsedFinal: isMobile ? 32 : Math.max(collapsedFinal, MIN_COLLAPSED),
            expandedFinal: Math.max(expandedFinal, MIN_EXPANDED),
        };
    }, [isMobile]);

    const applyHeights = React.useCallback(() => {
        const { collapsedFinal, expandedFinal } = computeHeightsNow();
        setCollapsedH(collapsedFinal);
        setExpandedH(expandedFinal);
    }, [computeHeightsNow]);

    // первый цикл: несколько rAF-тиков до валидного замера
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

    // ресайз/шрифты
    React.useEffect(() => {
        const onResize = () => applyHeights();
        window.addEventListener("resize", onResize);
        document.fonts?.ready?.then(applyHeights).catch(() => { });
        return () => window.removeEventListener("resize", onResize);
    }, [applyHeights]);

    // ResizeObserver
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

    if (loading) {
        return (
            <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}>
                <CircularProgress />
            </Box>
        );
    }
    if (error || !item) {
        return (
            <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
                <Paper sx={{ p: 2 }}>
                    <Typography color="error">{error || "Элемент не найден."}</Typography>
                </Paper>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ 
                display: "flex", 
                flexDirection: "column", 
                height: "100vh", 
                width: "100vw", 
                bgcolor: "black",
                overflow: "hidden" 
            }}>
                {/* ВЕРХНЯЯ ЧАСТЬ: ГАЛЕРЕЯ */}
                <Box ref={swiperRef} sx={{ flex: 1, position: "relative", minHeight: 0, zIndex: 0 }}>
                    {images.length === 0 ? (
                        <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                            <Typography sx={{ color: "white", opacity: 0.7, fontSize: FONT, lineHeight: LINE }}>
                                Вложения не найдены
                            </Typography>
                        </Box>
                    ) : (
                        <Swiper
                            modules={[Pagination, Zoom, Thumbs]}
                            onSwiper={(s) => { localSwiperRef.current = s; }}
                            onActiveIndexChange={(s) => setActiveIdx(s.activeIndex)}
                            navigation={false}
                            pagination={isMobile ? { clickable: true } : false}
                            zoom={{ maxRatio: 3 }}
                            spaceBetween={12}
                            slidesPerView={1}
                            cssMode={isMobile}
                            style={{ 
                                width: "100%", 
                                height: isMobile ? `calc(100% - ${collapsedH}px)` : "100%",
                                "--swiper-pagination-color": "#fff",
                                "--swiper-pagination-bottom": "20px",
                            }}
                            thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                        >
                            {images.map((f, i) => (
                                <SwiperSlide key={i} style={{ height: "100%" }}>
                                    <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                                        {f.type === "video" ? (
                                            <Box 
                                                onClick={() => setVideoPreviewUrl(f.src)}
                                                sx={{ 
                                                    width: "100%", height: "100%", 
                                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                                    bgcolor: "#111", cursor: "pointer", position: "relative"
                                                }}
                                            >
                                                <Box sx={{
                                                    p: 3, borderRadius: "50%", 
                                                    bgcolor: "rgba(255,255,255,0.1)", 
                                                    backdropFilter: "blur(12px)", 
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    transition: "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                                                    "&:hover": { transform: "scale(1.1)" }
                                                }}>
                                                    <PlayArrowIcon sx={{ color: "#fff", fontSize: 64 }} />
                                                </Box>
                                                <Typography sx={{ color: "rgba(255,255,255,0.7)", mt: 2, fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
                                                    СМОТРЕТЬ ВИДЕО
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <img alt={f.name || `Фото ${i + 1}`} src={f.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                        )}
                                    </div>
                                </SwiperSlide>
                            ))}
                        </Swiper>
                    )}

                    {/* КАСТОМНЫЕ КНОПКИ НАВИГАЦИИ (ДЛЯ ИСКЛЮЧЕНИЯ ПЕРЕСКОКА) */}
                    {!loading && images.length > 1 && !isMobile && (
                        <>
                            <IconButton
                                onClick={(e) => { e.stopPropagation(); localSwiperRef.current?.slidePrev(); }}
                                sx={{
                                    position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 20,
                                    bgcolor: "rgba(0,0,0,0.45)", color: "#fff", backdropFilter: "blur(4px)",
                                    "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
                                    display: "flex",
                                    opacity: activeIdx === 0 ? 0.3 : 1, transition: "all 0.2s"
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
                                    opacity: activeIdx === images.length - 1 ? 0.3 : 1, transition: "all 0.2s"
                                }}
                            >
                                <ArrowBackIcon sx={{ transform: "rotate(180deg)" }} />
                            </IconButton>
                        </>
                    )}

                    <Tooltip title={isFs ? "Выйти из полноэкранного" : "Открыть на весь экран"}>
                        <IconButton
                            onClick={toggleFullscreen}
                            sx={{
                                position: "absolute", top: 12, right: 12, zIndex: 6,
                                bgcolor: "rgba(0,0,0,0.4)", color: "#fff",
                                "&:hover": { bgcolor: "rgba(0,0,0,0.55)" },
                            }}
                            size="large"
                        >
                            {isFs ? <FullscreenExitIcon fontSize="large" /> : <FullscreenIcon fontSize="large" />}
                        </IconButton>
                    </Tooltip>

                    {/* Пояс миниатюр (thumbs) — ВНУТРИ галереи сверху */}
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
                                    px: isMobile ? 0.5 : 1,
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
                                    slideToClickedSlide={true}
                                    style={{ padding: isMobile ? "2px" : "6px 4px" }}
                                >
                                    {images.map((f, i) => {
                                        const isActive = activeIdx === i;
                                        return (
                                            <SwiperSlide 
                                                key={`thumb-${i}`} 
                                                style={{ 
                                                    width: isMobile ? 50 : 72, 
                                                    height: isMobile ? 50 : 72, 
                                                    cursor: "pointer", 
                                                    borderRadius: 10, 
                                                    overflow: "hidden",
                                                    border: isActive ? "2px solid #fff" : "2px solid transparent",
                                                    opacity: isActive ? 1 : 0.5,
                                                    transition: "all 0.2s ease",
                                                    boxSizing: "border-box"
                                                }}
                                            >
                                                {f.type === "video" ? (
                                                    <Box sx={{ 
                                                        width: "100%", 
                                                        height: "100%", 
                                                        bgcolor: "#000", 
                                                        display: "flex", 
                                                        alignItems: "center", 
                                                        justifyContent: "center" 
                                                    }}>
                                                        <PlayCircleOutlineIcon sx={{ color: "#fff", fontSize: isMobile ? 24 : 40 }} />
                                                    </Box>
                                                ) : (
                                                    <img
                                                        src={f.src}
                                                        alt={f.name || `Миниатюра ${i + 1}`}
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                            display: "block",
                                                        }}
                                                    />
                                                )}
                                            </SwiperSlide>
                                        );
                                    })}
                                </Swiper>
                            </Box>
                        </Box>
                    )}
                </Box>

                {/* НИЖНЯЯ ЧАСТЬ: ИНФО-ПАНЕЛЬ */}
                <Box
                    sx={{
                        position: "relative",
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                        zIndex: 4,
                    }}
                >
                    <Box
                        role="button"
                        aria-expanded={expanded}
                        onClick={handleToggle}
                        sx={{
                            width: { xs: "100%", sm: "60vw" },
                            height: expanded
                                ? `${Math.round(Math.max(expandedH, MIN_EXPANDED))}px`
                                : (isMobile ? "32px" : `${Math.round(Math.max(collapsedH, MIN_COLLAPSED))}px`),
                            transition: "height 280ms ease",
                            willChange: "height",
                            bgcolor: "rgba(10, 10, 10, 0.25)",
                            border: "1px solid rgba(255,255,255,0.40)",
                            borderBottom: "none", // прикреплено к низу
                            borderRadius: "28px 28px 0 0",
                            backdropFilter: "blur(20px) saturate(150%)",
                            overflow: "hidden",
                            cursor: "pointer",
                            boxSizing: "border-box",
                        }}
                    >
                        {/* ручка — крупнее */}
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
                            {/* HEADER — 2 строки + ПРОБЛЕМЫ (видны в коллапсе) */}
                            <Box ref={headerRef} sx={{ opacity: isMobile ? (expanded ? 1 : 0) : 1, transition: "opacity 0.2s ease" }}>
                                {/* строка 1 */}
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

                                {/* строка 2 */}
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1 }}>
                                    <Box sx={{ flex: "0 auto", minWidth: 0 }}>
                                        <FieldCompact label="Получатель" value={item.Recipient} />
                                    </Box>
                                    <Box sx={{ flex: "1 auto", minWidth: 0 }}>
                                        <FieldCompact label="Регион" value={item.RecipientRegion} />
                                    </Box>
                                </Box>

                                <Divider sx={{ my: { xs: 0.75, md: 1 }, borderColor: "rgba(255,255,255,0.35)" }} />

                                {/* ПРОБЛЕМЫ — label + chips в одной строке, при нехватке ширины чипы переносятся */}
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

                            {/* BODY — в DOM для измерений, в коллапсе невидим */}
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
                                        {/* ряд 1: Локация • Транспорт */}
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

                                        {/* ряд 2: Нет ЕО — склад (на всю ширину) */}
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
            </Box>

            {/* Fallback fullscreen без затемнения */}
            {fsFallback && (
                <Box onClick={() => setFsFallback(false)} sx={{ position: "fixed", inset: 0, zIndex: 6, bgcolor: "transparent" }}>
                    <Swiper modules={[Navigation, Pagination, Zoom]} navigation pagination={{ clickable: true }} zoom={{ maxRatio: 4 }}
                        spaceBetween={12} slidesPerView={1} style={{ width: "100vw", height: "100vh" }}>
                        {images.map((f, i) => (
                            <SwiperSlide key={`fs-${i}`}>
                                <div className="swiper-zoom-container" style={{ width: "100%", height: "100%" }}>
                                    {f.type === "video" ? (
                                        <VideoPlayerCustom src={f.src} name={f.name} collapsedH={0} />
                                    ) : (
                                        <img alt={f.name || `Фото ${i + 1}`} src={f.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                    )}
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

            {/* Диалог просмотра видео */}
            <VideoPreviewDialog 
                url={videoPreviewUrl} 
                onClose={() => setVideoPreviewUrl(null)} 
            />
        </>
    );
}

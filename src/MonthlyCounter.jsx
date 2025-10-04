// MonthlyCounterBar.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import apiClient, { normalizeNextUrl } from "./api";

/**
 * Верхняя панель:
 *  - слева: ← [фикс. ширина текста месяца/года] →
 *  - справа: крупное число с «liquid-glass» стилем в тонах #171c8f, без чипа.
 *
 * Props:
 * - listTitle?: string            // SP-список (по умолчанию 'ProblemsPallet')
 * - authorId?: number             // Id автора; если не передан — возьмём /web/currentuser
 * - initialMonth?: Date           // стартовый месяц (по умолчанию текущий)
 * - onMonthChange?: (date: Date) => void
 * - position?: "fixed" | "sticky" // позиционирование панели (fixed по умолчанию)
 * - labelWidth?: number           // фиксированная ширина области месяца (по умолчанию 120)
 *
 * Дополнительно:
 * - через ref доступен метод .refresh(), чтобы снаружи принудительно обновить счётчик.
 */
const MonthlyCounterBar = forwardRef(
  (
    {
      listTitle = "ProblemsPallet",
      authorId,
      initialMonth = new Date(),
      onMonthChange,
      position = "fixed",
      labelWidth = 120,
    },
    ref
  ) => {
    const [month, setMonth] = useState(() => new Date(initialMonth));
    const [count, setCount] = useState(0);
    const [resolvedAuthorId, setResolvedAuthorId] = useState(authorId ?? null);
    const [loading, setLoading] = useState(false);

    // Tooltip по нажатию на число
    const [tipOpen, setTipOpen] = useState(false);
    const tipTimer = useRef(null);
    const handleCountClick = () => {
      setTipOpen(true);
      if (tipTimer.current) clearTimeout(tipTimer.current);
      tipTimer.current = setTimeout(() => setTipOpen(false), 1600);
    };
    useEffect(() => () => tipTimer.current && clearTimeout(tipTimer.current), []);

    const label = useMemo(() => {
      const s = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
      return s.charAt(0).toUpperCase() + s.slice(1);
    }, [month]);

    const prettyCount = useMemo(() => {
      if (loading) return "…";
      return new Intl.NumberFormat("ru-RU").format(count);
    }, [count, loading]);

    const getMonthRangeIso = (date) => {
      const startLocal = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
      const nextLocal = new Date(startLocal.getFullYear(), startLocal.getMonth() + 1, 1, 0, 0, 0);
      return { startIso: startLocal.toISOString(), nextIso: nextLocal.toISOString() };
    };

    // Получить текущего пользователя, если authorId не передали
    useEffect(() => {
      let ignore = false;
      const resolveAuthor = async () => {
        if (authorId != null) {
          setResolvedAuthorId(authorId);
          return;
        }
        try {
          const { data } = await apiClient.get("/web/currentuser", {
            headers: { Accept: "application/json;odata=verbose" },
          });
          if (!ignore) setResolvedAuthorId(data?.d?.Id ?? null);
        } catch (e) {
          console.error("Не удалось получить текущего пользователя", e);
          if (!ignore) setResolvedAuthorId(null);
        }
      };
      resolveAuthor();
      return () => {
        ignore = true;
      };
    }, [authorId]);

    // Загрузка количества (с пагинацией по __next)
    const loadPagedCount = useCallback(async () => {
      if (!resolvedAuthorId) {
        setCount(0);
        return;
      }
      setLoading(true);
      try {
        const { startIso, nextIso } = getMonthRangeIso(month);
        const filter =
          `(AuthorId eq ${resolvedAuthorId}) and ` +
          `(Created ge datetime'${startIso}') and (Created lt datetime'${nextIso}')`;

        let nextUrl =
          `/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items` +
          `?$select=Id&$filter=${encodeURIComponent(filter)}` +
          `&$orderby=Id asc&$top=5000`;

        let total = 0;
        let safety = 0;
        while (nextUrl && safety < 100) {
          const { data } = await apiClient.get(nextUrl, {
            headers: { Accept: "application/json;odata=verbose" },
          });
          total += (data?.d?.results || []).length;
          nextUrl = data?.d?.__next ? normalizeNextUrl(data.d.__next) : null;
          safety += 1;
        }
        setCount(total);
      } catch (e) {
        console.error("Не удалось получить количество элементов за месяц", e);
        setCount(0);
      } finally {
        setLoading(false);
      }
    }, [resolvedAuthorId, month, listTitle]);

    // Внешний метод refresh()
    useImperativeHandle(ref, () => ({
      refresh: () => {
        loadPagedCount();
      },
    }));

    // Стартовая и реактивная загрузка
    useEffect(() => {
      loadPagedCount();
    }, [loadPagedCount]);

    const prevMonth = () => {
      setMonth((prev) => {
        const d = new Date(prev);
        d.setMonth(d.getMonth() - 1);
        onMonthChange?.(d);
        return d;
      });
    };
    const nextMonth = () => {
      setMonth((prev) => {
        const d = new Date(prev);
        d.setMonth(d.getMonth() + 1);
        onMonthChange?.(d);
        return d;
      });
    };

    const positionSx =
      position === "fixed"
        ? { position: "fixed", top: 8, left: 8, right: 8 } // контент уедет ПОД панель
        : { position: "sticky", top: 0, left: 0 };          // если всё же нужен sticky

   return (
  <Box
    sx={{
      ...positionSx,
      zIndex: 1200,

      // 🔴 ключ к liquid-glass
      background: "rgba(255,255,255,0.55)",           // полупрозрачный фон
      backdropFilter: "blur(10px) saturate(160%)",
      WebkitBackdropFilter: "blur(10px) saturate(160%)", // Safari

      border: "1px solid rgba(23,28,143,0.12)",
      boxShadow: "0 8px 24px rgba(23,28,143,0.10)",
      borderRadius: 2,

      // панель висит над контентом и НЕ мешает прокрутке под ней
      pointerEvents: "none",

      // внутренние отступы и флексы как были
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 2,
      px: 3,   // лёгкая «воздушка»
      py: 0.5,
    }}
  >
    {/* всё интерактивное внутри — снова включаем события */}
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%", pointerEvents: "auto" }}>
      {/* СЛЕВА: ← | [месяц] | → */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton aria-label="Предыдущий месяц" onClick={prevMonth} size="small">
          <ChevronLeftIcon />
        </IconButton>

        <Box
          sx={{
            width: labelWidth,
            textAlign: "center",
            px: 1,
            py: 0.25,
            borderRadius: 999,
            background: "rgba(23, 28, 143, 0.07)",
            color: "#171c8f",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={label}
          >
            {label}
          </Typography>
        </Box>

        <IconButton aria-label="Следующий месяц" onClick={nextMonth} size="small">
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {/* СПРАВА: число + tooltip */}
      <Tooltip
        title="Кол-во отправленных фотоотчетов за выбранный месяц"
        placement="bottom"
        open={tipOpen}
        onClose={() => setTipOpen(false)}
        disableFocusListener
        disableHoverListener
        enterTouchDelay={0}
        leaveTouchDelay={1200}
        sx={{ mr: 2 }} // отступ от правого края
      >
        <Typography
          component="div"
          role="button"
          onClick={handleCountClick}
          sx={{
            cursor: "pointer",
            userSelect: "none",
            fontFamily: `'Poppins','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`,
            fontWeight: 900,
            fontSize: "clamp(28px, 4.8vw, 48px)",
            lineHeight: 1,
            letterSpacing: 0.5,
            fontVariantNumeric: "tabular-nums",
            background: `
              linear-gradient(
                180deg,
                rgba(23, 28, 143, 0.55) 0%,
                rgba(23, 28, 143, 0.34) 52%,
                rgba(23, 28, 143, 0.20) 100%
              )
            `,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: `
              0 0 12px rgba(23,28,143,0.16),
              0 2px 10px rgba(23,28,143,0.10),
              -1px -1px 0 rgba(255,255,255,0.35)
            `,
            WebkitTextStroke: "0.5px rgba(23,28,143,0.22)",
          }}
        >
          {prettyCount}
        </Typography>
      </Tooltip>
    </Box>
  </Box>
);
  }
);

export default MonthlyCounterBar;

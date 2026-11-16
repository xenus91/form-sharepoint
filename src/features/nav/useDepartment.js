// src/features/nav/useDepartment.js
// Хук: резолв userDepartment из userProfile → isOOB.
// Fail-soft: ошибка UPS → isOOB=false (single-source).
// План: см. artifacts/plan.md (этап 10).

import { useEffect, useRef, useState } from "react";
import { matchDepartment, resolveRouteAccess } from "./routeAccess";

/**
 * @typedef {object} UserProfileLike
 * @property {string|null|undefined} [userDepartment]
 * @property {string|null|undefined} [department]
 * @property {boolean} [loading]
 * @property {Error|null|undefined} [error]
 * @property {() => void|Promise<void>} [refetch]
 */

/**
 * @param {UserProfileLike|null|undefined} userProfile
 * @returns {{
 *   department: string|null,
 *   isOOB: boolean,
 *   status: "loading"|"ready"|"error",
 *   error: Error|null,
 *   refetch: () => void|Promise<void>,
 * }}
 */
export function useDepartment(userProfile) {
  const up = userProfile || {};
  const upDepartment = up.userDepartment ?? up.department ?? null;
  const upLoading = !!up.loading;
  const upError = up.error ?? null;

  const [state, setState] = useState(() => {
    if (upLoading) return { status: "loading", department: null, error: null };
    if (upError && !upDepartment) return { status: "error", department: null, error: upError };
    const { isOOB, reason } = resolveRouteAccess({ department: upDepartment });
    return { status: "ready", department: upDepartment, isOOB, reason, error: null };
  });

  const lastRetriedRef = useRef(0);
  const prevDeptRef = useRef(upDepartment);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    // Если userProfile.loading взведён — loading
    if (upLoading) {
      setState((s) => ({ ...s, status: "loading" }));
      return undefined;
    }
    // Если есть error и dept неизвестен → авто-ретрай 1 раз через 2с
    if (upError && !upDepartment) {
      setState({ status: "error", department: null, error: upError, isOOB: false });
      const now = Date.now();
      if (now - lastRetriedRef.current > 60_000) { // не чаще раза в минуту
        lastRetriedRef.current = now;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          try {
            const r = up?.refetch && up.refetch();
            if (r && typeof r.then === "function") {
              // eslint-disable-next-line no-void
              void r.then(() => {}).catch(() => {});
            }
          } catch (_e) { void _e; }
        }, 2000);
      }
      return () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };
    }
    // ready
    if (prevDeptRef.current !== upDepartment || upDepartment) {
      prevDeptRef.current = upDepartment;
      const { isOOB, reason } = resolveRouteAccess({ department: upDepartment });
      try {
        // eslint-disable-next-line no-console
        console.log("[useDepartment]", { department: upDepartment, isOOB, reason });
      } catch (_e) { void _e; }
      setState({ status: "ready", department: upDepartment, isOOB, reason, error: null });
    }
    return undefined;
  }, [upLoading, upError, upDepartment, up?.refetch]);

  return {
    department: state.department,
    isOOB: !!state.isOOB,
    status: state.status,
    error: state.error || null,
    refetch: up?.refetch || (() => {}),
    reason: state.reason || null,
  };
}
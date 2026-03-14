"use client";
import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

export function useInactivityTimeout(onTimeout, timeout = INACTIVITY_TIMEOUT) {
  const router = useRouter();
  const timeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      } else {
        router.push("/admin-login?timeout=true");
      }
    }, timeout);
  }, [onTimeout, timeout, router]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer]);

  return { resetTimer };
}

export function useInactivityWarning(onTimeout, timeout = INACTIVITY_TIMEOUT) {
  const router = useRouter();
  const timeoutRef = useRef(null);
  const warningRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const showWarningRef = useRef(false);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarningRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    warningRef.current = setTimeout(() => {
      showWarningRef.current = true;

      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, Math.ceil((timeout - elapsed) / 1000));

      if (confirm(`Sesión por expirar en ${remaining} segundos. ¿Deseas seguir conectado?`)) {
        resetTimer();
      } else {
        if (onTimeout) onTimeout();
        else router.push("/admin-login?timeout=true");
      }

      showWarningRef.current = false;
    }, timeout - 60000);

    timeoutRef.current = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      } else {
        router.push("/admin-login?timeout=true");
      }
    }, timeout);
  }, [onTimeout, timeout, router]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [resetTimer]);

  return { resetTimer };
}

export default useInactivityTimeout;

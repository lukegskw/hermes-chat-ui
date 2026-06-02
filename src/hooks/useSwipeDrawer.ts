import { useEffect, RefObject } from "react";

interface SwipeDrawerOptions {
  edgeZone?: number;
  threshold?: number;
  velocityThreshold?: number;
  sidebarWidth?: number;
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  enabled?: boolean;
}

export function useSwipeDrawer(
  sidebarRef: RefObject<HTMLElement | null>,
  backdropRef: RefObject<HTMLElement | null>,
  options: SwipeDrawerOptions,
) {
  const {
    edgeZone = 30,
    threshold = 0.4,
    velocityThreshold = 0.5,
    sidebarWidth = 290, // from index.css mobile var
    onOpen,
    onClose,
    isOpen,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    // Only apply on mobile devices
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let startTime = 0;
    let isTracking = false;
    let isClosing = false;

    const sidebar = sidebarRef.current;

    if (!sidebar) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();

      // If closed, only track if starting near left edge
      if (!isOpen && startX <= edgeZone) {
        isTracking = true;
        isClosing = false;
      }
      // If open, check if they started touching the sidebar or backdrop to close
      else if (isOpen) {
        isTracking = true;
        isClosing = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTracking) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // Angle check - if scrolling vertically, abort tracking
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        isTracking = false;
        resetStyles();
        return;
      }

      currentX = touch.clientX;

      // Calculate new position
      let newTranslateX: number;
      let progress: number;

      const backdrop = backdropRef.current; // Get current backdrop if it exists

      if (!isClosing) {
        // Opening swipe (left to right)
        if (deltaX < 0) return; // Don't swipe left into nothing
        const clampedDelta = Math.min(deltaX, sidebarWidth);
        newTranslateX = -sidebarWidth + clampedDelta;
        progress = clampedDelta / sidebarWidth;
      } else {
        // Closing swipe (right to left)
        if (deltaX > 0) return; // Don't swipe right past open
        const clampedDelta = Math.max(deltaX, -sidebarWidth);
        newTranslateX = clampedDelta;
        progress = 1 - Math.abs(clampedDelta) / sidebarWidth;
      }

      // Apply styles directly for 60fps performance
      // Prevent CSS transitions during drag
      sidebar.style.transition = "none";
      sidebar.style.transform = `translateX(${newTranslateX}px)`;

      if (backdrop) {
        backdrop.style.display = "block";
        backdrop.style.transition = "none";
        backdrop.style.opacity = (progress * 0.65).toString();
      }
    };

    const handleTouchEnd = () => {
      if (!isTracking) return;
      isTracking = false;

      const deltaX = currentX - startX;
      const deltaTime = Date.now() - startTime;
      const velocity = Math.abs(deltaX / deltaTime);

      const isFastFlick = velocity > velocityThreshold && Math.abs(deltaX) > 10;
      const pastThreshold = Math.abs(deltaX) > sidebarWidth * threshold;

      const backdrop = backdropRef.current;

      // Restore CSS transitions
      sidebar.style.transition = "";
      if (backdrop) {
        backdrop.style.transition = "";
      }

      if (!isClosing) {
        if (isFastFlick || pastThreshold) {
          // Complete open
          sidebar.style.transform = "";
          if (backdrop) backdrop.style.opacity = "";
          onOpen();
        } else {
          // Snap back closed
          sidebar.style.transform = `translateX(-100%)`;
          if (backdrop) {
            backdrop.style.opacity = "0";
            setTimeout(() => {
              if (backdropRef.current)
                backdropRef.current.style.display = "none";
            }, 350);
          }
        }
      } else {
        if (isFastFlick || pastThreshold) {
          // Complete close
          sidebar.style.transform = `translateX(-100%)`;
          if (backdrop) {
            backdrop.style.opacity = "0";
            setTimeout(() => {
              if (backdropRef.current)
                backdropRef.current.style.display = "none";
            }, 350);
          }
          onClose();
        } else {
          // Snap back open
          sidebar.style.transform = "translateX(0)";
          if (backdrop) backdrop.style.opacity = "0.65";
        }
      }

      // Clean up inline styles so CSS classes take over
      setTimeout(resetStyles, 350);
    };

    const resetStyles = () => {
      sidebar.style.transform = "";
      sidebar.style.transition = "";

      const backdrop = backdropRef.current;
      if (backdrop) {
        backdrop.style.opacity = "";
        backdrop.style.transition = "";
        // Do not touch display here, let React handle it via isSidebarOpen state
      }
    };

    // Attach to document to catch edge swipes reliably
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      resetStyles();
    };
  }, [
    isOpen,
    onOpen,
    onClose,
    edgeZone,
    threshold,
    velocityThreshold,
    sidebarWidth,
    enabled,
    sidebarRef,
    backdropRef,
  ]);
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "../../config/env";
import { X } from "../Icons";
import styles from "./MessageBubble.module.scss";

type ImageLightboxProps = {
  images: string[];
};

export const ImageLightbox = ({ images }: ImageLightboxProps) => {
  const { t } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const displayedImages = images.map((url) =>
    url.startsWith("/api/attachments/") ? `${getApiUrl()}${url}` : url,
  );

  useEffect(() => {
    if (!selectedImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedImage(null);
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [selectedImage]);

  if (displayedImages.length === 0) return null;
  return (
    <>
      <div className={styles.messageImages}>
        {displayedImages.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            className={styles.imageWrapper}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setSelectedImage(url);
            }}
            aria-label={t("messages.openImage", { index: index + 1 })}
          >
            <img
              src={url}
              alt={t("messages.attachment")}
              className={styles.image}
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
      {selectedImage &&
        createPortal(
          <div
            className={styles.lightboxBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label={t("messages.imagePreview")}
            onClick={() => setSelectedImage(null)}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.lightboxClose}
              aria-label={t("messages.closeImage")}
              onClick={() => setSelectedImage(null)}
            >
              <X size={22} />
            </button>
            <img
              src={selectedImage}
              alt={t("messages.imagePreview")}
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
};

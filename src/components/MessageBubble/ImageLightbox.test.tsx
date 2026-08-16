// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) =>
      key === "messages.openImage"
        ? `Open image ${values?.index}`
        : ({
            "messages.attachment": "attachment",
            "messages.imagePreview": "Enlarged image",
            "messages.closeImage": "Close image",
          }[key] ?? key),
  }),
}));

afterEach(cleanup);

describe("conversation image lightbox", () => {
  it("opens any rendered image and closes outside it", () => {
    render(<ImageLightbox images={["/api/attachments/one"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open image 1" }));
    const dialog = screen.getByRole("dialog", { name: "Enlarged image" });
    const image = screen.getByRole("img", { name: "Enlarged image" });
    fireEvent.click(image);
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and restores body scrolling", () => {
    document.body.style.overflow = "auto";
    render(<ImageLightbox images={["data:image/png;base64,abc"]} />);
    const trigger = screen.getByRole("button", { name: "Open image 1" });
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close image" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });
});

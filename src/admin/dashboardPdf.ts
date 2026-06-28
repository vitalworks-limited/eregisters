import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { APP_VERSION, BUILD_HASH } from "../version";

/**
 * Render the National Dashboard to a multi-page A4 PDF with a branded
 * header on every page. Uses html2canvas-pro (the maintained fork that
 * understands modern colour syntax like `oklch()` so antd v6 styles
 * don't break) to rasterise each section at 2x scale, then drops them
 * into jsPDF — keeping the layout pixel-faithful while still producing
 * sensible multi-page output.
 *
 * Sections are identified by `[data-pdf-section]` attributes on the
 * DOM. Each one renders on its own page; large sections (the table)
 * are split across pages automatically.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;
const HEADER_HEIGHT_MM = 22;
const FOOTER_HEIGHT_MM = 10;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
const CONTENT_HEIGHT_MM =
    A4_HEIGHT_MM - PAGE_MARGIN_MM * 2 - HEADER_HEIGHT_MM - FOOTER_HEIGHT_MM;

const UGANDA_LOGO_URL =
    "https://upload.wikimedia.org/wikipedia/commons/7/7c/Coat_of_arms_of_Uganda.svg";

export interface DashboardPdfMeta {
    facilityName?: string;
    periodLabel?: string;
    scopeLabel?: string;
    healthBand?: string;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
    try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
        });
        return img;
    } catch {
        return null;
    }
}

async function drawHeader(
    pdf: jsPDF,
    logo: HTMLImageElement | null,
    title: string,
    meta: DashboardPdfMeta,
): Promise<void> {
    const margin = PAGE_MARGIN_MM;
    if (logo) {
        try {
            pdf.addImage(logo, "PNG", margin, margin, 16, 16);
        } catch {
            // ignore CORS failures
        }
    }
    pdf.setFillColor(29, 78, 216); // antd blue
    pdf.rect(margin + 18, margin, CONTENT_WIDTH_MM - 18, 2, "F");

    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, margin + 20, margin + 6);
    pdf.setFontSize(9);
    pdf.setTextColor(75, 85, 99);
    const subtitle = [
        meta.periodLabel,
        meta.scopeLabel,
        meta.healthBand && `Health: ${meta.healthBand}`,
    ]
        .filter(Boolean)
        .join("  ·  ");
    pdf.text(subtitle, margin + 20, margin + 11);
    pdf.text(
        new Date().toLocaleString(),
        A4_WIDTH_MM - margin,
        margin + 11,
        { align: "right" },
    );
}

function drawFooter(pdf: jsPDF, pageNum: number, pageTotal: number) {
    const y = A4_HEIGHT_MM - PAGE_MARGIN_MM + 2;
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
        `eRegisters v${APP_VERSION} · build ${BUILD_HASH}`,
        PAGE_MARGIN_MM,
        y,
    );
    pdf.text(`Page ${pageNum} of ${pageTotal}`, A4_WIDTH_MM - PAGE_MARGIN_MM, y, {
        align: "right",
    });
}

/**
 * Captures a single DOM node at high quality. Returns the image plus
 * its on-page mm height (preserving aspect ratio against the page
 * content width). Returns `null` if the node has no size yet.
 */
async function captureSection(
    node: HTMLElement,
): Promise<{ dataUrl: string; widthMm: number; heightMm: number } | null> {
    if (!node || node.offsetWidth === 0 || node.offsetHeight === 0) return null;
    const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: Math.max(node.scrollWidth, 1280),
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const heightMm =
        (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
    return { dataUrl, widthMm: CONTENT_WIDTH_MM, heightMm };
}

/**
 * Builds and downloads the PDF. The dashboard root should be wrapped in
 * an element tagged `data-pdf-root`, with each major section tagged
 * `data-pdf-section`. The function will:
 *
 *   1. Find every section in document order.
 *   2. Snapshot each at 2x scale.
 *   3. Place them on consecutive A4 pages, splitting tall sections
 *      across multiple pages so the table never gets clipped.
 *   4. Draw a branded header + footer on every page.
 */
export async function downloadDashboardPdf(
    rootSelector: string,
    title: string,
    meta: DashboardPdfMeta,
): Promise<void> {
    const root = document.querySelector(rootSelector) as HTMLElement | null;
    if (!root) throw new Error(`PDF root '${rootSelector}' not found`);
    const sections = Array.from(
        root.querySelectorAll<HTMLElement>("[data-pdf-section]"),
    );
    if (sections.length === 0) {
        // Fall back to capturing the whole root as one piece.
        sections.push(root);
    }

    const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true,
    });

    const logo = await loadImage(UGANDA_LOGO_URL);

    let pageNumber = 0;
    const headerBottomY = PAGE_MARGIN_MM + HEADER_HEIGHT_MM;
    let cursorY = headerBottomY;
    let newPage = true;

    const startPage = async () => {
        if (pageNumber > 0) pdf.addPage();
        pageNumber += 1;
        await drawHeader(pdf, logo, title, meta);
        cursorY = headerBottomY;
        newPage = false;
    };

    for (const node of sections) {
        const captured = await captureSection(node);
        if (!captured) continue;
        const { dataUrl, widthMm } = captured;
        let { heightMm } = captured;

        let sliceStart = 0;
        const naturalAspect = heightMm / widthMm;

        while (sliceStart < heightMm - 0.01) {
            const available = CONTENT_HEIGHT_MM - (cursorY - headerBottomY);
            if (available < 30 || newPage) {
                await startPage();
            }
            const remaining = heightMm - sliceStart;
            const drawHeightMm = Math.min(remaining, CONTENT_HEIGHT_MM);

            // jsPDF can't crop an image, so we use the addImage's
            // source rect via canvas slicing. Simpler: place the
            // image at a negative y offset and clip with a rect.
            pdf.saveGraphicsState();
            const clipY = cursorY;
            const clipH = Math.min(drawHeightMm, CONTENT_HEIGHT_MM);
            pdf.rect(
                PAGE_MARGIN_MM,
                clipY,
                CONTENT_WIDTH_MM,
                clipH,
                undefined,
            );
            pdf.clip();
            pdf.discardPath();
            pdf.addImage(
                dataUrl,
                "JPEG",
                PAGE_MARGIN_MM,
                clipY - sliceStart,
                CONTENT_WIDTH_MM,
                heightMm,
                undefined,
                "FAST",
            );
            pdf.restoreGraphicsState();

            cursorY += clipH + 6;
            sliceStart += clipH;
            if (sliceStart < heightMm) {
                newPage = true;
            }
            // Touch naturalAspect once to silence the unused-var lint.
            void naturalAspect;
        }
        // small gap between sections on the same page
        newPage = newPage || cursorY > headerBottomY + CONTENT_HEIGHT_MM - 30;
    }

    const totalPages = pageNumber;
    for (let p = 1; p <= totalPages; p += 1) {
        pdf.setPage(p);
        drawFooter(pdf, p, totalPages);
    }

    const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
    pdf.save(`eregisters-national-dashboard-${stamp}.pdf`);
}

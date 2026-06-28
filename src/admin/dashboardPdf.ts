import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { APP_VERSION, BUILD_HASH } from "../version";

/**
 * Render the National Dashboard to a multi-page A4 PDF with a branded
 * header on every page.
 *
 * Layout strategy: each `[data-pdf-section]` element is captured at 2x
 * scale via html2canvas-pro, then the canvas is sliced into A4-sized
 * tiles in image space (no PDF clipping). Each tile lands on its own
 * page, so sections cannot overlap and tall sections (the contributors
 * table) split cleanly across pages. Every page gets a branded header
 * and a footer regardless of section.
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
            /* ignore CORS failures */
        }
    }
    pdf.setFillColor(29, 78, 216);
    pdf.rect(margin + 18, margin, CONTENT_WIDTH_MM - 18, 1.5, "F");

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
    pdf.text(
        `Page ${pageNum} of ${pageTotal}`,
        A4_WIDTH_MM - PAGE_MARGIN_MM,
        y,
        { align: "right" },
    );
}

interface SectionPage {
    dataUrl: string;
    /** millimetres */
    heightMm: number;
}

/**
 * Snapshots a DOM node at 2x scale, then slices the canvas into A4-page
 * tiles. Returns one image per PDF page. The image width is fixed at
 * CONTENT_WIDTH_MM; the height of the last tile may be shorter.
 */
async function captureSectionAsPages(
    node: HTMLElement,
): Promise<SectionPage[]> {
    if (!node || node.offsetWidth === 0 || node.offsetHeight === 0) return [];
    const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: Math.max(node.scrollWidth, 1280),
    });
    const totalHeightMm =
        (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
    // How many image pixels correspond to one full content page.
    const pxPerMm = canvas.width / CONTENT_WIDTH_MM;
    const pagePxHeight = Math.floor(CONTENT_HEIGHT_MM * pxPerMm);

    if (totalHeightMm <= CONTENT_HEIGHT_MM) {
        return [
            {
                dataUrl: canvas.toDataURL("image/jpeg", 0.92),
                heightMm: totalHeightMm,
            },
        ];
    }

    const pages: SectionPage[] = [];
    let sourceY = 0;
    while (sourceY < canvas.height) {
        const sliceH = Math.min(pagePxHeight, canvas.height - sourceY);
        const tile = document.createElement("canvas");
        tile.width = canvas.width;
        tile.height = sliceH;
        const ctx = tile.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tile.width, tile.height);
        ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceH,
            0,
            0,
            canvas.width,
            sliceH,
        );
        pages.push({
            dataUrl: tile.toDataURL("image/jpeg", 0.92),
            heightMm: (sliceH / canvas.width) * CONTENT_WIDTH_MM,
        });
        sourceY += sliceH;
    }
    return pages;
}

/**
 * Builds and downloads the PDF.
 *
 * Workflow:
 *   1. Find every `[data-pdf-section]` under `rootSelector`.
 *   2. For each, capture + slice into A4-page-sized image tiles.
 *   3. Each tile lands on its own PDF page (new section ⇒ new page,
 *      and tall sections cascade onto consecutive pages).
 *   4. Draw the branded header + footer on every page.
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

    for (const node of sections) {
        const pages = await captureSectionAsPages(node);
        if (pages.length === 0) continue;
        for (const tile of pages) {
            if (pageNumber > 0) pdf.addPage();
            pageNumber += 1;
            await drawHeader(pdf, logo, title, meta);
            pdf.addImage(
                tile.dataUrl,
                "JPEG",
                PAGE_MARGIN_MM,
                PAGE_MARGIN_MM + HEADER_HEIGHT_MM,
                CONTENT_WIDTH_MM,
                tile.heightMm,
                undefined,
                "FAST",
            );
        }
    }

    // Empty doc — fall back to a single blank page so we don't crash.
    if (pageNumber === 0) {
        pageNumber += 1;
        await drawHeader(pdf, logo, title, meta);
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

import dayjs from "dayjs";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";

// Subset of the program metadata the print template needs. Caller passes
// it in so this file stays free of `useMetadata()` and React.
interface PrintProgramMetadata {
    programStages?: Array<{ id: string; name: string }>;
    organisations?: Map<string, string>;
}

// Attribute / data element IDs match the patient detail route.
const ATTR = {
    firstName: "KSq9EyZ8ZFi",
    surname: "TWPNbc9O2nK",
    sex: "bqliZKdUGMX",
    dob: "Y3DE5CZWySr",
    nin: "BiTsLcJQ95V",
    phone: "sB1IHYu2xQT",
    clientId: "oTI0DLitzFY",
    village: "xcYGVzmcWvi",
    category: "N6Y4aCbmHHt",
} as const;

const DV = {
    services: "mrKZWf2WMIC",
    immunization: "ZuYU54N4pjS",
    referral: "EzGu4kzZZTz",
    weight: "scpPwoNsS27",
    height: "uIFJ94mZt0S",
} as const;

function esc(value: unknown): string {
    if (value === undefined || value === null || value === "") return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function fallback(value: string): string {
    return value ? esc(value) : '<span class="muted">—</span>';
}

function tagsHtml(raw: unknown, kind: "service" | "imm"): string {
    if (!raw) return '<span class="muted">—</span>';
    const items = Array.isArray(raw) ? raw : String(raw).split(",");
    const clean = items.map((s) => String(s).trim()).filter(Boolean);
    if (clean.length === 0) return '<span class="muted">—</span>';
    const cls = kind === "service" ? "chip chip-service" : "chip chip-imm";
    return clean.map((s) => `<span class="${cls}">${esc(s)}</span>`).join("");
}

function ageFromDob(dob: string | undefined): string {
    if (!dob) return "";
    const d = dayjs(dob);
    if (!d.isValid()) return "";
    return `${dayjs().diff(d, "year")} yrs`;
}

export interface PrintInput {
    trackedEntity: FlattenedTrackedEntity;
    enrollment: FlattenedEnrollment;
    events: FlattenedEvent[];
    program: PrintProgramMetadata;
    facilityName?: string;
}

export function buildPatientSummaryHtml({
    trackedEntity,
    enrollment,
    events,
    program,
    facilityName,
}: PrintInput): string {
    const a = trackedEntity.attributes ?? {};
    const firstName = String(a[ATTR.firstName] ?? "").trim();
    const surname = String(a[ATTR.surname] ?? "").trim();
    const fullName = [firstName, surname].filter(Boolean).join(" ") || "Patient";
    const sex = String(a[ATTR.sex] ?? "").trim();
    const dob = String(a[ATTR.dob] ?? "").trim();
    const age = ageFromDob(dob);
    const nin = String(a[ATTR.nin] ?? "").trim();
    const phone = String(a[ATTR.phone] ?? "").trim();
    const clientId = String(a[ATTR.clientId] ?? "").trim();
    const villageRaw = String(a[ATTR.village] ?? "").trim();
    const villageMatch = villageRaw.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
    const village = villageMatch ? villageMatch[1].trim() : villageRaw;
    const parish = villageMatch ? villageMatch[2].trim() : "";
    const category = String(a[ATTR.category] ?? "").trim();
    const registeredAt = trackedEntity.createdAt
        ? dayjs(trackedEntity.createdAt).format("MMM D, YYYY")
        : "";
    const enrolledAt = enrollment.enrolledAt
        ? dayjs(enrollment.enrolledAt).format("MMM D, YYYY")
        : "";

    const stageName = (id: string) =>
        program.programStages?.find((s) => s.id === id)?.name ?? id;

    const visitsRows = events
        .map((ev) => {
            const dv = ev.dataValues ?? {};
            const when = dayjs(ev.occurredAt ?? ev.createdAt).format(
                "MMM D, YYYY",
            );
            const weight = dv[DV.weight];
            const height = dv[DV.height];
            const ref = String(dv[DV.referral] ?? "").trim();
            return `
                <tr>
                    <td class="cell-date">${esc(when)}</td>
                    <td class="cell-stage">${esc(stageName(ev.programStage))}</td>
                    <td>${tagsHtml(dv[DV.services], "service")}</td>
                    <td>${tagsHtml(dv[DV.immunization], "imm")}</td>
                    <td class="cell-num">${weight ? `${esc(weight)} kg` : '<span class="muted">—</span>'}</td>
                    <td class="cell-num">${height ? `${esc(height)} cm` : '<span class="muted">—</span>'}</td>
                    <td>${ref ? esc(ref) : '<span class="muted">—</span>'}</td>
                </tr>
            `;
        })
        .join("");

    const printedAt = dayjs().format("MMM D, YYYY · HH:mm");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(fullName)} — Patient summary</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm 12mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0F172A;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5pt;
    line-height: 1.45;
  }
  header.page-head {
    border-bottom: 1px solid #1F4788;
    padding-bottom: 6mm;
    margin-bottom: 6mm;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8mm;
  }
  .brand {
    font-size: 14pt;
    font-weight: 600;
    color: #1F4788;
    letter-spacing: -0.2px;
  }
  .brand small {
    font-weight: 400;
    color: #475569;
    font-size: 10pt;
    display: block;
    margin-top: 1mm;
  }
  .printed-at {
    text-align: right;
    color: #475569;
    font-size: 9pt;
  }
  .printed-at strong { color: #0F172A; font-weight: 600; }

  h2.section {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    margin: 6mm 0 2mm;
    font-weight: 600;
    border-bottom: 1px solid #E5E7EB;
    padding-bottom: 1.5mm;
  }

  .patient-banner {
    border: 1px solid #E5E7EB;
    padding: 5mm 6mm;
    display: flex;
    gap: 6mm;
    align-items: center;
    margin-bottom: 6mm;
  }
  .patient-banner .avatar {
    width: 18mm;
    height: 18mm;
    background: #1F4788;
    color: #fff;
    font-size: 14pt;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .patient-banner .who h1 {
    margin: 0;
    font-size: 16pt;
    font-weight: 600;
    color: #0F172A;
  }
  .patient-banner .who .tags {
    margin-top: 1.5mm;
    color: #475569;
    font-size: 10.5pt;
  }
  .patient-banner .who .tags span + span::before {
    content: " · ";
    color: #CBD5E1;
    padding: 0 2mm;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm 10mm;
  }
  .field {
    display: flex;
    flex-direction: column;
    border-bottom: 1px dotted #E5E7EB;
    padding-bottom: 2mm;
  }
  .field .label {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94A3B8;
    margin-bottom: 0.5mm;
  }
  .field .value { color: #0F172A; }
  .muted { color: #94A3B8; }

  table.visits {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2mm;
  }
  table.visits th,
  table.visits td {
    border-bottom: 1px solid #E5E7EB;
    padding: 2.5mm 2mm;
    text-align: left;
    vertical-align: top;
    font-size: 10.5pt;
  }
  table.visits th {
    font-weight: 600;
    color: #475569;
    background: #F8FAFC;
    border-top: 1px solid #E5E7EB;
  }
  table.visits .cell-date { white-space: nowrap; font-weight: 500; }
  table.visits .cell-stage { color: #475569; }
  table.visits .cell-num { white-space: nowrap; }

  .chip {
    display: inline-block;
    padding: 0.5mm 1.5mm;
    border-radius: 1mm;
    font-size: 9pt;
    line-height: 1.3;
    margin: 0 1mm 1mm 0;
    border: 1px solid currentColor;
  }
  .chip-service { color: #1F4788; }
  .chip-imm { color: #16A34A; }

  footer.page-foot {
    margin-top: 8mm;
    padding-top: 3mm;
    border-top: 1px solid #E5E7EB;
    color: #94A3B8;
    font-size: 9pt;
    display: flex;
    justify-content: space-between;
    gap: 4mm;
  }
  footer.page-foot a { color: #1F4788; text-decoration: none; }

  .no-data {
    color: #94A3B8;
    padding: 4mm;
    text-align: center;
    border: 1px dashed #E5E7EB;
  }

  @media screen {
    body { padding: 12mm; background: #F5F7FB; }
    .sheet {
      background: #fff;
      max-width: 210mm;
      margin: 0 auto;
      padding: 14mm 12mm;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
  }
  @media print {
    .sheet { padding: 0; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header class="page-head">
    <div class="brand">
      Medical eRegistry
      <small>${esc(facilityName ?? "")}</small>
    </div>
    <div class="printed-at">
      <strong>Patient summary</strong><br />
      Printed ${esc(printedAt)}
    </div>
  </header>

  <section class="patient-banner">
    <div class="avatar">${esc(((firstName[0] ?? "") + (surname[0] ?? "")).toUpperCase() || "P")}</div>
    <div class="who">
      <h1>${esc(fullName)}</h1>
      <div class="tags">
        ${sex ? `<span>${esc(sex)}</span>` : ""}
        ${age ? `<span>${esc(age)}</span>` : ""}
        ${clientId ? `<span>ID ${esc(clientId)}</span>` : ""}
        ${nin ? `<span>NIN ${esc(nin)}</span>` : ""}
      </div>
    </div>
  </section>

  <h2 class="section">Patient details</h2>
  <div class="grid">
    <div class="field"><div class="label">Client ID</div><div class="value">${fallback(clientId)}</div></div>
    <div class="field"><div class="label">National ID</div><div class="value">${fallback(nin)}</div></div>
    <div class="field"><div class="label">Phone</div><div class="value">${fallback(phone)}</div></div>
    <div class="field"><div class="label">Sex</div><div class="value">${fallback(sex)}</div></div>
    <div class="field"><div class="label">Date of birth</div><div class="value">${dob ? esc(dayjs(dob).format("MMM D, YYYY")) : '<span class="muted">—</span>'}</div></div>
    <div class="field"><div class="label">Age</div><div class="value">${fallback(age)}</div></div>
    <div class="field"><div class="label">Village</div><div class="value">${fallback(village)}</div></div>
    <div class="field"><div class="label">Parish</div><div class="value">${fallback(parish)}</div></div>
    <div class="field"><div class="label">Client category</div><div class="value">${fallback(category)}</div></div>
    <div class="field"><div class="label">Facility</div><div class="value">${fallback(facilityName ?? "")}</div></div>
    <div class="field"><div class="label">Registered</div><div class="value">${fallback(registeredAt)}</div></div>
    <div class="field"><div class="label">Enrolled</div><div class="value">${fallback(enrolledAt)}</div></div>
  </div>

  <h2 class="section">Visit history (${events.length})</h2>
  ${
      events.length === 0
          ? `<div class="no-data">No visits recorded.</div>`
          : `<table class="visits">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Stage</th>
                        <th>Services</th>
                        <th>Immunization</th>
                        <th>Weight</th>
                        <th>Height</th>
                        <th>Referral</th>
                    </tr>
                </thead>
                <tbody>${visitsRows}</tbody>
            </table>`
  }

  <footer class="page-foot">
    <span>Developed by <a href="https://www.hispuganda.org">HISP Uganda</a> · © ${dayjs().year()}</span>
    <span>Source: Medical eRegistry · DHIS2</span>
  </footer>
</div>
</body>
</html>`;
}

/**
 * Open a new window with a print-ready HTML summary of the patient, then
 * trigger print. Bypasses the DHIS2 app shell entirely so the
 * top-of-app bar, sync popovers, tabs, etc. never make it onto paper.
 */
export function printPatientSummary(input: PrintInput): void {
    const html = buildPatientSummaryHtml(input);
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!win) {
        // Pop-up blocked. Fall back to a Blob URL the user can open
        // manually — still bypasses the app shell when printed.
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Give the new document a tick to paint before invoking print.
    const trigger = () => {
        try {
            win.focus();
            win.print();
        } catch {
            // ignore — user can still print from the menu.
        }
    };
    if (win.document.readyState === "complete") {
        setTimeout(trigger, 50);
    } else {
        win.addEventListener("load", () => setTimeout(trigger, 50));
    }
}

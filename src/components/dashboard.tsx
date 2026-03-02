import React, { useState, ReactNode } from "react";
import {
    Avatar,
    Badge,
    Button,
    Collapse,
    Descriptions,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Radio,
    Row,
    Col,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    DatePicker,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
    ArrowLeftOutlined,
    BellOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    EditOutlined,
    EnvironmentOutlined,
    ExclamationCircleOutlined,
    ExperimentOutlined,
    FileTextOutlined,
    IdcardOutlined,
    MedicineBoxOutlined,
    PhoneOutlined,
    PlusCircleOutlined,
    PlusOutlined,
    SaveOutlined,
    UserOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SyncStatus = "Synced" | "Pending" | "Failed";
type EventStatus = "COMPLETED" | "ACTIVE" | "SCHEDULE" | "OVERDUE";
type EnrollmentStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

type SectionKey =
    | "triage"
    | "screening"
    | "maternity"
    | "postnatal"
    | "child_health"
    | "art"
    | "emergency"
    | "gbv"
    | "lab"
    | "medicines"
    | "contact_tracing"
    | "outpatient";

interface SectionConfig {
    key: SectionKey;
    label: string;
    isProgramStage: boolean;
    icon: ReactNode;
}

interface SubEvent {
    id: string;
    date: string;
    status: EventStatus;
    dataValues: Record<string, string>;
}

interface Visit {
    id: string;
    date: string;
    services: SectionKey[];
    syncStatus: SyncStatus;
    sectionData: Partial<Record<SectionKey, Record<string, unknown>>>;
    stageEvents: Partial<Record<SectionKey, SubEvent[]>>;
}

interface TrackedEntityInstance {
    id: string;
    name: string;
    dob: string;
    age: number;
    sex: string;
    nin: string;
    phone: string;
    district: string;
    facility: string;
    village: string;
    registeredOn: string;
}

interface Enrollment {
    id: string;
    program: string;
    enrolledOn: string;
    enrolledBy: string;
    orgUnit: string;
    status: EnrollmentStatus;
    incidentDate: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const ALL_SECTIONS: SectionConfig[] = [
    {
        key: "triage",
        label: "Triage Details",
        isProgramStage: false,
        icon: <MedicineBoxOutlined />,
    },
    {
        key: "screening",
        label: "Screening",
        isProgramStage: false,
        icon: <ExperimentOutlined />,
    },
    {
        key: "maternity",
        label: "Maternity",
        isProgramStage: true,
        icon: <MedicineBoxOutlined />,
    },
    {
        key: "postnatal",
        label: "Postnatal",
        isProgramStage: true,
        icon: <MedicineBoxOutlined />,
    },
    {
        key: "child_health",
        label: "Child Health Services",
        isProgramStage: true,
        icon: <UserOutlined />,
    },
    {
        key: "art",
        label: "ART",
        isProgramStage: true,
        icon: <MedicineBoxOutlined />,
    },
    {
        key: "emergency",
        label: "Emergency Services",
        isProgramStage: false,
        icon: <ExclamationCircleOutlined />,
    },
    {
        key: "gbv",
        label: "GBV",
        isProgramStage: false,
        icon: <FileTextOutlined />,
    },
    {
        key: "lab",
        label: "Laboratory Tests",
        isProgramStage: false,
        icon: <ExperimentOutlined />,
    },
    {
        key: "medicines",
        label: "Medicines and Supplies",
        isProgramStage: false,
        icon: <MedicineBoxOutlined />,
    },
    {
        key: "contact_tracing",
        label: "Contact Tracing",
        isProgramStage: false,
        icon: <PhoneOutlined />,
    },
    {
        key: "outpatient",
        label: "Outpatient",
        isProgramStage: false,
        icon: <UserOutlined />,
    },
];

const SERVICE_LABELS: Record<SectionKey, string> = {
    triage: "TRIAGE",
    screening: "SCREENING",
    maternity: "MATERNITY",
    postnatal: "POSTNATAL",
    child_health: "CHILD HEALTH",
    art: "ART",
    emergency: "EMERGENCY SERVICES",
    gbv: "GBV",
    lab: "LAB TESTS",
    medicines: "MEDICINES",
    contact_tracing: "CONTACT TRACING",
    outpatient: "OUTPATIENT",
};

const SERVICE_COLORS: Record<SectionKey, string> = {
    triage: "purple",
    screening: "cyan",
    maternity: "blue",
    postnatal: "geekblue",
    child_health: "green",
    art: "volcano",
    emergency: "red",
    gbv: "magenta",
    lab: "gold",
    medicines: "lime",
    contact_tracing: "orange",
    outpatient: "blue",
};

const STATUS_META: Record<
    EventStatus,
    { color: string; icon: ReactNode; label: string }
> = {
    COMPLETED: {
        color: "#52c41a",
        icon: <CheckCircleOutlined />,
        label: "Completed",
    },
    ACTIVE: {
        color: "#1677ff",
        icon: <ClockCircleOutlined />,
        label: "Active",
    },
    SCHEDULE: { color: "#faad14", icon: <BellOutlined />, label: "Scheduled" },
    OVERDUE: {
        color: "#ff4d4f",
        icon: <ExclamationCircleOutlined />,
        label: "Overdue",
    },
};

const getSectionConfig = (key: SectionKey): SectionConfig =>
    ALL_SECTIONS.find((s) => s.key === key)!;

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA  (replace with your real API calls)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TEI: TrackedEntityInstance = {
    id: "TEI-00421",
    name: "Nakamya Fatuma",
    dob: "1992-07-14",
    age: 33,
    sex: "Female",
    nin: "CM9200142KPRA",
    phone: "+256 772 145 883",
    district: "Kampala",
    facility: "Mulago National Referral Hospital",
    village: "Bwaise III",
    registeredOn: "2024-01-10",
};

const MOCK_ENROLLMENT: Enrollment = {
    id: "ENR-20240110",
    program: "Uganda Malaria Surveillance",
    enrolledOn: "2024-01-10",
    enrolledBy: "Dr. Ssali John",
    orgUnit: "Mulago NRH",
    status: "ACTIVE",
    incidentDate: "2024-01-08",
};

const MOCK_VISITS: Visit[] = [
    {
        id: "V-001",
        date: "Feb 10, 2026",
        services: [
            "maternity",
            "postnatal",
            "emergency",
            "gbv",
            "art",
            "child_health",
        ],
        syncStatus: "Synced",
        sectionData: {
            emergency: { chiefComplaint: "Fever", triageCategory: "Yellow" },
        },
        stageEvents: {
            maternity: [
                {
                    id: "SE-001",
                    date: "2026-02-10",
                    status: "COMPLETED",
                    dataValues: {
                        ga: "28 weeks",
                        bp: "120/80",
                        fhr: "142 bpm",
                    },
                },
            ],
            art: [
                {
                    id: "SE-002",
                    date: "2026-02-10",
                    status: "COMPLETED",
                    dataValues: {
                        viralLoad: "Undetectable",
                        cd4: "680",
                        regimen: "TLD",
                    },
                },
            ],
        },
    },
    {
        id: "V-002",
        date: "Feb 09, 2026",
        services: ["emergency"],
        syncStatus: "Synced",
        sectionData: { emergency: { chiefComplaint: "Severe headache" } },
        stageEvents: {},
    },
    {
        id: "V-003",
        date: "Feb 17, 2026",
        services: ["outpatient"],
        syncStatus: "Synced",
        sectionData: {
            outpatient: { diagnosis: "Malaria", prescription: "AL" },
        },
        stageEvents: {},
    },
    {
        id: "V-004",
        date: "Feb 09, 2026",
        services: ["art"],
        syncStatus: "Synced",
        sectionData: {},
        stageEvents: {
            art: [
                {
                    id: "SE-003",
                    date: "2026-02-09",
                    status: "COMPLETED",
                    dataValues: {
                        viralLoad: "200 copies/ml",
                        cd4: "450",
                        regimen: "TLD",
                    },
                },
            ],
        },
    },
    {
        id: "V-005",
        date: "Feb 01, 2026",
        services: ["outpatient", "maternity"],
        syncStatus: "Synced",
        sectionData: {},
        stageEvents: {
            maternity: [
                {
                    id: "SE-004",
                    date: "2026-02-01",
                    status: "COMPLETED",
                    dataValues: {
                        ga: "24 weeks",
                        bp: "118/76",
                        fhr: "138 bpm",
                    },
                },
            ],
        },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION FORMS  (visit-level, non-stage sections)
// ─────────────────────────────────────────────────────────────────────────────

function TriageForm() {
    return (
        <>
            <Row gutter={[16, 0]}>
                <Col span={6}>
                    <Form.Item
                        label="Referral In?"
                        name={["triage", "referralIn"]}
                    >
                        <Radio.Group>
                            <Radio value="Yes">Yes</Radio>
                            <Radio value="No">No</Radio>
                        </Radio.Group>
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item label="Weight (kg)" name={["triage", "weight"]}>
                        <Input placeholder="e.g. 62" />
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Height / Length (cm)"
                        name={["triage", "height"]}
                    >
                        <Input placeholder="e.g. 158" />
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Temperature (°C)"
                        name={["triage", "temperature"]}
                    >
                        <Input placeholder="e.g. 36.8" />
                    </Form.Item>
                </Col>
            </Row>
            <Row gutter={[16, 0]}>
                <Col span={6}>
                    <Form.Item
                        label="Random Blood Glucose (mg/dL)"
                        name={["triage", "rbg"]}
                    >
                        <Input />
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Fasting Blood Glucose (mmol/L)"
                        name={["triage", "fbg"]}
                    >
                        <Input />
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Pregnancy Status"
                        name={["triage", "pregnancyStatus"]}
                    >
                        <Select placeholder="Select">
                            <Option value="None">None</Option>
                            <Option value="Pregnant">Pregnant</Option>
                            <Option value="Postpartum">Postpartum</Option>
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Nutrition Assessment"
                        name={["triage", "nutritionMethod"]}
                    >
                        <Radio.Group>
                            <Radio value="BMI">BMI</Radio>
                            <Radio value="MUAC">MUAC Tape</Radio>
                        </Radio.Group>
                    </Form.Item>
                </Col>
            </Row>
            <Row gutter={[16, 0]}>
                <Col span={6}>
                    <Form.Item
                        label="Nutrition Status"
                        name={["triage", "nutritionStatus"]}
                    >
                        <Select placeholder="Select">
                            <Option value="Normal">Normal</Option>
                            <Option value="Underweight">Underweight</Option>
                            <Option value="Overweight">Overweight</Option>
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Transfer In"
                        name={["triage", "transferIn"]}
                    >
                        <Radio.Group>
                            <Radio value="Yes">Yes</Radio>
                            <Radio value="No">No</Radio>
                        </Radio.Group>
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Emergency Case?"
                        name={["triage", "isEmergency"]}
                    >
                        <Radio.Group>
                            <Radio value="Yes">Yes</Radio>
                            <Radio value="No">No</Radio>
                        </Radio.Group>
                    </Form.Item>
                </Col>
                <Col span={6}>
                    <Form.Item
                        label="Age at visit"
                        name={["triage", "ageAtVisit"]}
                    >
                        <Input disabled placeholder="24.038" />
                    </Form.Item>
                </Col>
            </Row>
        </>
    );
}

function ScreeningForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item
                    label="Blood Pressure (mmHg)"
                    name={["screening", "bp"]}
                >
                    <Input placeholder="120/80" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Pulse Rate (bpm)"
                    name={["screening", "pulse"]}
                >
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="SpO2 (%)" name={["screening", "spo2"]}>
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Screening Result"
                    name={["screening", "result"]}
                >
                    <Select placeholder="Select">
                        <Option value="Normal">Normal</Option>
                        <Option value="Abnormal">Abnormal</Option>
                        <Option value="Follow-up">Requires Follow-up</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={16}>
                <Form.Item label="Remarks" name={["screening", "remarks"]}>
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Col>
        </Row>
    );
}

function EmergencyForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item
                    label="Chief Complaint"
                    name={["emergency", "chiefComplaint"]}
                >
                    <Input />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Triage Category"
                    name={["emergency", "triageCategory"]}
                >
                    <Select placeholder="Select">
                        <Option value="Red">Red – Immediate</Option>
                        <Option value="Yellow">Yellow – Delayed</Option>
                        <Option value="Green">Green – Minor</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Disposition"
                    name={["emergency", "disposition"]}
                >
                    <Select placeholder="Select">
                        <Option value="Admitted">Admitted</Option>
                        <Option value="Discharged">Discharged</Option>
                        <Option value="Referred">Referred</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={24}>
                <Form.Item label="Clinical Notes" name={["emergency", "notes"]}>
                    <Input.TextArea rows={3} />
                </Form.Item>
            </Col>
        </Row>
    );
}

function GBVForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item label="Incident Type" name={["gbv", "incidentType"]}>
                    <Select placeholder="Select">
                        <Option value="Physical">Physical Violence</Option>
                        <Option value="Sexual">Sexual Violence</Option>
                        <Option value="Domestic">Domestic Violence</Option>
                        <Option value="Emotional">Emotional Violence</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Reported to Authority?"
                    name={["gbv", "reported"]}
                >
                    <Radio.Group>
                        <Radio value="Yes">Yes</Radio>
                        <Radio value="No">No</Radio>
                    </Radio.Group>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Referred for Support?"
                    name={["gbv", "referred"]}
                >
                    <Radio.Group>
                        <Radio value="Yes">Yes</Radio>
                        <Radio value="No">No</Radio>
                    </Radio.Group>
                </Form.Item>
            </Col>
            <Col span={24}>
                <Form.Item label="Case Notes" name={["gbv", "notes"]}>
                    <Input.TextArea rows={3} placeholder="Confidential..." />
                </Form.Item>
            </Col>
        </Row>
    );
}

function OutpatientForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item label="Diagnosis" name={["outpatient", "diagnosis"]}>
                    <Input />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="ICD-10 Code" name={["outpatient", "icd10"]}>
                    <Input placeholder="e.g. B50.9" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Prescription"
                    name={["outpatient", "prescription"]}
                >
                    <Input />
                </Form.Item>
            </Col>
            <Col span={24}>
                <Form.Item
                    label="Clinical Notes"
                    name={["outpatient", "notes"]}
                >
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Col>
        </Row>
    );
}

function LabForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item label="Test Ordered" name={["lab", "test"]}>
                    <Select placeholder="Select test">
                        <Option value="RDT">Malaria RDT</Option>
                        <Option value="CBC">Full Blood Count</Option>
                        <Option value="CD4">CD4 Count</Option>
                        <Option value="VL">Viral Load</Option>
                        <Option value="HbA1c">HbA1c</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Sample Type" name={["lab", "sample"]}>
                    <Select placeholder="Select">
                        <Option value="Blood">Blood</Option>
                        <Option value="Urine">Urine</Option>
                        <Option value="Swab">Swab</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Result" name={["lab", "result"]}>
                    <Input />
                </Form.Item>
            </Col>
        </Row>
    );
}

function MedicinesForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item
                    label="Medicine / Supply"
                    name={["medicines", "item"]}
                >
                    <Input />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Quantity Dispensed"
                    name={["medicines", "quantity"]}
                >
                    <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Unit" name={["medicines", "unit"]}>
                    <Select placeholder="Select">
                        <Option value="Tablets">Tablets</Option>
                        <Option value="Capsules">Capsules</Option>
                        <Option value="Vials">Vials</Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>
    );
}

function ContactTracingForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={8}>
                <Form.Item
                    label="Contact Name"
                    name={["contact_tracing", "name"]}
                >
                    <Input />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item
                    label="Relationship"
                    name={["contact_tracing", "relationship"]}
                >
                    <Select placeholder="Select">
                        <Option value="Spouse">Spouse</Option>
                        <Option value="Child">Child</Option>
                        <Option value="Parent">Parent</Option>
                        <Option value="Sibling">Sibling</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Phone" name={["contact_tracing", "phone"]}>
                    <Input placeholder="+256..." />
                </Form.Item>
            </Col>
        </Row>
    );
}

// ── Program Stage Forms (sub-event level) ─────────────────────────────────────

function MaternityStageForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={6}>
                <Form.Item label="Gestational Age" name="ga">
                    <Input placeholder="28 weeks" />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Blood Pressure" name="bp">
                    <Input placeholder="120/80" />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Fetal Heart Rate" name="fhr">
                    <Input placeholder="142 bpm" />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Fundal Height (cm)" name="fundalHeight">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Presentation" name="presentation">
                    <Select placeholder="Select">
                        <Option value="Cephalic">Cephalic</Option>
                        <Option value="Breech">Breech</Option>
                        <Option value="Transverse">Transverse</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={16}>
                <Form.Item label="Notes" name="notes">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Col>
        </Row>
    );
}

function ARTStageForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={6}>
                <Form.Item label="Viral Load (copies/ml)" name="viralLoad">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="CD4 Count" name="cd4">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Current Regimen" name="regimen">
                    <Select placeholder="Select">
                        <Option value="TLD">TLD</Option>
                        <Option value="TLE">TLE</Option>
                        <Option value="AZT/3TC/NVP">AZT/3TC/NVP</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Adherence" name="adherence">
                    <Select placeholder="Select">
                        <Option value="Good">Good (&gt;95%)</Option>
                        <Option value="Fair">Fair (85–95%)</Option>
                        <Option value="Poor">Poor (&lt;85%)</Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>
    );
}

function PostnatalStageForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={6}>
                <Form.Item label="Days Postpartum" name="daysPostpartum">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Blood Pressure" name="bp">
                    <Input placeholder="120/80" />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Breastfeeding?" name="breastfeeding">
                    <Radio.Group>
                        <Radio value="Yes">Yes</Radio>
                        <Radio value="No">No</Radio>
                    </Radio.Group>
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Contraception" name="contraception">
                    <Select placeholder="Select">
                        <Option value="None">None</Option>
                        <Option value="IUCD">IUCD</Option>
                        <Option value="Injectable">Injectable</Option>
                        <Option value="Implant">Implant</Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>
    );
}

function ChildHealthStageForm() {
    return (
        <Row gutter={[16, 0]}>
            <Col span={6}>
                <Form.Item label="Child Age (months)" name="ageMonths">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Weight (kg)" name="weight">
                    <InputNumber style={{ width: "100%" }} step={0.1} />
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="Immunization Given" name="immunization">
                    <Select placeholder="Select">
                        <Option value="BCG">BCG</Option>
                        <Option value="OPV">OPV</Option>
                        <Option value="Pentavalent">Pentavalent</Option>
                        <Option value="MR">MR</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="MUAC (cm)" name="muac">
                    <InputNumber style={{ width: "100%" }} step={0.1} />
                </Form.Item>
            </Col>
        </Row>
    );
}

const STAGE_FORM_MAP: Partial<Record<SectionKey, ReactNode>> = {
    maternity: <MaternityStageForm />,
    art: <ARTStageForm />,
    postnatal: <PostnatalStageForm />,
    child_health: <ChildHealthStageForm />,
};

const SECTION_FORM_MAP: Partial<Record<SectionKey, ReactNode>> = {
    triage: <TriageForm />,
    screening: <ScreeningForm />,
    emergency: <EmergencyForm />,
    gbv: <GBVForm />,
    outpatient: <OutpatientForm />,
    lab: <LabForm />,
    medicines: <MedicinesForm />,
    contact_tracing: <ContactTracingForm />,
};

// ─────────────────────────────────────────────────────────────────────────────
// TEI HEADER
// ─────────────────────────────────────────────────────────────────────────────

interface TEIHeaderProps {
    tei: TrackedEntityInstance;
    enrollment: Enrollment;
}

function TEIHeader({ tei, enrollment }: TEIHeaderProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                background: "#fff",
                borderBottom: "1px solid #f0f0f0",
                padding: "12px 24px",
                flexShrink: 0,
            }}
        >
            <Row align="middle" gutter={16} wrap={false}>
                <Col>
                    <Avatar
                        size={48}
                        style={{
                            background:
                                "linear-gradient(135deg, #667eea, #764ba2)",
                            fontSize: 18,
                        }}
                    >
                        {tei.name.charAt(0)}
                    </Avatar>
                </Col>
                <Col flex={1}>
                    <Space align="center" wrap>
                        <Text strong style={{ fontSize: 16 }}>
                            {tei.name}
                        </Text>
                        <Tag color="purple" style={{ borderRadius: 10 }}>
                            {tei.id}
                        </Tag>
                        <Tag
                            color={
                                enrollment.status === "ACTIVE"
                                    ? "green"
                                    : "default"
                            }
                        >
                            {enrollment.status}
                        </Tag>
                    </Space>
                    <div style={{ marginTop: 2 }}>
                        <Space split={<Divider type="vertical" />} wrap>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <CalendarOutlined /> {tei.dob} · {tei.age} yrs
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <IdcardOutlined /> {tei.sex}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <EnvironmentOutlined /> {tei.district}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <PhoneOutlined /> {tei.phone}
                            </Text>
                        </Space>
                    </div>
                </Col>
                <Col>
                    <Space>
                        <Button
                            type="link"
                            size="small"
                            onClick={() => setExpanded((v) => !v)}
                        >
                            {expanded ? "Less details ▲" : "More details ▼"}
                        </Button>
                        <Button size="small" icon={<EditOutlined />}>
                            Edit
                        </Button>
                    </Space>
                </Col>
            </Row>

            {expanded && (
                <div
                    style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid #f0f0f0",
                    }}
                >
                    <Collapse ghost size="small">
                        <Panel
                            header={<Text strong>Person Profile</Text>}
                            key="profile"
                        >
                            <Descriptions size="small" column={4}>
                                <Descriptions.Item label="NIN">
                                    {tei.nin}
                                </Descriptions.Item>
                                <Descriptions.Item label="Village">
                                    {tei.village}
                                </Descriptions.Item>
                                <Descriptions.Item label="Facility">
                                    {tei.facility}
                                </Descriptions.Item>
                                <Descriptions.Item label="Registered">
                                    {tei.registeredOn}
                                </Descriptions.Item>
                            </Descriptions>
                        </Panel>
                        <Panel
                            header={<Text strong>Enrollment</Text>}
                            key="enrollment"
                        >
                            <Descriptions size="small" column={4}>
                                <Descriptions.Item label="Program">
                                    {enrollment.program}
                                </Descriptions.Item>
                                <Descriptions.Item label="Enrolled On">
                                    {enrollment.enrolledOn}
                                </Descriptions.Item>
                                <Descriptions.Item label="Org Unit">
                                    {enrollment.orgUnit}
                                </Descriptions.Item>
                                <Descriptions.Item label="Incident Date">
                                    {enrollment.incidentDate}
                                </Descriptions.Item>
                                <Descriptions.Item label="Enrolled By">
                                    {enrollment.enrolledBy}
                                </Descriptions.Item>
                            </Descriptions>
                        </Panel>
                        <Panel
                            header={
                                <Text strong>Notes about this enrollment</Text>
                            }
                            key="notes"
                        >
                            <Input.TextArea
                                rows={3}
                                placeholder="Add notes..."
                            />
                            <Button
                                size="small"
                                type="primary"
                                style={{ marginTop: 8 }}
                            >
                                Save Notes
                            </Button>
                        </Panel>
                    </Collapse>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM STAGE SUB-EVENTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface StageEventsPanelProps {
    sectionKey: SectionKey;
    sectionLabel: string;
    subEvents: SubEvent[];
    onAddSubEvent: (
        sectionKey: SectionKey,
        values: Record<string, unknown>,
    ) => void;
    onDeleteSubEvent: (sectionKey: SectionKey, subEventId: string) => void;
}

function StageEventsPanel({
    sectionKey,
    sectionLabel,
    subEvents,
    onAddSubEvent,
    onDeleteSubEvent,
}: StageEventsPanelProps) {
    const [adding, setAdding] = useState(false);
    const [form] = Form.useForm();
    const stageForm = STAGE_FORM_MAP[sectionKey];

    const columns: ColumnsType<SubEvent> = [
        { title: "Date", dataIndex: "date", key: "date", width: 120 },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (s: EventStatus) => {
                const m = STATUS_META[s] ?? STATUS_META.SCHEDULE;
                return (
                    <Tag
                        color={
                            s === "COMPLETED"
                                ? "green"
                                : s === "ACTIVE"
                                  ? "blue"
                                  : "orange"
                        }
                    >
                        {m.label}
                    </Tag>
                );
            },
        },
        {
            title: "Data",
            dataIndex: "dataValues",
            key: "data",
            render: (dv: Record<string, string>) =>
                Object.entries(dv).map(([k, v]) => (
                    <span key={k} style={{ marginRight: 12, fontSize: 12 }}>
                        <Text type="secondary">{k}: </Text>
                        <Text>{v}</Text>
                    </span>
                )),
        },
        {
            title: "",
            key: "actions",
            width: 80,
            render: (_: unknown, row: SubEvent) => (
                <Space size={4}>
                    <Tooltip title="Edit">
                        <Button size="small" icon={<EditOutlined />} />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this event?"
                        onConfirm={() => onDeleteSubEvent(sectionKey, row.id)}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const handleSave = () =>
        form.validateFields().then((vals) => {
            onAddSubEvent(sectionKey, vals);
            setAdding(false);
            form.resetFields();
        });

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                }}
            >
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {subEvents.length} event{subEvents.length !== 1 ? "s" : ""}{" "}
                    recorded
                </Text>
                {!adding && (
                    <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<PlusCircleOutlined />}
                        onClick={() => setAdding(true)}
                    >
                        Add {sectionLabel} Event
                    </Button>
                )}
            </div>

            {subEvents.length > 0 && (
                <Table
                    size="small"
                    dataSource={subEvents}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    style={{ marginBottom: adding ? 16 : 0 }}
                />
            )}

            {adding && (
                <div
                    style={{
                        background: "#fafafa",
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        padding: 16,
                        marginTop: 12,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                        }}
                    >
                        <Text strong>New {sectionLabel} Event</Text>
                        <Button
                            size="small"
                            type="text"
                            icon={<CloseOutlined />}
                            onClick={() => {
                                setAdding(false);
                                form.resetFields();
                            }}
                        />
                    </div>
                    <Form form={form} layout="vertical" size="small">
                        <Row gutter={16}>
                            <Col span={6}>
                                <Form.Item
                                    label="Event Date"
                                    name="date"
                                    rules={[
                                        { required: true, message: "Required" },
                                    ]}
                                >
                                    <DatePicker style={{ width: "100%" }} />
                                </Form.Item>
                            </Col>
                        </Row>
                        {stageForm}
                    </Form>
                    <div style={{ textAlign: "right", marginTop: 8 }}>
                        <Space>
                            <Button
                                size="small"
                                onClick={() => {
                                    setAdding(false);
                                    form.resetFields();
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSave}
                            >
                                Save Event
                            </Button>
                        </Space>
                    </div>
                </div>
            )}

            {subEvents.length === 0 && !adding && (
                <Empty
                    description={`No ${sectionLabel} events yet`}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION LEFT NAV
// ─────────────────────────────────────────────────────────────────────────────

interface SectionNavProps {
    sections: SectionConfig[];
    activeKey: SectionKey;
    stageEvents: Partial<Record<SectionKey, SubEvent[]>>;
    onChange: (key: SectionKey) => void;
}

function SectionNav({
    sections,
    activeKey,
    stageEvents,
    onChange,
}: SectionNavProps) {
    return (
        <div
            style={{
                width: 210,
                background: "#fff",
                borderRight: "1px solid #f0f0f0",
                overflowY: "auto",
                flexShrink: 0,
            }}
        >
            {sections.map((sec) => {
                const isActive = sec.key === activeKey;
                const subCount = stageEvents[sec.key]?.length ?? 0;
                return (
                    <div
                        key={sec.key}
                        onClick={() => onChange(sec.key)}
                        style={{
                            padding: "10px 16px",
                            cursor: "pointer",
                            borderLeft: `3px solid ${isActive ? "#1677ff" : "transparent"}`,
                            background: isActive ? "#e6f4ff" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive)
                                (
                                    e.currentTarget as HTMLDivElement
                                ).style.background = "#fafafa";
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive)
                                (
                                    e.currentTarget as HTMLDivElement
                                ).style.background = "transparent";
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 13,
                                color: isActive ? "#1677ff" : "#595959",
                                fontWeight: isActive ? 600 : 400,
                            }}
                        >
                            {sec.label}
                        </Text>
                        <Space size={4}>
                            {sec.isProgramStage && (
                                <Tag
                                    color="blue"
                                    style={{
                                        fontSize: 10,
                                        margin: 0,
                                        lineHeight: "16px",
                                    }}
                                >
                                    Stage
                                </Tag>
                            )}
                            {sec.isProgramStage && subCount > 0 && (
                                <Badge count={subCount} size="small" />
                            )}
                        </Space>
                    </div>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISIT DETAIL
// ─────────────────────────────────────────────────────────────────────────────

interface VisitDetailProps {
    visit: Visit;
    onBack: () => void;
    onUpdateVisit: (updated: Visit) => void;
}

function VisitDetail({ visit, onBack, onUpdateVisit }: VisitDetailProps) {
    const [selectedSection, setSelectedSection] = useState<SectionKey>(
        visit.services[0] ?? "triage",
    );
    const [form] = Form.useForm();
    const [saved, setSaved] = useState(false);
    const [addingService, setAddingService] = useState(false);
    const [serviceSelectValue, setServiceSelectValue] = useState<SectionKey[]>(
        [],
    );

    const sections = visit.services.map((k) => getSectionConfig(k));
    const currentSection = getSectionConfig(selectedSection);
    const sectionForm = SECTION_FORM_MAP[selectedSection];
    const availableToAdd = ALL_SECTIONS.filter(
        (s) => !visit.services.includes(s.key),
    );

    const handleSaveSection = () =>
        form.validateFields().then((vals) => {
            onUpdateVisit({
                ...visit,
                sectionData: {
                    ...visit.sectionData,
                    [selectedSection]: vals[selectedSection] ?? {},
                },
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        });

    const handleAddServices = () => {
        if (!serviceSelectValue.length) {
            setAddingService(false);
            return;
        }
        onUpdateVisit({
            ...visit,
            services: [...visit.services, ...serviceSelectValue],
        });
        setSelectedSection(serviceSelectValue[0]);
        setServiceSelectValue([]);
        setAddingService(false);
    };

    const handleRemoveService = (key: SectionKey) => {
        if (visit.services.length <= 1) return;
        const newServices = visit.services.filter((s) => s !== key);
        onUpdateVisit({
            ...visit,
            services: newServices,
            sectionData: Object.fromEntries(
                Object.entries(visit.sectionData).filter(([k]) => k !== key),
            ),
            stageEvents: Object.fromEntries(
                Object.entries(visit.stageEvents).filter(([k]) => k !== key),
            ),
        });
        if (selectedSection === key) setSelectedSection(newServices[0]);
    };

    const handleAddSubEvent = (
        sectionKey: SectionKey,
        values: Record<string, unknown>,
    ) => {
        const existing = visit.stageEvents[sectionKey] ?? [];
        const newSub: SubEvent = {
            id: `SE-${Date.now()}`,
            date:
                (values.date as { format: (f: string) => string })?.format?.(
                    "YYYY-MM-DD",
                ) ?? new Date().toISOString().split("T")[0],
            status: "COMPLETED",
            dataValues: Object.fromEntries(
                Object.entries(values)
                    .filter(([k]) => k !== "date")
                    .map(([k, v]) => [k, String(v ?? "")]),
            ),
        };
        onUpdateVisit({
            ...visit,
            stageEvents: {
                ...visit.stageEvents,
                [sectionKey]: [...existing, newSub],
            },
        });
    };

    const handleDeleteSubEvent = (
        sectionKey: SectionKey,
        subEventId: string,
    ) => {
        onUpdateVisit({
            ...visit,
            stageEvents: {
                ...visit.stageEvents,
                [sectionKey]: (visit.stageEvents[sectionKey] ?? []).filter(
                    (e) => e.id !== subEventId,
                ),
            },
        });
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
            }}
        >
            {/* ── Toolbar ── */}
            <div
                style={{
                    background: "#fff",
                    borderBottom: "1px solid #f0f0f0",
                    padding: "10px 20px",
                    flexShrink: 0,
                }}
            >
                <Space wrap size={8}>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        size="small"
                        onClick={onBack}
                    >
                        Back
                    </Button>
                    <Divider type="vertical" />
                    <Text strong>
                        <CalendarOutlined style={{ marginRight: 4 }} />
                        {visit.date}
                    </Text>
                    <Divider type="vertical" />

                    {/* Service tags – click to navigate, × to remove */}
                    {visit.services.map((s) => (
                        <Tag
                            key={s}
                            color={
                                selectedSection === s
                                    ? SERVICE_COLORS[s]
                                    : undefined
                            }
                            closable={visit.services.length > 1}
                            onClose={(e) => {
                                e.preventDefault();
                                handleRemoveService(s);
                            }}
                            onClick={() => setSelectedSection(s)}
                            style={{
                                cursor: "pointer",
                                borderRadius: 10,
                                fontSize: 11,
                            }}
                        >
                            {SERVICE_LABELS[s]}
                        </Tag>
                    ))}

                    {/* Add service */}
                    {!addingService ? (
                        availableToAdd.length > 0 && (
                            <Button
                                size="small"
                                type="dashed"
                                icon={<PlusOutlined />}
                                style={{ borderRadius: 10, fontSize: 11 }}
                                onClick={() => setAddingService(true)}
                            >
                                Add service
                            </Button>
                        )
                    ) : (
                        <Space size={4}>
                            <Select
                                autoFocus
                                mode="multiple"
                                size="small"
                                style={{ minWidth: 280 }}
                                placeholder="Select services to add..."
                                value={serviceSelectValue}
                                onChange={setServiceSelectValue}
                            >
                                {availableToAdd.map((s) => (
                                    <Option key={s.key} value={s.key}>
                                        {s.label}
                                    </Option>
                                ))}
                            </Select>
                            <Button
                                size="small"
                                type="primary"
                                onClick={handleAddServices}
                            >
                                Add
                            </Button>
                            <Button
                                size="small"
                                onClick={() => {
                                    setAddingService(false);
                                    setServiceSelectValue([]);
                                }}
                            >
                                Cancel
                            </Button>
                        </Space>
                    )}

                    <div style={{ marginLeft: "auto" }}>
                        <Badge
                            status={
                                visit.syncStatus === "Synced"
                                    ? "success"
                                    : "processing"
                            }
                            text={
                                <Text style={{ fontSize: 12 }}>
                                    {visit.syncStatus}
                                </Text>
                            }
                        />
                    </div>
                </Space>
            </div>

            {/* ── Section nav + form ── */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                <SectionNav
                    sections={sections}
                    activeKey={selectedSection}
                    stageEvents={visit.stageEvents}
                    onChange={setSelectedSection}
                />

                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: 24,
                        background: "#fafafa",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 16,
                        }}
                    >
                        <Space>
                            <Text strong style={{ fontSize: 15 }}>
                                {currentSection.label}
                            </Text>
                            {currentSection.isProgramStage && (
                                <Tag color="blue">Program Stage</Tag>
                            )}
                        </Space>
                        {!currentSection.isProgramStage && sectionForm && (
                            <Button
                                size="small"
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSaveSection}
                            >
                                {saved ? "Saved ✓" : "Save Section"}
                            </Button>
                        )}
                    </div>

                    {currentSection.isProgramStage ? (
                        <StageEventsPanel
                            sectionKey={selectedSection}
                            sectionLabel={currentSection.label}
                            subEvents={visit.stageEvents[selectedSection] ?? []}
                            onAddSubEvent={handleAddSubEvent}
                            onDeleteSubEvent={handleDeleteSubEvent}
                        />
                    ) : sectionForm ? (
                        <Form
                            form={form}
                            layout="vertical"
                            size="small"
                            initialValues={{
                                [selectedSection]:
                                    visit.sectionData[selectedSection] ?? {},
                            }}
                        >
                            {sectionForm}
                        </Form>
                    ) : (
                        <Empty
                            description={`No form configured for ${currentSection.label}`}
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW VISIT INLINE
// ─────────────────────────────────────────────────────────────────────────────

interface NewVisitInlineProps {
    onSave: (visit: Visit) => void;
    onCancel: () => void;
}

function NewVisitInline({ onSave, onCancel }: NewVisitInlineProps) {
    const [form] = Form.useForm();
    const [selectedServices, setSelectedServices] = useState<SectionKey[]>([]);
    const [activeSection, setActiveSection] = useState<SectionKey | null>(null);

    const handleServicesChange = (vals: SectionKey[]) => {
        setSelectedServices(vals);
        if (
            vals.length > 0 &&
            (!activeSection || !vals.includes(activeSection))
        )
            setActiveSection(vals[0]);
        if (vals.length === 0) setActiveSection(null);
    };

    const handleSave = () =>
        form.validateFields(["visitDate"]).then((vals) => {
            const allVals = form.getFieldsValue(true) as Record<
                string,
                unknown
            >;
            const visitDate =
                (vals.visitDate as { format: (f: string) => string })?.format(
                    "MMM DD, YYYY",
                ) ?? new Date().toDateString();
            onSave({
                id: `V-${Date.now()}`,
                date: visitDate,
                services: selectedServices,
                syncStatus: "Pending",
                sectionData: Object.fromEntries(
                    selectedServices
                        .filter((k) => !getSectionConfig(k).isProgramStage)
                        .map((k) => [
                            k,
                            (allVals[k] as Record<string, unknown>) ?? {},
                        ]),
                ),
                stageEvents: {},
            });
        });

    const sections = selectedServices.map((k) => getSectionConfig(k));
    const currentSection = activeSection
        ? getSectionConfig(activeSection)
        : null;
    const sectionForm = activeSection ? SECTION_FORM_MAP[activeSection] : null;

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
            }}
        >
            {/* Top bar */}
            <div
                style={{
                    background: "#fff",
                    borderBottom: "1px solid #f0f0f0",
                    padding: "12px 20px",
                    flexShrink: 0,
                }}
            >
                <Row align="middle" gutter={16} style={{ marginBottom: 12 }}>
                    <Col>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            size="small"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    </Col>
                    <Col>
                        <Text strong style={{ fontSize: 15 }}>
                            New Visit
                        </Text>
                    </Col>
                    <Col flex={1} />
                    <Col>
                        <Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Draft
                            </Text>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSave}
                            >
                                Save Visit
                            </Button>
                        </Space>
                    </Col>
                </Row>
                <Form form={form} layout="inline" size="small">
                    <Form.Item
                        label="Visit Date"
                        name="visitDate"
                        rules={[{ required: true, message: "Required" }]}
                        style={{ marginBottom: 0 }}
                    >
                        <DatePicker />
                    </Form.Item>
                    <Form.Item
                        label="Service Type"
                        style={{ flex: 1, marginBottom: 0 }}
                    >
                        <Select
                            mode="multiple"
                            style={{ minWidth: 420 }}
                            placeholder="Select services for this visit..."
                            value={selectedServices}
                            onChange={handleServicesChange}
                        >
                            {ALL_SECTIONS.map((s) => (
                                <Option key={s.key} value={s.key}>
                                    {s.label}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </div>

            {selectedServices.length === 0 ? (
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#fafafa",
                    }}
                >
                    <Empty
                        description="Select service types above to fill in visit data"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </div>
            ) : (
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                    {/* Section nav */}
                    <div
                        style={{
                            width: 210,
                            background: "#fff",
                            borderRight: "1px solid #f0f0f0",
                            overflowY: "auto",
                            flexShrink: 0,
                        }}
                    >
                        {sections.map((sec) => {
                            const isActive = sec.key === activeSection;
                            return (
                                <div
                                    key={sec.key}
                                    onClick={() => setActiveSection(sec.key)}
                                    style={{
                                        padding: "10px 16px",
                                        cursor: "pointer",
                                        borderLeft: `3px solid ${isActive ? "#1677ff" : "transparent"}`,
                                        background: isActive
                                            ? "#e6f4ff"
                                            : "transparent",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        transition: "all 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive)
                                            (
                                                e.currentTarget as HTMLDivElement
                                            ).style.background = "#fafafa";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive)
                                            (
                                                e.currentTarget as HTMLDivElement
                                            ).style.background = "transparent";
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontSize: 13,
                                            color: isActive
                                                ? "#1677ff"
                                                : "#595959",
                                            fontWeight: isActive ? 600 : 400,
                                        }}
                                    >
                                        {sec.label}
                                    </Text>
                                    {sec.isProgramStage && (
                                        <Tag
                                            color="blue"
                                            style={{ fontSize: 10, margin: 0 }}
                                        >
                                            Stage
                                        </Tag>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Form area */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: 24,
                            background: "#fafafa",
                        }}
                    >
                        {currentSection && (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <Space>
                                        <Text strong style={{ fontSize: 15 }}>
                                            {currentSection.label}
                                        </Text>
                                        {currentSection.isProgramStage && (
                                            <Tag color="blue">
                                                Program Stage – add events after
                                                saving the visit
                                            </Tag>
                                        )}
                                    </Space>
                                </div>
                                {currentSection.isProgramStage ? (
                                    <Empty
                                        description="Save the visit first, then add program stage events"
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    />
                                ) : sectionForm ? (
                                    <Form
                                        form={form}
                                        layout="vertical"
                                        size="small"
                                    >
                                        {sectionForm}
                                    </Form>
                                ) : (
                                    <Empty
                                        description={`No form for ${currentSection.label}`}
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISITS LIST
// ─────────────────────────────────────────────────────────────────────────────

interface VisitsListProps {
    visits: Visit[];
    onSelectVisit: (visit: Visit) => void;
    onAddVisit: () => void;
    onDeleteVisit: (id: string) => void;
}

function VisitsList({
    visits,
    onSelectVisit,
    onAddVisit,
    onDeleteVisit,
}: VisitsListProps) {
    const columns: ColumnsType<Visit> = [
        {
            title: "Date",
            dataIndex: "date",
            key: "date",
            width: 130,
            render: (d: string, row: Visit) => (
                <Button
                    type="link"
                    size="small"
                    style={{ padding: 0 }}
                    onClick={() => onSelectVisit(row)}
                >
                    {d}
                </Button>
            ),
        },
        {
            title: "Services",
            dataIndex: "services",
            key: "services",
            render: (svcs: SectionKey[], row: Visit) => (
                <Space size={4} wrap>
                    {svcs.map((s) => (
                        <Tag
                            key={s}
                            color={SERVICE_COLORS[s]}
                            style={{
                                cursor: "pointer",
                                borderRadius: 10,
                                fontSize: 11,
                            }}
                            onClick={() => onSelectVisit(row)}
                        >
                            {SERVICE_LABELS[s]}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "Sync Status",
            dataIndex: "syncStatus",
            key: "sync",
            width: 130,
            render: (s: SyncStatus) => (
                <Badge
                    status={
                        s === "Synced"
                            ? "success"
                            : s === "Pending"
                              ? "processing"
                              : "error"
                    }
                    text={<Text style={{ fontSize: 12 }}>{s}</Text>}
                />
            ),
        },
        {
            title: "Action",
            key: "actions",
            width: 180,
            render: (_: unknown, row: Visit) => (
                <Space size={6}>
                    <Button size="small" onClick={() => onSelectVisit(row)}>
                        Edit Event
                    </Button>
                    <Popconfirm
                        title="Delete this visit?"
                        onConfirm={() => onDeleteVisit(row.id)}
                    >
                        <Button size="small" danger>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    padding: "12px 20px",
                    background: "#fff",
                    borderBottom: "1px solid #f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                }}
            >
                <Space>
                    <CalendarOutlined />
                    <Text strong style={{ fontSize: 15 }}>
                        Client Visits
                    </Text>
                    <Tag>{visits.length}</Tag>
                </Space>
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={onAddVisit}
                >
                    Add new visit
                </Button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
                <Table
                    dataSource={visits}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    size="middle"
                    style={{ background: "#fff" }}
                    rowClassName={() => "visit-row"}
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "new" | "detail";

export interface DHIS2DashboardProps {
    /** Provide real data to replace mock data */
    tei?: TrackedEntityInstance;
    enrollment?: Enrollment;
    initialVisits?: Visit[];
}

export default function DHIS2Dashboard({
    tei = MOCK_TEI,
    enrollment = MOCK_ENROLLMENT,
    initialVisits: visitsProp = MOCK_VISITS,
}: DHIS2DashboardProps) {
    const [visits, setVisits] = useState<Visit[]>(visitsProp);
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [activeVisit, setActiveVisit] = useState<Visit | null>(null);

    const handleSelectVisit = (visit: Visit) => {
        setActiveVisit(visit);
        setViewMode("detail");
    };

    const handleUpdateVisit = (updated: Visit) => {
        setVisits((prev) =>
            prev.map((v) => (v.id === updated.id ? updated : v)),
        );
        setActiveVisit(updated);
    };

    const handleSaveNewVisit = (visit: Visit) => {
        setVisits((prev) => [visit, ...prev]);
        setActiveVisit(visit);
        setViewMode("detail");
    };

    const handleDeleteVisit = (id: string) =>
        setVisits((prev) => prev.filter((v) => v.id !== id));

    return (
        <div
            style={{
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                background: "#f5f5f5",
            }}
        >
            <TEIHeader tei={tei} enrollment={enrollment} />

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {viewMode === "list" && (
                    <VisitsList
                        visits={visits}
                        onSelectVisit={handleSelectVisit}
                        onAddVisit={() => setViewMode("new")}
                        onDeleteVisit={handleDeleteVisit}
                    />
                )}
                {viewMode === "new" && (
                    <NewVisitInline
                        onSave={handleSaveNewVisit}
                        onCancel={() => setViewMode("list")}
                    />
                )}
                {viewMode === "detail" && activeVisit && (
                    <VisitDetail
                        visit={activeVisit}
                        onBack={() => setViewMode("list")}
                        onUpdateVisit={handleUpdateVisit}
                    />
                )}
            </div>
        </div>
    );
}

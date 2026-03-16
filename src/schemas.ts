import { GetProp, TablePaginationConfig, TreeSelectProps } from "antd";
import { FilterValue } from "antd/es/table/interface";
import z from "zod";

export const UID = z
    .string()
    .length(11, "DHIS2 UID must be exactly 11 characters")
    .regex(/^[A-Za-z][A-Za-z0-9]{10}$/, {
        message:
            "DHIS2 UID must start with a letter and contain only alphanumeric characters",
    });

const RenderTypeSchema = z.object({
    type: z.enum([
        "DEFAULT",
        "DROPDOWN",
        "VERTICAL_RADIOBUTTONS",
        "HORIZONTAL_RADIOBUTTONS",
        "VERTICAL_CHECKBOXES",
        "HORIZONTAL_CHECKBOXES",
        "SHARED_HEADER_RADIOBUTTONS",
        "ICONS_AS_BUTTONS",
        "SPINNER",
        "ICON",
    ]),
});

export const SyncStatusSchema = z.enum([
    "draft",
    "pending",
    "syncing",
    "synced",
    "failed",
    "deleted",
    "editing",
]);

export const UserSchema = z.object({
    uid: UID,
    username: z.string(),
    firstName: z.string(),
    surname: z.string(),
});

export const ClientSchema = z.object({
    search: z.record(z.string(), z.string()).optional(),
});

export const OptionSetSchema = z.object({
    name: z.string(),
    options: z.array(
        z.object({
            code: z.string(),
            name: z.string(),
            id: UID,
        }),
    ),
    id: UID,
});

export const DataElementSchema = z.object({
    code: z.string(),
    name: z.string(),
    optionSet: OptionSetSchema.optional(),
    optionSetValue: z.boolean(),
    valueType: z.string(),
    formName: z.string(),
    id: UID,
});
export const ProgramIndicatorSchema = z.object({
    filter: z.string(),
    expression: z.string(),
    name: z.string(),
    aggregationType: z.string(),
    program: z.object({ id: z.string() }),
    id: UID,
});

export const ProgramStageSectionSchema = z.object({
    name: z.string(),
    dataElements: z.array(DataElementSchema),
    sortOrder: z.number(),
    displayName: z.string(),
    id: UID,
});

export const ProgramStageSchema = z.object({
    name: z.string(),
    programStageDataElements: z.array(
        z.object({
            compulsory: z.boolean(),
            id: UID,
            allowFutureDate: z.boolean(),
            dataElement: DataElementSchema,
            renderType: z
                .object({
                    MOBILE: RenderTypeSchema,
                    DESKTOP: RenderTypeSchema,
                })
                .optional(),
        }),
    ),
    id: UID,
    repeatable: z.boolean(),
    programStageSections: z.array(ProgramStageSectionSchema),
});

export const TrackedEntityAttributeSchema = z.object({
    name: z.string(),
    valueType: z.string(),
    optionSet: OptionSetSchema.optional(),
    confidential: z.boolean(),
    unique: z.boolean(),
    generated: z.boolean(),
    pattern: z.string(),
    optionSetValue: z.boolean(),
    displayFormName: z.string(),
    formName: z.string().optional(),
    id: UID,
});

export const ProgramTrackedEntityAttributeSchema = z.object({
    sortOrder: z.number(),
    mandatory: z.boolean(),
    id: UID,
    displayInList: z.boolean(),
    renderOptionsAsRadio: z.boolean(),
    searchable: z.boolean(),
    trackedEntityAttribute: TrackedEntityAttributeSchema,
    allowFutureDate: z.boolean(),
    renderType: z
        .object({
            DESKTOP: RenderTypeSchema,
            MOBILE: RenderTypeSchema,
        })
        .optional(),
});

export const ProgramSectionSchema = z.object({
    name: z.string(),
    trackedEntityAttributes: z.array(z.object({ id: UID })),
    sortOrder: z.number(),
    displayName: z.string(),
    id: UID,
});

export const ProgramSchema = z.object({
    name: z.string(),
    programType: z.string(),
    selectEnrollmentDatesInFuture: z.boolean(),
    selectIncidentDatesInFuture: z.boolean(),
    trackedEntityType: z.object({
        featureType: z.string(),
        id: UID,
        trackedEntityTypeAttributes: z.array(
            ProgramTrackedEntityAttributeSchema,
        ),
    }),
    id: UID,
    organisationUnits: z.array(z.object({ id: UID, name: z.string() })),
    programStages: z.array(ProgramStageSchema),
    programTrackedEntityAttributes: z.array(
        ProgramTrackedEntityAttributeSchema,
    ),
    programSections: z.array(ProgramSectionSchema),
});

export const ProgramRuleActionSchema = z.object({
    programRuleActionType: z.enum([
        "HIDEFIELD",
        "SHOWFIELD",
        "ASSIGN",
        "DISPLAYTEXT",
        "ERROR",
        "SHOWWARNING",
        "HIDESECTION",
        "SHOWSECTION",
        "HIDEOPTION",
        "SHOWOPTION",
        "HIDEOPTIONGROUP",
        "SHOWOPTIONGROUP",
        "SHOWERROR",
    ]),
    dataElement: z.object({ displayName: z.string(), id: UID }).optional(),
    id: UID,
    attributeValues: z.array(z.unknown()),
    templateUid: z.string().optional(),
    option: z.object({ id: UID, displayName: z.string() }).optional(),
    optionGroup: z.object({ id: UID, displayName: z.string() }).optional(),
    trackedEntityAttribute: z
        .object({ id: UID, displayName: z.string() })
        .optional(),
    programStage: z.object({ id: UID, displayName: z.string() }).optional(),
    programStageSection: z
        .object({ id: UID, displayName: z.string() })
        .optional(),
    value: z.string().optional(),
    data: z.string().optional(), // Expression for ASSIGN actions
    displayContent: z.string().optional(),
    content: z.string().optional(),
});

export const ProgramRuleSchema = z.object({
    name: z.string(),
    translations: z.array(z.unknown()),
    description: z.string(),
    programRuleActions: z.array(ProgramRuleActionSchema),
    condition: z.string(),
    priority: z.number(),
    displayName: z.string(),
    id: UID,
    attributeValues: z.array(z.unknown()),
    programStage: z.object({ id: UID }).optional(),
    program: z.object({ id: UID }).optional(),
});

export const ProgramRuleVariableSchema = z.object({
    name: z.string(),
    program: z.object({ id: UID }).optional(),
    dataElement: z.object({ id: UID }).optional(),
    useCodeForOptionSet: z.boolean(),
    displayName: z.string(),
    id: UID,
    attributeValues: z.array(z.unknown()),
    trackedEntityAttribute: z.object({ id: UID }).optional(),
    programRuleVariableSourceType: z.string(),
    valueType: z.enum(["TEXT", "NUMBER", "BOOLEAN", "DATE"]),
});

export const OrgUnitSchema = z.object({
    id: UID,
    name: z.string(),
    level: z.number(),
    parent: z.object({ id: UID }).optional(),
    leaf: z.boolean(),
});

export const AttributeSchema = z.object({
    attribute: z.string(),
    displayName: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    valueType: z.string().optional(),
    value: z.string(),
});

export const DataValueSchema = z.object({
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    storedBy: z.string().optional(),
    providedElsewhere: z.boolean().optional(),
    dataElement: UID,
    value: z.string(),
    createdBy: UserSchema.optional(),
    updatedBy: UserSchema.optional(),
});

export const EventSchema = z.object({
    event: UID,
    status: z.string(),
    program: UID,
    programStage: UID,
    enrollment: UID,
    trackedEntity: UID,
    orgUnit: UID,
    parentEvent: UID.optional(),
    occurredAt: z.string(),
    followUp: z.boolean(),
    deleted: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    attributeOptionCombo: UID.optional(),
    attributeCategoryOptions: UID.optional(),
    completedBy: z.string().optional(),
    completedAt: z.string().optional(),
    createdBy: UserSchema.optional(),
    updatedBy: UserSchema.optional(),
    dataValues: z.array(DataValueSchema),
    notes: z.array(z.unknown()).optional(),
});

export const EnrollmentsSchema = z.object({
    enrollment: UID,
    createdAt: z.string(),
    updatedAt: z.string(),
    trackedEntity: UID,
    program: UID,
    status: z.string(),
    orgUnit: UID,
    enrolledAt: z.string(),
    occurredAt: z.string(),
    followUp: z.boolean(),
    deleted: z.boolean(),
    createdBy: UserSchema.optional(),
    updatedBy: UserSchema.optional(),
    events: z.array(EventSchema).optional(),
    attributes: z.array(AttributeSchema),
    notes: z.array(z.unknown()).optional(),
});

export const TrackedEntitySchema = z.object({
    trackedEntity: UID,
    trackedEntityType: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    orgUnit: UID,
    inactive: z.boolean(),
    deleted: z.boolean(),
    potentialDuplicate: z.boolean(),
    createdBy: UserSchema.optional(),
    updatedBy: UserSchema.optional(),
    attributes: z.array(AttributeSchema),
    enrollments: z.array(EnrollmentsSchema).optional(),
    programOwners: z
        .array(
            z.object({
                orgUnit: UID,
                trackedEntity: UID,
                program: UID,
            }),
        )
        .optional(),

    parentEntity: UID.optional(),
});

export const TrackedEntityResponseSchema = z.object({
    pager: z.object({
        page: z.number(),
        pageSize: z.number(),
        nextPage: z.string(),
        total: z.number(),
    }),
    trackedEntities: z.array(TrackedEntitySchema),
});

export const EventResponseSchema = z.object({
    pager: z.object({
        page: z.number(),
        pageSize: z.number(),
        nextPage: z.string(),
        total: z.number(),
    }),
    events: z.array(EventSchema),
});

export const FlattenedTrackedEntitySchema = TrackedEntitySchema.omit({
    attributes: true,
    enrollments: true,
}).extend({
    attributes: z.record(z.string(), z.any()),
    syncStatus: SyncStatusSchema,
    lastSynced: z.string(),
    syncError: z.string().nullable().optional(),
    version: z.number(),
});

export const FlattenedEventSchema = EventSchema.omit({
    dataValues: true,
}).extend({
    dataValues: z.record(z.string(), z.any()),
    syncStatus: SyncStatusSchema,
    lastSynced: z.string(),
    syncError: z.string().nullable().optional(),
    version: z.number(),
});
export const FlattenedEnrollmentSchema = EnrollmentsSchema.omit({
    attributes: true,
    events: true,
}).extend({
    attributes: z.record(z.string(), z.any()),
    syncStatus: SyncStatusSchema,
    lastSynced: z.string(),
    syncError: z.string().nullable().optional(),
    version: z.number(),
});

export type Client = z.infer<typeof ClientSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type ProgramStage = z.infer<typeof ProgramStageSchema>;
export type ProgramStageSection = z.infer<typeof ProgramStageSectionSchema>;
export type DataElement = z.infer<typeof DataElementSchema>;
export type ProgramIndicator = z.infer<typeof ProgramIndicatorSchema>;
export type ProgramTrackedEntityAttribute = z.infer<
    typeof ProgramTrackedEntityAttributeSchema
>;
export type OptionSet = z.infer<typeof OptionSetSchema>;
export type ProgramRule = z.infer<typeof ProgramRuleSchema>;
export type ProgramRuleAction = z.infer<typeof ProgramRuleActionSchema>;
export type ProgramRuleVariable = z.infer<typeof ProgramRuleVariableSchema>;
export type OrgUnit = z.infer<typeof OrgUnitSchema>;
export type TrackedEntity = z.infer<typeof TrackedEntitySchema>;
export type TrackedEntityResponse = z.infer<typeof TrackedEntityResponseSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Enrollment = z.infer<typeof EnrollmentsSchema>;
export type DataValue = z.infer<typeof DataValueSchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type User = z.infer<typeof UserSchema>;
export type TrackedEntityAttribute = z.infer<
    typeof TrackedEntityAttributeSchema
>;
export type EventResponse = z.infer<typeof EventResponseSchema>;
export type ProgramSection = z.infer<typeof ProgramSectionSchema>;
export type RenderType = z.infer<typeof RenderTypeSchema>;

export type FlattenedTrackedEntity = z.infer<
    typeof FlattenedTrackedEntitySchema
>;
export type FlattenedEvent = z.infer<typeof FlattenedEventSchema>;
export type FlattenedEnrollment = z.infer<typeof FlattenedEnrollmentSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const MessageSchema = z.object({
    key: z.string(),
    content: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

export type ProgramRuleResult = {
    assignments: Record<string, any>;
    hiddenFields: string[];
    shownFields: string[];
    hiddenSections: string[];
    shownSections: string[];
    messages: Array<Message>;
    warnings: Array<Message>;
    errors: Array<Message>;
    hiddenOptions: Record<string, string[]>;
    shownOptions: Record<string, string[]>;
    hiddenOptionGroups: Record<string, string[]>;
    shownOptionGroups: Record<string, string[]>;
};

/**
 * Persisted rule result in TanStack DB
 * Serialized version of ProgramRuleResult for database storage
 */
export const RuleResultSchema = z.object({
    id: z.string(), // Primary key: `${eventId}_${formType}`
    // eventId: z.string(), // Foreign key to event
    // formType: z.enum(["main", "stage", "registration"]), // Form context
    // trackedEntityId: z.string().optional(), // Optional for registration forms
    // Rule execution results (serialized from ProgramRuleResult)
    assignments: z.record(z.string(), z.any()),
    hiddenFields: z.array(z.string()),
    shownFields: z.array(z.string()),
    hiddenSections: z.array(z.string()),
    shownSections: z.array(z.string()),
    hiddenOptions: z.record(z.string(), z.array(z.string())),
    shownOptions: z.record(z.string(), z.array(z.string())),
    hiddenOptionGroups: z.record(z.string(), z.array(z.string())),
    shownOptionGroups: z.record(z.string(), z.array(z.string())),
    errors: z.array(MessageSchema),
    warnings: z.array(MessageSchema),
    messages: z.array(MessageSchema),

    // Metadata
    // updatedAt: z.string(), // ISO timestamp
    // version: z.number(), // For conflict resolution
});

export type RuleResult = z.infer<typeof RuleResultSchema>;

export type OnChange = {
    pagination?: TablePaginationConfig;
    filters: Record<string, FilterValue | null>;
};

export type Node = Omit<
    GetProp<TreeSelectProps, "treeData">[number],
    "label"
> & { user: string };

export interface RelationshipType {
    name: string;
    created: string;
    lastUpdated: string;
    fromConstraint: Constraint;
    toConstraint: Constraint;
    bidirectional: boolean;
    fromToName: string;
    toFromName: string;
    referral: boolean;
    displayFromToName: string;
    displayToFromName: string;
    displayName: string;
    id: string;
}

export interface Constraint {
    relationshipEntity: string;
    trackedEntityType: TrackedEntityType;
    program: TrackedEntityType;
    trackerDataView: TrackerDataView;
}

export interface TrackerDataView {
    attributes: string[];
    dataElements: any[];
}

export interface TrackedEntityType {
    id: string;
}

export interface Village {
    village_id: string;
    village_name: string;
    parish_name: string;
    subcounty_name: string;
    District: string;
}

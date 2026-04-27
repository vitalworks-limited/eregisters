import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export type DbLike = {
    exec: (
        arg:
            | string
            | {
                  sql: string;
                  bind?: unknown[];
                  rowMode?: "object" | number | string;
                  callback?: (row: unknown) => void;
              },
    ) => unknown;
    close?: () => void;
};

function hasBasicOpfsSupport() {
    return (
        typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.storage &&
        typeof navigator.storage.getDirectory === "function"
    );
}

export async function openDb(): Promise<DbLike> {
    const sqlite3 = await sqlite3InitModule();
    let db: DbLike;

    if (hasBasicOpfsSupport()) {
        try {
            db = new sqlite3.oo1.OpfsDb("/app.db", "ct") as DbLike;
        } catch {
            db = new sqlite3.oo1.DB(":memory:", "ct") as DbLike;
        }
    } else {
        db = new sqlite3.oo1.DB(":memory:", "ct") as DbLike;
    }

    db.exec(`

			PRAGMA foreign_keys = ON;

			-- =========================================================
			-- CORE / INFRASTRUCTURE
			-- =========================================================

			CREATE TABLE IF NOT EXISTS metadata_sync_state (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					updated_at TEXT NOT NULL
			);

			-- =========================================================
			-- METADATA
			-- =========================================================
			CREATE TABLE IF NOT EXISTS optionSets (
					id TEXT,
					optionSet TEXT NOT NULL,
					code TEXT NOT NULL,
					name TEXT NOT NULL,
					sortOrder INTEGER,
					PRIMARY KEY (id, optionSet)
			);

			CREATE TABLE IF NOT EXISTS optionGroups (
					id TEXT,
					optionGroup TEXT NOT NULL,
					code TEXT NOT NULL,
					name TEXT NOT NULL,
					sortOrder INTEGER,
					PRIMARY KEY (id, optionGroup)
			);

			CREATE TABLE IF NOT EXISTS dataElements (
					id TEXT PRIMARY KEY,
					code TEXT,
					name TEXT NOT NULL,
					optionSet TEXT,
					optionSetValue INTEGER NOT NULL CHECK (optionSetValue IN (0, 1)),
					valueType TEXT NOT NULL,
					formName TEXT,
			);


			CREATE TABLE IF NOT EXISTS trackedEntityAttributes (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					value_type TEXT NOT NULL,
					confidential INTEGER NOT NULL CHECK (confidential IN (0, 1)),
					unique INTEGER NOT NULL CHECK (unique IN (0, 1)),
					generated INTEGER NOT NULL CHECK (generated IN (0, 1)),
					pattern TEXT,
					optionSet TEXT,
					optionSetValue INTEGER NOT NULL CHECK (optionSetValue IN (0, 1)),
					displayFormName TEXT,
					formName TEXT,
			);

			CREATE TABLE IF NOT EXISTS programs (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					organisationUnits TEXT NOT NULL,
					programSections TEXT NOT NULL,
					programStages TEXT NOT NULL,
					programTrackedEntityAttributes TEXT NOT NULL,
					programType TEXT NOT NULL,
					selectEnrollmentDatesInFuture INTEGER NOT NULL CHECK (selectEnrollmentDatesInFuture IN (0, 1)),
					selectIncidentDatesInFuture INTEGER NOT NULL CHECK (selectIncidentDatesInFuture IN (0, 1)),
					trackedEntityType TEXT
			);

		
			

			CREATE TABLE IF NOT EXISTS programIndicators (
					id TEXT PRIMARY KEY,
					program TEXT NOT NULL,
					name TEXT NOT NULL,
					filter TEXT,
					expression TEXT NOT NULL,
					aggregationType TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS programRules (
					id TEXT PRIMARY KEY,
					program TEXT,
					programStage TEXT,
					name TEXT NOT NULL,
					displayName TEXT,
					description TEXT,
					condition TEXT NOT NULL,
					priority INTEGER NOT NULL,
					attributeValues TEXT,
					programRuleActions TEXT
			);

			CREATE TABLE IF NOT EXISTS programRuleVariables (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					displayName TEXT NOT NULL,
					program TEXT,
					dataElement TEXT,
					tracked_entity_attribute_id TEXT,
					useCodeForOptionSet INTEGER NOT NULL CHECK (useCodeForOptionSet IN (0, 1)),
					programRuleVariableSourceType TEXT NOT NULL,
					valueType TEXT NOT NULL,
					attributeValues TEXT
			);


			CREATE TABLE IF NOT EXISTS trackedEntities (
					trackedEntity TEXT PRIMARY KEY,
					trackedEntityType TEXT NOT NULL,
					createdAt TEXT NOT NULL,
					updatedAt TEXT NOT NULL,
					orgUnit TEXT NOT NULL,
					inactive INTEGER NOT NULL CHECK (inactive IN (0, 1)),
					deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
					potentialDuplicate INTEGER NOT NULL CHECK (potential_duplicate IN (0, 1)),
					parentEntity TEXT,
					createdBy TEXT,
					updatedBy TEXT,
					attributes TEXT NOT NULL CHECK (json_valid(attributes_json)),
					syncStatus TEXT NOT NULL,
					lastSynced TEXT NOT NULL,
					syncError TEXT,
					version INTEGER NOT NULL DEFAULT 1
			);

			CREATE TABLE IF NOT EXISTS enrollments (
					enrollment TEXT PRIMARY KEY,
					trackedEntity TEXT NOT NULL,
					program TEXT NOT NULL,
					status TEXT NOT NULL,
					orgUnit TEXT NOT NULL,
					enrolledAt TEXT NOT NULL,
					occurredAt TEXT NOT NULL,
					followUp INTEGER NOT NULL CHECK (followUp IN (0, 1)),
					deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
					createdAt TEXT NOT NULL,
					updatedAt TEXT NOT NULL,
					createdBy TEXT,
					updatedBy TEXT,
					attributes TEXT NOT NULL CHECK (json_valid(attributes)),
					syncStatus TEXT NOT NULL,
					lastSynced TEXT NOT NULL,
					syncError TEXT,
					version INTEGER NOT NULL DEFAULT 1
			);

			CREATE TABLE IF NOT EXISTS events (
					event TEXT PRIMARY KEY,
					status TEXT NOT NULL,
					program TEXT NOT NULL,
					program_stage TEXT NOT NULL,
					enrollment TEXT NOT NULL,
					trackedEntity TEXT NOT NULL,
					orgUnit TEXT NOT NULL,
					parent_event TEXT,
					occurredAt TEXT NOT NULL,
					followUp INTEGER NOT NULL CHECK (followUp IN (0, 1)),
					deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
					createdAt TEXT NOT NULL,
					updatedAt TEXT NOT NULL,
					attributeOptionCombo TEXT,
					attributeCategoryOptions TEXT,
					completedBy TEXT,
					completedAt TEXT,
					createdBy TEXT,
					updatedBy TEXT,
					dataValues TEXT NOT NULL CHECK (json_valid(dataValues)),
					syncStatus TEXT NOT NULL,
					lastSynced TEXT NOT NULL,
					syncError TEXT,
					version INTEGER NOT NULL DEFAULT 1
			);

			-- =========================================================
			-- RUNTIME ANALYTICS / EVALUATION
			-- =========================================================

			CREATE TABLE IF NOT EXISTS indicatorEvaluations (
					id TEXT PRIMARY KEY,
					event TEXT NOT NULL,
					results TEXT NOT NULL CHECK (json_valid(results)),
					updatedAt TEXT NOT NULL,
					version INTEGER NOT NULL DEFAULT 1
			);

			-- =========================================================
			-- INDEXES FOR TRANSACTIONAL DATA
			-- =========================================================

			CREATE INDEX IF NOT EXISTS idx_tracked_entities_org_unit
			ON trackedEntities(orgUnit);

			CREATE INDEX IF NOT EXISTS idx_tracked_entities_sync_status
			ON trackedEntities(syncStatus);

			CREATE INDEX IF NOT EXISTS idx_tracked_entities_type
			ON trackedEntities(tracked_entity_type);

			CREATE INDEX IF NOT EXISTS idx_tracked_entities_parent_entity
			ON trackedEntities(parent_entity);

			CREATE INDEX IF NOT EXISTS idx_enrollments_tracked_entity
			ON enrollments(tracked_entity);

			CREATE INDEX IF NOT EXISTS idx_enrollments_program
			ON enrollments(program);

			CREATE INDEX IF NOT EXISTS idx_enrollments_org_unit
			ON enrollments(org_unit);

			CREATE INDEX IF NOT EXISTS idx_enrollments_sync_status
			ON enrollments(sync_status);

			CREATE INDEX IF NOT EXISTS idx_events_enrollment
			ON events(enrollment);

			CREATE INDEX IF NOT EXISTS idx_events_tracked_entity
			ON events(trackedEntity);

			CREATE INDEX IF NOT EXISTS idx_events_program
			ON events(program);

			CREATE INDEX IF NOT EXISTS idx_events_program_stage
			ON events(programStage);

			CREATE INDEX IF NOT EXISTS idx_events_org_unit
			ON events(orgUnit);

			CREATE INDEX IF NOT EXISTS idx_events_occurred_at
			ON events(occurredAt);

			CREATE INDEX IF NOT EXISTS idx_events_sync_status
			ON events(syncStatus);

			CREATE INDEX IF NOT EXISTS idx_events_parent_event
			ON events(parentEvent);

  `);

    return db;
}

export type Note = {
    id: number;
    title: string;
    body: string | null;
    created_at: string;
};

export async function listNotes(db: DbLike): Promise<Note[]> {
    const rows: Note[] = [];

    db.exec({
        sql: `
      SELECT id, title, body, created_at
      FROM notes
      ORDER BY id DESC
    `,
        rowMode: "object",
        callback: (row) => rows.push(row as Note),
    });

    return rows;
}

export async function createNote(
    db: DbLike,
    input: { title: string; body?: string | null },
): Promise<void> {
    db.exec({
        sql: `INSERT INTO notes(title, body) VALUES(?, ?)`,
        bind: [input.title.trim(), input.body ?? null],
    });
}

export async function deleteNote(db: DbLike, id: number): Promise<void> {
    db.exec({
        sql: `DELETE FROM notes WHERE id = ?`,
        bind: [id],
    });
}

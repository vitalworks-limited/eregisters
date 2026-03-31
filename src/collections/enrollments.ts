import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { FlattenedEnrollmentSchema } from "../schemas";

export const createEnrollmentCollection = () =>
    createCollection(
        dexieCollectionOptions({
            id: "enrollments",
            dbName: "MOHRegister_Enrollments",
            tableName: "enrollments",
            schema: FlattenedEnrollmentSchema,
            awaitPersistence: false,
            swallowPersistenceErrors: true,
            getKey: (enrollment) => enrollment.enrollment,
        }),
    );

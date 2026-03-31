import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { FlattenedTrackedEntitySchema } from "../schemas";

export const createTrackedEntityCollection = () =>
    createCollection(
        dexieCollectionOptions({
            schema: FlattenedTrackedEntitySchema,
            id: "trackedEntities",
            dbName: "MOHRegister_TrackedEntities",
            tableName: "trackedEntities",
            getKey: (trackedEntity) => trackedEntity.trackedEntity,
            awaitPersistence: false,
            swallowPersistenceErrors: true,
        }),
    );

import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { FlattenedEventSchema } from "../schemas";

export const createEventCollection = () =>
    createCollection(
        dexieCollectionOptions({
            id: "events",
            dbName: "MOHRegister_Events",
            tableName: "events",
            schema: FlattenedEventSchema,
            awaitPersistence: false,
            swallowPersistenceErrors: true,
            getKey: (event) => event.event,
        }),
    );

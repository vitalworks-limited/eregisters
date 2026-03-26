import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { RuleResultSchema } from "../schemas";

export const ruleResultsCollection = createCollection(
    dexieCollectionOptions({
        id: "ruleResults",
        dbName: "MOHRegisterDB",
        tableName: "ruleResults",
        schema: RuleResultSchema,
        awaitPersistence: false,
        swallowPersistenceErrors: true,
        getKey: (result) => result.id,
    }),
);

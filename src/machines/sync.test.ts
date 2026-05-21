/// <reference types="jest" />

import {
    isDataPullLoading,
    isDataPushLoading,
    isMetadataSyncLoading,
    shouldRecordDataPush,
    shouldContinueDataPull,
    shouldUseLastDataPull,
    shouldUseLastUpdatedFilter,
} from "./sync-metadata-mode";

describe("metadata sync mode", () => {
    it("does not use lastUpdated filters for full metadata syncs", () => {
        expect(
            shouldUseLastUpdatedFilter("full", "2026-05-21T08:00:00.000Z"),
        ).toBe(false);
    });

    it("uses lastUpdated filters for incremental syncs when a timestamp exists", () => {
        expect(
            shouldUseLastUpdatedFilter(
                "incremental",
                "2026-05-21T08:00:00.000Z",
            ),
        ).toBe(true);
    });

    it("does not show metadata sync as idle just because no previous pull exists", () => {
        expect(isMetadataSyncLoading(true, undefined)).toBe(true);
    });

    it("does not use lastDataPull for full data pulls", () => {
        expect(
            shouldUseLastDataPull("full", "2026-05-21T08:00:00.000Z"),
        ).toBe(false);
    });

    it("uses lastDataPull for incremental data pulls when a timestamp exists", () => {
        expect(
            shouldUseLastDataPull(
                "incremental",
                "2026-05-21T08:00:00.000Z",
            ),
        ).toBe(true);
    });

    it("does not show data pull as idle just because no previous pull exists", () => {
        expect(isDataPullLoading(true, undefined)).toBe(true);
    });

    it("shows data push loading for direct and batch push states", () => {
        expect(isDataPushLoading(true)).toBe(true);
    });

    it("does not record a data push when no records were processed", () => {
        expect(shouldRecordDataPush({ processed: 0 })).toBe(false);
    });

    it("stops data pull pagination when the API returns a full page but no next page", () => {
        expect(
            shouldContinueDataPull({
                receivedCount: 100,
                pageSize: 100,
                pager: { page: 1, pageSize: 100, total: 100 },
            }),
        ).toBe(false);
    });

    it("stops data pull pagination on an empty page even if nextPage is present", () => {
        expect(
            shouldContinueDataPull({
                receivedCount: 0,
                pageSize: 100,
                pager: {
                    page: 2,
                    pageSize: 100,
                    nextPage: "/tracker/trackedEntities?page=3",
                },
            }),
        ).toBe(false);
    });

    it("stops data pull pagination when pageCount says the current page is last", () => {
        expect(
            shouldContinueDataPull({
                receivedCount: 100,
                pageSize: 100,
                pager: {
                    page: 3,
                    pageCount: 3,
                    nextPage: "/tracker/trackedEntities?page=4",
                },
            }),
        ).toBe(false);
    });
});

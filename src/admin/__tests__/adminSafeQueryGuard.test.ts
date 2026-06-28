import {
    assertAdminOverviewSafeRequest,
    detectUnsafeAdminRequest,
} from "../adminSafeQueryGuard";

describe("adminSafeQueryGuard", () => {
    describe("blocks unsafe URLs in ADMIN_OVERVIEW context", () => {
        const blocked = [
            "/api/42/tracker/trackedEntities?fields=*",
            "/api/42/tracker/trackedEntities?enrollments[*,events[*]]",
            "/api/42/tracker/trackedEntities?pageSize=100&orgUnit=foo",
            "/api/42/tracker/events?orgUnit=foo",
            "/api/42/tracker?async=false",
            "/api/42/tracker/trackedEntities",
        ];
        test.each(blocked)("throws for %s", (url) => {
            expect(() => assertAdminOverviewSafeRequest(url)).toThrow(
                /Unsafe Admin Overview/,
            );
        });
    });

    describe("allows safe Admin Overview reads", () => {
        const allowed = [
            "/api/dataStore/eregisters-admin-monitoring/overview/THIS_YEAR/NATIONAL/NATIONAL",
            "/api/apps/eregisters/admin/summary/overview",
            "/api/analytics?dimension=ou:NATIONAL&dimension=pe:THIS_YEAR",
            "/api/me?fields=id,displayName,authorities,organisationUnits[id,displayName],dataViewOrganisationUnits[id,displayName]",
            "/api/dataStore/eregisters-admin/sync-config",
            // Count-only tracker probes are explicitly tolerated.
            "/api/tracker/trackedEntities?program=PROG&ouMode=DESCENDANTS&orgUnit=ROOT&pageSize=1&totalPages=true&fields=trackedEntity",
            "/api/tracker/events?program=PROG&ouMode=DESCENDANTS&orgUnit=ROOT&pageSize=1&totalPages=true&fields=event",
        ];
        test.each(allowed)("does not throw for %s", (url) => {
            expect(() => assertAdminOverviewSafeRequest(url)).not.toThrow();
        });
    });

    test("non-overview context is a no-op", () => {
        expect(() =>
            assertAdminOverviewSafeRequest(
                "/api/42/tracker/trackedEntities?fields=*",
                "SYNC",
            ),
        ).not.toThrow();
    });

    test("detectUnsafeAdminRequest returns the first violation for unsafe URLs", () => {
        const v = detectUnsafeAdminRequest(
            "/api/42/tracker/trackedEntities?fields=*",
        );
        expect(v?.pattern).toBe("tracker/trackedEntities");
    });

    test("detectUnsafeAdminRequest returns null for safe URLs", () => {
        expect(
            detectUnsafeAdminRequest(
                "/api/dataStore/eregisters-admin-monitoring/overview",
            ),
        ).toBeNull();
    });

    test("handles percent-encoded inputs", () => {
        expect(() =>
            assertAdminOverviewSafeRequest(
                "/api/42/tracker/trackedEntities?fields%3D%2A",
            ),
        ).toThrow();
    });
});

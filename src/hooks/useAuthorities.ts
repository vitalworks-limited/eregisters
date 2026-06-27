import { useCurrentUserInfo } from "@dhis2/app-runtime";

/**
 * Tiny wrapper around the DHIS2 user info so guards / nav rendering /
 * routes don't have to know the shape of the user object.
 *
 * `ALL` is the DHIS2 superuser authority — it implicitly grants every
 * other authority, including ours. We treat it as having both EREG_USER
 * and EREG_ADMIN.
 */

export const EREG_USER = "EREG_USER";
export const EREG_ADMIN = "EREG_ADMIN";

interface UserInfoLike {
    authorities?: string[];
}

export interface AuthoritiesHookResult {
    authorities: ReadonlySet<string>;
    has: (authority: string) => boolean;
    /** True if the user has EREG_ADMIN (or DHIS2 superuser ALL). */
    isAdmin: boolean;
    /**
     * True if the user has EREG_USER (or implicitly via ALL / EREG_ADMIN).
     * Returns true by default for any authenticated user so the existing
     * UI keeps working on legacy DHIS2 instances where the authority
     * wasn't created.
     */
    isUser: boolean;
}

export function useAuthorities(): AuthoritiesHookResult {
    const info = useCurrentUserInfo() as UserInfoLike | undefined;
    const list = info?.authorities ?? [];
    const set = new Set(list);
    const hasAll = set.has("ALL");
    const isAdmin = hasAll || set.has(EREG_ADMIN);
    const isUser =
        isAdmin || set.has(EREG_USER) || list.length === 0
            ? true
            : !!info; // any authenticated user implicitly gets EREG_USER
    return {
        authorities: set,
        has: (a) => hasAll || set.has(a),
        isAdmin,
        isUser,
    };
}

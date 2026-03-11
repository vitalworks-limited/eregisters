/**
 * Program Configuration
 *
 * Centralizes all hardcoded UIDs and program-specific configurations.
 * This makes the application configurable for different DHIS2 programs.
 */

export interface ProgramConfig {
    // Program and tracked entity type IDs
    programId: string;
    trackedEntityTypeId: string;

    // Main program stage ID
    mainProgramStageId: string;

    // Data element IDs
    dataElements: {
        services: string; // Service type selection
        referral: string; // Referral indication
        [key: string]: string; // Allow additional data elements
    };

    // Tracked entity attribute IDs
    attributes: {
        // Mother attributes
        village: string;
        parish: string;
        subcounty: string;
        district: string;
        surname: string;
        givenName: string;
        dob: string;
        sex: string;
        registrationDate: string;

        // Child attributes
        childFullName: string;
        childName: string;
        childSex: string;
        childDob: string;

        [key: string]: string; // Allow additional attributes
    };

    // Attribute mappings (data element � attribute)
    attributeMappings: {
        dataElementToAttribute: Record<string, string>;
        parentAttributesToCopy: string[];
        combinedAttributes: Record<
            string,
            {
                sourceAttributes: string[];
                separator?: string;
            }
        >;
    };

    // Program stages
    stages: Record<
        string,
        {
            id: string;
            name: string;
            sortOrder: number;
        }
    >;
}

/**
 * Default configuration for Maternal and Child Health program
 */
export const defaultProgramConfig: ProgramConfig = {
    // Program identifiers
    programId: "WSGAb5XwJ3Y", // Replace with actual program ID
    trackedEntityTypeId: "QG9qZrGHLzV",

    // Main program stage
    mainProgramStageId: "K2nxbE9ubSs",

    // Data elements
    dataElements: {
        services: "mrKZWf2WMIC",
        referral: "REWqohCg4Km",
    },

    // Tracked entity attributes
    attributes: {
        // Location attributes
        village: "XjgpfkoxffK",
        parish: "PKuyTiVCR89",
        subcounty: "W87HAtUHJjB",
        district: "oTI0DLitzFY",

        // Personal attributes
        surname: "KSq9EyZ8ZFi",
        givenName: "TWPNbc9O2nK",
        fullName: "P6Kp91wfCWy",
        dob: "xcYGVzmcWvi",
        sex: "hPGgzWsb14m",
        registrationDate: "enrolledAt",

        // Child attributes
        childFullName: "ACgDjRCyX8r",
        childName: "P6Kp91wfCWy", // Same as fullName for children
        childSex: "b2cMfkY6M3h",
        childDob: "Y3DE5CZWySr",
    },

    // Attribute mappings for child creation
    attributeMappings: {
        // Map data elements to child attributes
        dataElementToAttribute: {
            KJ2V2JlOxFi: "Y3DE5CZWySr", // DOB mapping
        },

        // Parent attributes to copy to child
        parentAttributesToCopy: [
            "XjgpfkoxffK", // Village
            "PKuyTiVCR89", // Parish
            "W87HAtUHJjB", // Subcounty
            "oTI0DLitzFY", // District
        ],

        // Combined attributes (concatenate multiple source attributes)
        combinedAttributes: {
            // Child full name from parent names
            P6Kp91wfCWy: {
                sourceAttributes: ["KSq9EyZ8ZFi", "TWPNbc9O2nK"],
                separator: " ",
            },
            // Child sex
            ACgDjRCyX8r: {
                sourceAttributes: ["hPGgzWsb14m"],
                separator: " ",
            },
            // Child DOB
            b2cMfkY6M3h: {
                sourceAttributes: ["b2x4gA14JsP"],
                separator: " ",
            },
            // Location attributes for child
            lpAaZa1cKCB: { separator: " ", sourceAttributes: ["XjgpfkoxffK"] },
            lqbqW3iYmKl: { separator: " ", sourceAttributes: ["PKuyTiVCR89"] },
            BiergDUeQra: { separator: " ", sourceAttributes: ["W87HAtUHJjB"] },
            pixScollYA6: { separator: " ", sourceAttributes: ["oTI0DLitzFY"] },
            // Additional child attributes
            sOBCVNIm1kX: { separator: " ", sourceAttributes: ["XjgpfkoxffK"] },
            qbxJxuZCyKu: { separator: " ", sourceAttributes: ["PKuyTiVCR89"] },
            SjvgaRn8m7Y: { separator: " ", sourceAttributes: ["W87HAtUHJjB"] },
            YoteNDkoIwM: { separator: " ", sourceAttributes: ["oTI0DLitzFY"] },
        },
    },

    // Program stages with sort order
    stages: {
        ancVisit: {
            id: "x5x1cHHjg00",
            name: "ANC Visit",
            sortOrder: 7,
        },
        birthNotification: {
            id: "opwSN351xGC",
            name: "Birth Notification",
            sortOrder: 5,
        },
        childFollowUp: {
            id: "dyt37jxHYGv",
            name: "Child Follow-up",
            sortOrder: 6,
        },
        postnatal: {
            id: "VzKe0OzKS8O",
            name: "Postnatal",
            sortOrder: 1,
        },
        pncVisit: {
            id: "zKGWob5AZKP",
            name: "PNC Visit",
            sortOrder: 3,
        },
        mainRegistration: {
            id: "K2nxbE9ubSs",
            name: "Main Registration",
            sortOrder: 2,
        },
        delivery: {
            id: "DA0Yt3V16AN",
            name: "Delivery",
            sortOrder: 4,
        },
        pmtct: {
            id: "wmPg6qplttg",
            name: "PMTCT",
            sortOrder: 8,
        },
    },
};

/**
 * Get program configuration (can be overridden with environment variables or settings)
 */
export function getProgramConfig(): ProgramConfig {
    // In the future, this could load from localStorage, environment variables,
    // or an API endpoint to support multiple programs
    return defaultProgramConfig;
}

/**
 * Helper to get a specific stage ID by key
 */
export function getStageId(stageKey: keyof ProgramConfig["stages"]): string {
    const config = getProgramConfig();
    return config.stages[stageKey].id;
}

/**
 * Helper to get a specific attribute ID by key
 */
export function getAttributeId(
    attributeKey: keyof ProgramConfig["attributes"],
): string {
    const config = getProgramConfig();
    return config.attributes[attributeKey];
}

/**
 * Helper to get a specific data element ID by key
 */
export function getDataElementId(
    dataElementKey: keyof ProgramConfig["dataElements"],
): string {
    const config = getProgramConfig();
    return config.dataElements[dataElementKey];
}

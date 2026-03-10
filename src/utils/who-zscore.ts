/**
 * WHO Z-Score Calculation Functions
 *
 * Implements WHO growth standards z-score calculations using the LMS method.
 * Formula: Z = ((value/M)^L - 1) / (L * S)
 *
 * Where:
 * - L (Lambda): Power in Box-Cox transformation
 * - M (Mu): Median value
 * - S (Sigma): Coefficient of variation
 *
 * References:
 * - WHO Child Growth Standards: https://www.who.int/tools/child-growth-standards
 * - WHO Growth Reference (5-19 years): https://www.who.int/tools/growth-reference-data-for-5to19-years
 */

import {
    WFA_TABLE,
    HFA_TABLE,
    WFH_TABLE,
    BMIFA_TABLE,
    type LMSPoint,
    type LMSTable,
} from "./who-zscore-tables";

/**
 * Calculate z-score using WHO LMS method
 */
function calculateZScore(value: number, L: number, M: number, S: number): number {
    if (value <= 0 || M <= 0 || S <= 0) {
        return NaN;
    }

    // Special case when L = 0 (use log transformation)
    if (Math.abs(L) < 0.0001) {
        return Math.log(value / M) / S;
    }

    // Standard LMS formula: Z = ((value/M)^L - 1) / (L * S)
    const ratio = value / M;
    const powered = Math.pow(ratio, L);
    const zscore = (powered - 1) / (L * S);

    return zscore;
}

/**
 * Get LMS values from table with linear interpolation
 */
function getLMSValues(
    table: LMSPoint[],
    key: number,
): { L: number; M: number; S: number } | null {
    if (!table || table.length === 0) {
        return null;
    }

    // Find exact match
    const exact = table.find((point) => point.key === key);
    if (exact) {
        return { L: exact.L, M: exact.M, S: exact.S };
    }

    // Find surrounding points for interpolation
    let lower: LMSPoint | null = null;
    let upper: LMSPoint | null = null;

    for (let i = 0; i < table.length; i++) {
        if (table[i].key < key) {
            lower = table[i];
        } else if (table[i].key > key) {
            upper = table[i];
            break;
        }
    }

    // Handle edge cases
    if (!lower && upper) {
        // Below minimum - use first point
        return { L: upper.L, M: upper.M, S: upper.S };
    }
    if (lower && !upper) {
        // Above maximum - use last point
        return { L: lower.L, M: lower.M, S: lower.S };
    }
    if (!lower || !upper) {
        return null;
    }

    // Linear interpolation
    const ratio = (key - lower.key) / (upper.key - lower.key);
    return {
        L: lower.L + ratio * (upper.L - lower.L),
        M: lower.M + ratio * (upper.M - lower.M),
        S: lower.S + ratio * (upper.S - lower.S),
    };
}

/**
 * Normalize sex parameter to 'M' or 'F'
 */
function normalizeSex(sex: any): "M" | "F" | null {
    if (!sex) return null;

    const sexStr = String(sex).toUpperCase().trim();

    // Handle various sex representations
    if (sexStr === "M" || sexStr === "MALE" || sexStr === "BOY") return "M";
    if (sexStr === "F" || sexStr === "FEMALE" || sexStr === "GIRL") return "F";

    return null;
}

/**
 * Calculate Weight-for-Age z-score
 *
 * @param ageMonths - Age in months (0-60)
 * @param weightKg - Weight in kilograms
 * @param sex - Sex ('M'/'Male'/'Boy' or 'F'/'Female'/'Girl')
 * @returns Z-score or null if parameters invalid
 */
export function zScoreWFA(
    ageMonths: number,
    weightKg: number,
    sex: any,
): number | null {
    const normalizedSex = normalizeSex(sex);
    if (!normalizedSex) {
        console.warn(`[zScoreWFA] Invalid sex: ${sex}`);
        return null;
    }

    if (
        typeof ageMonths !== "number" ||
        typeof weightKg !== "number" ||
        ageMonths < 0 ||
        ageMonths > 60 ||
        weightKg <= 0
    ) {
        console.warn(
            `[zScoreWFA] Invalid parameters: age=${ageMonths}, weight=${weightKg}`,
        );
        return null;
    }

    const table = normalizedSex === "M" ? WFA_TABLE.boys : WFA_TABLE.girls;
    const lms = getLMSValues(table, ageMonths);

    if (!lms) {
        console.warn(`[zScoreWFA] Could not find LMS values for age ${ageMonths}`);
        return null;
    }

    const zscore = calculateZScore(weightKg, lms.L, lms.M, lms.S);
    return isNaN(zscore) ? null : Math.round(zscore * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate Height-for-Age z-score
 *
 * @param ageMonths - Age in months (0-228)
 * @param heightCm - Height in centimeters
 * @param sex - Sex ('M'/'Male'/'Boy' or 'F'/'Female'/'Girl')
 * @returns Z-score or null if parameters invalid
 */
export function zScoreHFA(
    ageMonths: number,
    heightCm: number,
    sex: any,
): number | null {
    const normalizedSex = normalizeSex(sex);
    if (!normalizedSex) {
        console.warn(`[zScoreHFA] Invalid sex: ${sex}`);
        return null;
    }

    if (
        typeof ageMonths !== "number" ||
        typeof heightCm !== "number" ||
        ageMonths < 0 ||
        ageMonths > 228 ||
        heightCm <= 0
    ) {
        console.warn(
            `[zScoreHFA] Invalid parameters: age=${ageMonths}, height=${heightCm}`,
        );
        return null;
    }

    const table = normalizedSex === "M" ? HFA_TABLE.boys : HFA_TABLE.girls;
    const lms = getLMSValues(table, ageMonths);

    if (!lms) {
        console.warn(`[zScoreHFA] Could not find LMS values for age ${ageMonths}`);
        return null;
    }

    const zscore = calculateZScore(heightCm, lms.L, lms.M, lms.S);
    return isNaN(zscore) ? null : Math.round(zscore * 100) / 100;
}

/**
 * Calculate Weight-for-Height z-score
 *
 * @param heightCm - Height in centimeters (45-110)
 * @param weightKg - Weight in kilograms
 * @param sex - Sex ('M'/'Male'/'Boy' or 'F'/'Female'/'Girl')
 * @returns Z-score or null if parameters invalid
 */
export function zScoreWFH(
    heightCm: number,
    weightKg: number,
    sex: any,
): number | null {
    const normalizedSex = normalizeSex(sex);
    if (!normalizedSex) {
        console.warn(`[zScoreWFH] Invalid sex: ${sex}`);
        return null;
    }

    if (
        typeof heightCm !== "number" ||
        typeof weightKg !== "number" ||
        heightCm < 45 ||
        heightCm > 110 ||
        weightKg <= 0
    ) {
        console.warn(
            `[zScoreWFH] Invalid parameters: height=${heightCm}, weight=${weightKg}`,
        );
        return null;
    }

    const table = normalizedSex === "M" ? WFH_TABLE.boys : WFH_TABLE.girls;
    const lms = getLMSValues(table, heightCm);

    if (!lms) {
        console.warn(`[zScoreWFH] Could not find LMS values for height ${heightCm}`);
        return null;
    }

    const zscore = calculateZScore(weightKg, lms.L, lms.M, lms.S);
    return isNaN(zscore) ? null : Math.round(zscore * 100) / 100;
}

/**
 * Calculate BMI-for-Age z-score
 *
 * @param ageMonths - Age in months (0-228)
 * @param bmi - BMI (kg/m²)
 * @param sex - Sex ('M'/'Male'/'Boy' or 'F'/'Female'/'Girl')
 * @returns Z-score or null if parameters invalid
 */
export function zScoreBMIFA(
    ageMonths: number,
    bmi: number,
    sex: any,
): number | null {
    const normalizedSex = normalizeSex(sex);
    if (!normalizedSex) {
        console.warn(`[zScoreBMIFA] Invalid sex: ${sex}`);
        return null;
    }

    if (
        typeof ageMonths !== "number" ||
        typeof bmi !== "number" ||
        ageMonths < 0 ||
        ageMonths > 228 ||
        bmi <= 0
    ) {
        console.warn(
            `[zScoreBMIFA] Invalid parameters: age=${ageMonths}, bmi=${bmi}`,
        );
        return null;
    }

    const table = normalizedSex === "M" ? BMIFA_TABLE.boys : BMIFA_TABLE.girls;
    const lms = getLMSValues(table, ageMonths);

    if (!lms) {
        console.warn(`[zScoreBMIFA] Could not find LMS values for age ${ageMonths}`);
        return null;
    }

    const zscore = calculateZScore(bmi, lms.L, lms.M, lms.S);
    return isNaN(zscore) ? null : Math.round(zscore * 100) / 100;
}

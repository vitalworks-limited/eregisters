import dayjs from "dayjs";
import {
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramIndicator,
} from "../schemas";

/**
 * Build variable values for program indicator evaluation
 * Similar to how variables are built for program rules
 *
 * @param event - The event to evaluate
 * @param trackedEntityOrAttributes - Either a FlattenedTrackedEntity or a plain attributes object
 */
export function buildIndicatorVariables(
    event: FlattenedEvent,
    trackedEntityOrAttributes?: FlattenedTrackedEntity | Record<string, any>,
): Record<string, any> {
    const variableValues: Record<string, any> = {};

    // System variables
    variableValues["current_date"] = dayjs().format("YYYY-MM-DD");
    variableValues["event_date"] = event.occurredAt;
    variableValues["event_count"] = 1;
    // analytics_period_start defaults to the first day of the current month
    variableValues["analytics_period_start"] = dayjs()
        .startOf("month")
        .format("YYYY-MM-DD");
    variableValues["analytics_period_end"] = dayjs()
        .endOf("month")
        .format("YYYY-MM-DD");

    // Add all data element values from the event
    if (event.dataValues) {
        for (const [dataElementId, value] of Object.entries(event.dataValues)) {
            variableValues[dataElementId] = value;
        }
    }

    // Add tracked entity attributes if provided
    if (trackedEntityOrAttributes) {
        // Check if it's a FlattenedTrackedEntity (has trackedEntity property)
        const isFlattenedTrackedEntity =
            "trackedEntity" in trackedEntityOrAttributes;
        const attributeValues = isFlattenedTrackedEntity
            ? trackedEntityOrAttributes.attributes
            : trackedEntityOrAttributes;

        for (const [attributeId, value] of Object.entries(attributeValues)) {
            variableValues[attributeId] = value;
        }
    }

    return variableValues;
}

/**
 * Helper function to find the closing parenthesis, skipping over string literals
 */
function findClosingParen(str: string, startPos: number): number {
    let depth = 1;
    let inString = false;
    let stringChar = "";
    for (let i = startPos; i < str.length; i++) {
        const ch = str[i];
        if (inString) {
            if (ch === "\\" && i + 1 < str.length) {
                i++; // skip escaped char
                continue;
            }
            if (ch === stringChar) {
                inString = false;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            inString = true;
            stringChar = ch;
            continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Split a string by commas, but only at the top level (respecting nested parentheses and strings)
 */
function splitTopLevel(str: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    let inString = false;
    let stringChar = "";
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (inString) {
            current += ch;
            if (ch === "\\" && i + 1 < str.length) {
                current += str[++i];
                continue;
            }
            if (ch === stringChar) {
                inString = false;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            inString = true;
            stringChar = ch;
            current += ch;
            continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts;
}

/**
 * Evaluate a single condition/filter expression
 * This is a simplified version adapted from utils.ts evaluateCondition
 */
function evaluateFilter(
    filter: string,
    variableValues: Record<string, any>,
): boolean {
    if (!filter || filter.trim() === "") {
        return true; // No filter means all events match
    }

    let processedFilter = filter;

    // Strip aggregate wrappers: sum(...), avg(...), count(...) → just the inner expression
    // For single-event evaluation these are identity operations
    const aggregateFns = ["sum", "avg"];
    let changed = true;
    while (changed) {
        changed = false;
        for (const fn of aggregateFns) {
            const regex = new RegExp(`\\b${fn}\\s*\\(`);
            const match = processedFilter.match(regex);
            if (match && match.index !== undefined) {
                const openParen = match.index + match[0].length - 1;
                const closeParen = findClosingParen(
                    processedFilter,
                    openParen + 1,
                );
                if (closeParen !== -1) {
                    const inner = processedFilter.substring(
                        openParen + 1,
                        closeParen,
                    );
                    processedFilter =
                        processedFilter.substring(0, match.index) +
                        `(${inner})` +
                        processedFilter.substring(closeParen + 1);
                    changed = true;
                }
            }
        }
    }

    // Convert DHIS2 if(cond, trueVal, falseVal) → (cond ? trueVal : falseVal)
    // "if" is a reserved word in JS so we must transform it
    let ifChanged = true;
    while (ifChanged) {
        ifChanged = false;
        const ifMatch = processedFilter.match(/\bif\s*\(/);
        if (ifMatch && ifMatch.index !== undefined) {
            const openParen = ifMatch.index + ifMatch[0].length - 1;
            const closeParen = findClosingParen(
                processedFilter,
                openParen + 1,
            );
            if (closeParen !== -1) {
                const argsStr = processedFilter.substring(
                    openParen + 1,
                    closeParen,
                );
                // Split on top-level commas only (respect nested parens)
                const ifArgs = splitTopLevel(argsStr);
                if (ifArgs.length === 3) {
                    const [cond, trueVal, falseVal] = ifArgs.map((a) =>
                        a.trim(),
                    );
                    const replacement = `((${cond}) ? (${trueVal}) : (${falseVal}))`;
                    processedFilter =
                        processedFilter.substring(0, ifMatch.index) +
                        replacement +
                        processedFilter.substring(closeParen + 1);
                    ifChanged = true;
                }
            }
        }
    }

    // Normalize unprefixed d2 functions by adding d2: prefix
    // This handles filters like contains(...) and converts them to d2:contains(...)
    // Use negative lookbehind to avoid matching functions already prefixed with d2:
    const d2FunctionNames = [
        "hasValue",
        "contains",
        "condition",
        "daysBetween",
        "weeksBetween",
        "monthsBetween",
        "yearsBetween",
        "count",
        "countIfValue",
        "countIfZeroPos",
        "left",
        "right",
        "substring",
        "split",
        "length",
        "floor",
        "ceil",
        "round",
        "modulus",
    ];
    // Negative lookbehind (?<!d2:) ensures we don't match if already prefixed with d2:
    const functionPattern = new RegExp(
        `(?<!d2:)\\b(${d2FunctionNames.join("|")})\\s*\\(`,
        "g",
    );
    processedFilter = processedFilter.replace(functionPattern, "d2:$1(");

    // Define d2 functions inline
    const d2Functions: Record<string, (...args: any[]) => any> = {
        hasValue: (varName: string): boolean => {
            const val = variableValues[varName];
            return val !== null && val !== undefined && val !== "";
        },

        contains: (text: string, substring: string): boolean => {
            if (text === null || text === undefined) return false;
            return String(text).includes(String(substring));
        },

        condition: (
            condition: string,
            trueValue: any,
            falseValue: any,
        ): any => {
            return condition ? trueValue : falseValue;
        },

        daysBetween: (startDate: string, endDate: string): number => {
            if (!startDate || !endDate) return 0;
            const start = dayjs(startDate);
            const end = dayjs(endDate);
            return end.diff(start, "day");
        },

        weeksBetween: (startDate: string, endDate: string): number => {
            if (!startDate || !endDate) return 0;
            const start = dayjs(startDate);
            const end = dayjs(endDate);
            return end.diff(start, "week");
        },

        monthsBetween: (startDate: string, endDate: string): number => {
            if (!startDate || !endDate) return 0;
            const start = dayjs(startDate);
            const end = dayjs(endDate);
            return end.diff(start, "month");
        },

        yearsBetween: (startDate: string, endDate: string): number => {
            if (!startDate || !endDate) return 0;
            const start = dayjs(startDate);
            const end = dayjs(endDate);
            return end.diff(start, "year");
        },

        count: (varName: string): number => {
            const val = variableValues[varName];
            if (val === null || val === undefined || val === "") return 0;
            return 1;
        },

        countIfValue: (varName: string, valueToCompare: any): number => {
            const val = variableValues[varName];
            return val === valueToCompare ? 1 : 0;
        },

        countIfZeroPos: (varName: string): number => {
            const val = variableValues[varName];
            if (val === null || val === undefined || val === "") return 0;
            const numVal = Number(val);
            return !isNaN(numVal) && numVal >= 0 ? 1 : 0;
        },

        left: (text: string, numChars: number): string => {
            if (!text) return "";
            return String(text).substring(0, numChars);
        },

        right: (text: string, numChars: number): string => {
            if (!text) return "";
            const str = String(text);
            return str.substring(str.length - numChars);
        },

        substring: (text: string, startIdx: number, endIdx: number): string => {
            if (!text) return "";
            return String(text).substring(startIdx, endIdx);
        },

        split: (
            text: string,
            delimiter: string,
            index: number,
        ): string | null => {
            if (!text) return null;
            const parts = String(text).split(delimiter);
            return parts[index] ?? null;
        },

        length: (text: string): number => {
            if (!text) return 0;
            return String(text).length;
        },

        floor: (num: number): number => {
            return Math.floor(Number(num));
        },

        ceil: (num: number): number => {
            return Math.ceil(Number(num));
        },

        round: (num: number): number => {
            return Math.round(Number(num));
        },

        modulus: (dividend: number, divisor: number): number => {
            return Number(dividend) % Number(divisor);
        },
    };

    // Process d2: functions (up to 10 iterations to handle nested functions)
    let maxIterations = 10;
    while (processedFilter.includes("d2:") && maxIterations-- > 0) {
        const d2Match = processedFilter.match(/d2:(\w+)\s*\(/);
        if (!d2Match) {
            break;
        }

        const funcName = d2Match[1];
        const startPos = d2Match.index!;
        const openParenPos = startPos + d2Match[0].length - 1;
        const closeParenPos = findClosingParen(
            processedFilter,
            openParenPos + 1,
        );

        if (closeParenPos === -1) {
            break;
        }

        const argsStr = processedFilter.substring(
            openParenPos + 1,
            closeParenPos,
        );
        const args = argsStr.split(",");

        const processedArgs = args
            .map((arg: string) => {
                arg = arg.trim();

                // Functions that need variable name instead of value
                const needsVarName = [
                    "hasValue",
                    "count",
                    "countIfValue",
                    "countIfZeroPos",
                ].includes(funcName);

                // Handle variable references #{varName}, A{attributeName}, V{systemVar}, or bare {varName}
                const varMatch = arg.match(/^[#AV]?\{([^}]+)\}$/);
                if (varMatch) {
                    let varName = varMatch[1];

                    // Handle compound references like programStageId.dataElementId
                    // Extract just the dataElementId part for lookup
                    if (varName.includes(".")) {
                        const parts = varName.split(".");
                        varName = parts[parts.length - 1]; // Get the last part (dataElementId)
                    }

                    if (needsVarName) {
                        return `'${varName}'`;
                    } else {
                        // Get the raw value and wrap it properly
                        const val = variableValues[varName];
                        if (val === null || val === undefined) return "null";
                        if (typeof val === "number") return String(val);
                        if (typeof val === "boolean") return String(val);
                        // For strings, escape and quote
                        return `'${String(val).replace(/'/g, "\\'")}'`;
                    }
                }
                return arg;
            })
            .join(", ");

        const func = d2Functions[funcName];
        if (typeof func === "function") {
            try {
                // Replace d2:functionName(...) with d2Functions.functionName(...)
                // This creates valid JavaScript that can be evaluated with the d2Functions object
                const replacement = `d2Functions.${funcName}(${processedArgs})`;
                processedFilter =
                    processedFilter.substring(0, startPos) +
                    replacement +
                    processedFilter.substring(closeParenPos + 1);
            } catch (e) {
                console.error(
                    `Error evaluating d2:${funcName}(${processedArgs}):`,
                    e,
                );
                break;
            }
        } else {
            break;
        }
    }

    // Replace variable references with actual values (including bare {varName} with missing prefix)
    processedFilter = processedFilter.replace(
        /[#AV]?\{([^}]+)\}/g,
        (match, varName) => {
            // Handle compound references like programStageId.dataElementId
            // Extract just the dataElementId part for lookup
            let lookupKey = varName;
            if (varName.includes(".")) {
                const parts = varName.split(".");
                lookupKey = parts[parts.length - 1]; // Get the last part (dataElementId)
            }

            const val = variableValues[lookupKey];
            if (val === null || val === undefined) return "null";
            if (typeof val === "number") return String(val);
            if (typeof val === "boolean") return String(val);
            return `'${String(val).replace(/'/g, "\\'")}'`;
        },
    );

    // Normalize comparison operators (= to ===, != to !==)
    // Split by quotes to avoid replacing inside string literals
    let parts = processedFilter.split("'");
    for (let i = 0; i < parts.length; i += 2) {
        const before = parts[i];
        parts[i] = parts[i]
            .replace(/!=/g, "!==")
            .replace(/([^!<>=])={2}(?!=)/g, "$1===")
            .replace(/([^!<>=])=(?!=)/g, "$1===");
    }
    const normalizedFilter = parts.join("'");

    // Fix unterminated string literals (e.g. 'Negative without closing quote)
    let balancedFilter = normalizedFilter;
    let inStr = false;
    let strCh = "";
    for (let i = 0; i < balancedFilter.length; i++) {
        const c = balancedFilter[i];
        if (inStr) {
            if (c === "\\" && i + 1 < balancedFilter.length) {
                i++;
                continue;
            }
            if (c === strCh) inStr = false;
        } else if (c === "'" || c === '"') {
            inStr = true;
            strCh = c;
        }
    }
    if (inStr) {
        balancedFilter += strCh;
    }

    // Balance unmatched parentheses (handles malformed indicator definitions)
    // Must be string-aware to avoid counting parens inside string literals
    let openCount = 0;
    let inStr2 = false;
    let strCh2 = "";
    for (let i = 0; i < balancedFilter.length; i++) {
        const c = balancedFilter[i];
        if (inStr2) {
            if (c === "\\" && i + 1 < balancedFilter.length) {
                i++;
                continue;
            }
            if (c === strCh2) inStr2 = false;
            continue;
        }
        if (c === "'" || c === '"') {
            inStr2 = true;
            strCh2 = c;
            continue;
        }
        if (c === "(") openCount++;
        else if (c === ")") openCount--;
    }
    if (openCount > 0) {
        balancedFilter += ")".repeat(openCount);
    } else if (openCount < 0) {
        balancedFilter = "(".repeat(-openCount) + balancedFilter;
    }

    // Evaluate the final boolean expression
    try {
        const func = new Function(
            "d2Functions",
            "variableValues",
            `return (${balancedFilter})`,
        );
        const value = func(d2Functions, variableValues);
        return value;
    } catch (e) {
        console.error(`Error evaluating filter "${filter}":`, e);
        console.error(`Processed filter at error:`, normalizedFilter);
        return false;
    }
}

/**
 * Evaluate all program indicators for a single event
 * Returns an object mapping indicator IDs to 1 (only indicators where filter passed)
 *
 * @param event - The event to evaluate
 * @param indicators - Array of program indicators to evaluate
 * @param trackedEntityOrAttributes - Either a FlattenedTrackedEntity or a plain attributes object
 */
export function evaluateProgramIndicatorsForEvent(
    event: FlattenedEvent,
    indicators: ProgramIndicator[],
    trackedEntityOrAttributes?: FlattenedTrackedEntity | Record<string, any>,
): Record<string, 1> {
    // Only process events with synced or pending status
    if (event.syncStatus !== "synced" && event.syncStatus !== "pending") {
        return {};
    }

    const variableValues = buildIndicatorVariables(
        event,
        trackedEntityOrAttributes,
    );
    const results: Record<string, 1> = {};

    for (const indicator of indicators) {
        try {
            const matches = evaluateFilter(indicator.filter, variableValues);
            // Only store if filter evaluates to true
            if (matches) {
                results[indicator.id] = 1;
            }
        } catch (e) {
            console.error(
                `Error evaluating indicator ${indicator.id} (${indicator.name}):`,
                e,
            );
            // Don't store anything on error (filter failed)
        }
    }

    return results;
}

/**
 * Batch evaluate program indicators for multiple events
 * Returns a map of event IDs to their indicator results (only indicators where filter passed)
 *
 * @param events - Array of events to evaluate
 * @param indicators - Array of program indicators to evaluate
 * @param trackedEntitiesByEvent - Map of event IDs to their FlattenedTrackedEntity or attributes
 */
export function evaluateProgramIndicatorsForEvents(
    events: FlattenedEvent[],
    indicators: ProgramIndicator[],
    trackedEntitiesByEvent?: Map<
        string,
        FlattenedTrackedEntity | Record<string, any>
    >,
): Map<string, Record<string, 1>> {
    const results = new Map<string, Record<string, 1>>();

    for (const event of events) {
        const trackedEntityOrAttributes = trackedEntitiesByEvent?.get(
            event.event,
        );
        const indicatorResults = evaluateProgramIndicatorsForEvent(
            event,
            indicators,
            trackedEntityOrAttributes,
        );
        results.set(event.event, indicatorResults);
    }

    return results;
}

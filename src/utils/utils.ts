import { FormItemProps, TableProps } from "antd";
import dayjs from "dayjs";
import { isEmpty } from "lodash";
import {
    Enrollment,
    Event,
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    Program,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
    ProgramStage,
    ProgramTrackedEntityAttribute,
    SyncStatus,
    TrackedEntity,
    TrackedEntityResponse,
} from "../schemas";
import { generateUid } from "./id";
import { zScoreWFA, zScoreHFA, zScoreWFH, zScoreBMIFA } from "./who-zscore";

const GRID_TOTAL = 24;

export const flattenTrackedEntityResponse = (te: TrackedEntityResponse) => {
    return te.trackedEntities.map((trackedEntity) => {
        return flattenTrackedEntity(trackedEntity);
    });
};

export const flattenEnrollment = ({
    attributes,
    events,
    ...otherDetails
}: Enrollment): FlattenedEnrollment => {
    const enrollmentAttrs: Record<string, any> = attributes.reduce(
        (acc, attr) => {
            acc[attr.attribute] = attr.value;
            return acc;
        },
        {},
    );
    return {
        ...otherDetails,
        syncStatus: "synced",
        version: 1,
        lastSynced: new Date().toISOString(),
        syncError: "",
        attributes: enrollmentAttrs,
    };
};

export const flattenEvent = ({
    dataValues,
    occurredAt,
    ...otherEventDetails
}: Event): FlattenedEvent => {
    const eventAttrs: Record<string, string> = [
        ...dataValues,
        { dataElement: "occurredAt", value: occurredAt },
    ].reduce((acc, dv) => {
        acc[dv.dataElement] = dv.value;
        return acc;
    }, {});
    return {
        ...otherEventDetails,
        dataValues: eventAttrs,
        syncStatus: "synced",
        version: 1,
        lastSynced: new Date().toISOString(),
        syncError: "",
        parentEvent: eventAttrs["Wx7x4sMAa62"],
        occurredAt,
    };
};

export const flattenTrackedEntity = ({
    attributes,
    enrollments,
    ...rest
}: TrackedEntity): FlattenedTrackedEntity => {
    const trackedEntityAttributes = attributes.reduce((acc, attr) => {
        acc[attr.attribute] = attr.value;
        return acc;
    }, {});

    return {
        ...rest,
        syncStatus: "synced",
        version: 1,
        lastSynced: new Date().toISOString(),
        syncError: "",
        parentEntity: trackedEntityAttributes["FhyNxUVOpjh"],
        attributes: trackedEntityAttributes,
    };
};

export const getAttributes = (attributes: ProgramTrackedEntityAttribute[]) => {
    const columns: TableProps<FlattenedTrackedEntity>["columns"] =
        attributes.flatMap(({ trackedEntityAttribute, ...rest }) => {
            if (!rest.displayInList) {
                return [];
            }
            return {
                title:
                    trackedEntityAttribute.displayFormName ||
                    trackedEntityAttribute.name,
                dataIndex: ["attributes", trackedEntityAttribute.id],
                key: trackedEntityAttribute.id,
            };
        });

    return columns;
};

export function executeProgramRules({
    programRules,
    programRuleVariables,
    dataValues,
    attributeValues = {},
    program,
    programStage,
    previousEvents = [],
}: {
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    dataValues?: Record<string, any>;
    attributeValues?: Record<string, any>;
    programStage?: string;
    program: string;
    previousEvents?: Array<{ dataValues: Record<string, any> }>;
}): ProgramRuleResult {
    const variableValues: Record<string, any> = {};
    variableValues["current_date"] = dayjs().format("YYYY-MM-DD");
    variableValues["event_date"] = dataValues?.occurredAt;
    variableValues["enrollment_date"] = attributeValues?.enrolledAt;
    variableValues["event_count"] = 1;
    for (const variable of programRuleVariables) {
        let value: any = null;
        if (
            variable.programRuleVariableSourceType ===
            "DATAELEMENT_PREVIOUS_EVENT"
        ) {
            if (variable.dataElement && previousEvents.length > 0) {
                const prevEvent = previousEvents[previousEvents.length - 1];
                value = prevEvent.dataValues[variable.dataElement.id] ?? null;
            }
        } else if (
            variable.dataElement &&
            dataValues?.hasOwnProperty(variable.dataElement.id)
        ) {
            value = dataValues[variable.dataElement.id];
        } else if (
            variable.trackedEntityAttribute &&
            attributeValues?.hasOwnProperty(variable.trackedEntityAttribute.id)
        ) {
            value = attributeValues[variable.trackedEntityAttribute.id];
        }
        variableValues[variable.name] = value ?? null;
    }
    const d2Functions = {
        hasValue: (varName: string): boolean => {
            const val = variableValues[varName];
            return val !== null && val !== undefined && val !== "";
        },

        contains: (text: string, substring: string): boolean => {
            if (text === null || text === undefined) return false;
            return String(text).includes(String(substring));
        },

        startsWith: (text: string, prefix: string): boolean => {
            if (text === null || text === undefined) return false;
            return String(text).startsWith(String(prefix));
        },

        endsWith: (text: string, suffix: string): boolean => {
            if (text === null || text === undefined) return false;
            return String(text).endsWith(String(suffix));
        },

        countIfValue: (varName: string, valueToCompare: any): number => {
            const val = variableValues[varName];
            return val === valueToCompare ? 1 : 0;
        },

        countIfZeroPos: (varName: string): number => {
            const val = variableValues[varName];
            const num = Number(val);
            return !isNaN(num) && num >= 0 ? 1 : 0;
        },

        validatePattern: (value: string, pattern: string): boolean => {
            try {
                const anchoredPattern =
                    pattern.startsWith("^") && pattern.endsWith("$")
                        ? pattern
                        : `^${pattern}$`;

                const regex = new RegExp(anchoredPattern);
                const test = regex.test(String(value));
                return test;
            } catch {
                return false;
            }
        },

        left: (text: string, numChars: number): string => {
            return String(text).substring(0, numChars);
        },

        right: (text: string, numChars: number): string => {
            const str = String(text);
            return str.substring(str.length - numChars);
        },

        substring: (text: string, start: number, end: number): string => {
            return String(text).substring(start, end);
        },

        split: (text: string, delimiter: string, index: number): string => {
            const parts = String(text).split(delimiter);
            return parts[index] || "";
        },

        length: (text: string): number => {
            return String(text).length;
        },

        concatenate: (...args: any[]): string => {
            return args.map((a) => String(a)).join("");
        },

        daysBetween: (date1: string, date2: string): number => {
            const d1 = dayjs(date1);
            const d2 = dayjs(date2);
            return d2.diff(d1, "days");
        },

        weeksBetween: (date1: string, date2: string): number => {
            const d1 = dayjs(date1);
            const d2 = dayjs(date2);
            return d2.diff(d1, "weeks");
        },

        monthsBetween: (date1: string, date2: string): number => {
            const d1 = dayjs(date1);
            const d2 = dayjs(date2);
            return d2.diff(d1, "months");
        },

        yearsBetween: (date1: string, date2: string): number => {
            const d1 = dayjs(date1);
            const d2 = dayjs(date2);
            return d2.diff(d1, "years");
        },

        addDays: (date: string, days: number): string => {
            const d = dayjs(date);
            return d.add(days, "days").format("YYYY-MM-DD");
        },

        floor: (value: number): number => {
            return Math.floor(Number(value));
        },

        ceil: (value: number): number => {
            return Math.ceil(Number(value));
        },

        round: (value: number, decimals?: number): number => {
            const num = Number(value);
            if (decimals === undefined || decimals === 0) {
                return Math.round(num);
            }
            const multiplier = Math.pow(10, decimals);
            return Math.round(num * multiplier) / multiplier;
        },

        modulus: (dividend: number, divisor: number): number => {
            return Number(dividend) % Number(divisor);
        },

        zing: (value: number): number => {
            return Math.max(0, Number(value));
        },

        oizp: (value: number): number => {
            return Number(value) >= 0 ? 1 : 0;
        },

        zpvc: (...values: number[]): number => {
            let sum = 0;
            for (const val of values) {
                const num = Number(val);
                if (!isNaN(num) && num > 0) {
                    sum += num;
                }
            }
            return sum;
        },

        condition: (
            condition: boolean,
            trueValue: any,
            falseValue: any,
        ): any => {
            return condition ? trueValue : falseValue;
        },

        count: (varName: string): number => {
            const val = variableValues[varName];
            if (val === null || val === undefined || val === "") return 0;
            return 1;
        },

        countIfCondition: (condition: boolean): number => {
            return condition ? 1 : 0;
        },

        hasDataValue: (dataElementId: string): boolean => {
            return (
                (!isEmpty(dataValues) &&
                    dataValues.hasOwnProperty(dataElementId) &&
                    dataValues[dataElementId] !== null &&
                    dataValues[dataElementId] !== undefined &&
                    dataValues[dataElementId] !== "") ||
                (!isEmpty(attributeValues) &&
                    attributeValues.hasOwnProperty(dataElementId) &&
                    attributeValues[dataElementId] !== null &&
                    attributeValues[dataElementId] !== undefined &&
                    attributeValues[dataElementId] !== "")
            );
        },

        inOrgUnitGroup: (groupId: string): boolean => {
            return false;
        },

        // WHO Z-Score Functions
        zScoreWFA: (
            ageMonths: number,
            weightKg: number,
            sex: any,
        ): number | null => {
            return zScoreWFA(ageMonths, weightKg, sex);
        },

        zScoreHFA: (
            ageMonths: number,
            heightCm: number,
            sex: any,
        ): number | null => {
            return zScoreHFA(ageMonths, heightCm, sex);
        },

        zScoreWFH: (
            heightCm: number,
            weightKg: number,
            sex: any,
        ): number | null => {
            return zScoreWFH(heightCm, weightKg, sex);
        },

        zScoreBMIFA: (
            ageMonths: number,
            bmi: number,
            sex: any,
        ): number | null => {
            return zScoreBMIFA(ageMonths, bmi, sex);
        },
    };

    const getFormattedValue = (
        name: string,
        skipQuotes: boolean = false,
    ): string => {
        const val = variableValues[name];
        if (val === null || val === undefined) {
            return skipQuotes ? "" : "''";
        }
        if (typeof val === "boolean") {
            return String(val);
        }
        if (typeof val === "number") {
            return String(val);
        }
        const stringVal = String(val);
        if (skipQuotes) {
            return stringVal;
        }
        const escaped = stringVal.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return `'${escaped}'`;
    };

    const findClosingParen = (str: string, startPos: number): number => {
        let depth = 1;
        for (let i = startPos; i < str.length; i++) {
            if (str[i] === "(") depth++;
            else if (str[i] === ")") {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    };

    const evaluateExpression = (expression: string): any => {
        if (!expression) return null;

        let processedExpression = expression;

        let maxIterations = 10;
        while (processedExpression.includes("d2:") && maxIterations-- > 0) {
            const d2Match = processedExpression.match(/d2:(\w+)\s*\(/);
            if (!d2Match) break;

            const funcName = d2Match[1];
            const startPos = d2Match.index!;
            const openParenPos = startPos + d2Match[0].length - 1;
            const closeParenPos = findClosingParen(
                processedExpression,
                openParenPos + 1,
            );

            if (closeParenPos === -1) {
                console.warn(
                    "Could not find closing parenthesis for",
                    d2Match[0],
                );
                break;
            }

            const fullMatch = processedExpression.substring(
                startPos,
                closeParenPos + 1,
            );
            const argsStr = processedExpression.substring(
                openParenPos + 1,
                closeParenPos,
            );

            const args = argsStr.split(",");

            const processedArgs = args
                .map((arg: string) => {
                    arg = arg.trim();

                    const needsVarName = [
                        "hasValue",
                        "count",
                        "countIfValue",
                        "countIfZeroPos",
                    ].includes(funcName);

                    const varMatch = arg.match(/^[#AV]\{([^}]+)\}$/);
                    if (varMatch) {
                        const varName = varMatch[1];
                        if (needsVarName) {
                            return `'${varName}'`;
                        } else {
                            const val = variableValues[varName];
                            if (val === null || val === undefined)
                                return "null";
                            if (typeof val === "number") return String(val);
                            if (typeof val === "boolean") return String(val);
                            const stringVal = String(val);
                            const escaped = stringVal
                                .replace(/\\/g, "\\\\")
                                .replace(/'/g, "\\'");
                            return `'${escaped}'`;
                        }
                    }

                    if (arg.match(/^['"].*['"]$/)) {
                        return arg;
                    }
                    if (!isNaN(Number(arg)) && arg !== "") {
                        return arg;
                    }
                    if (arg === "true" || arg === "false") {
                        return arg;
                    }
                    return arg;
                })
                .join(", ");

            const replacement = `d2Functions.${funcName}(${processedArgs})`;
            processedExpression =
                processedExpression.substring(0, startPos) +
                replacement +
                processedExpression.substring(closeParenPos + 1);
        }

        processedExpression = processedExpression.replace(
            /#\{([^}]+)\}/g,
            (_, name) => {
                const val = variableValues[name];
                if (val === null || val === undefined) return "null";
                if (typeof val === "number") return String(val);
                return getFormattedValue(name);
            },
        );

        processedExpression = processedExpression.replace(
            /A\{([^}]+)\}/g,
            (_, name) => {
                const val = variableValues[name];
                if (val === null || val === undefined) return "null";
                if (typeof val === "number") return String(val);
                return getFormattedValue(name);
            },
        );

        processedExpression = processedExpression.replace(
            /V\{([^}]+)\}/g,
            (_, name) => {
                const val = variableValues[name];
                if (val === null || val === undefined) return "null";
                if (typeof val === "number") return String(val);
                return getFormattedValue(name);
            },
        );

        try {
            const func = new Function(
                "d2Functions",
                "variableValues",
                `return (${processedExpression})`,
            );
            const value = func(d2Functions, variableValues);
            return value;
        } catch (err) {
            console.warn(
                `Invalid expression: ${expression}`,
                processedExpression,
                err,
            );
            return null;
        }
    };

    const evaluateCondition = (condition: string, log = false): boolean => {
        let processedCondition = condition ?? "";
        let maxIterations = 10;
        while (processedCondition.includes("d2:") && maxIterations-- > 0) {
            const d2Match = processedCondition.match(/d2:(\w+)\s*\(/);
            if (!d2Match) break;

            const funcName = d2Match[1];
            const startPos = d2Match.index!;
            const openParenPos = startPos + d2Match[0].length - 1;
            const closeParenPos = findClosingParen(
                processedCondition,
                openParenPos + 1,
            );

            if (closeParenPos === -1) {
                break;
            }

            const argsStr = processedCondition.substring(
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

                    // Handle variable references #{varName} or A{attributeName} or V{systemVar}
                    const varMatch = arg.match(/^[#AV]\{([^}]+)\}$/);
                    if (varMatch) {
                        const varName = varMatch[1];
                        if (needsVarName) {
                            return `'${varName}'`;
                        } else {
                            // Get the raw value and wrap it properly
                            const val = variableValues[varName];
                            if (val === null || val === undefined)
                                return "null";
                            if (typeof val === "number") return String(val);
                            if (typeof val === "boolean") return String(val);
                            // For strings, escape and quote
                            const stringVal = String(val);
                            // if (log) {
                            // 		console.log(
                            // 				"Variable value for",
                            // 				varName,
                            // 				"is",
                            // 				stringVal,
                            // 		);
                            // }
                            const escaped = stringVal
                                .replace(/\\/g, "\\\\")
                                .replace(/'/g, "\\'");
                            return `'${escaped}'`;
                        }
                    }

                    // If it's already quoted, keep as is
                    if (arg.match(/^['"].*['"]$/)) {
                        return arg;
                    }
                    // If it's a number, keep as is
                    if (!isNaN(Number(arg)) && arg !== "") {
                        return arg;
                    }
                    // If it's a boolean
                    if (arg === "true" || arg === "false") {
                        return arg;
                    }
                    // Otherwise leave as is (might be an expression)
                    return arg;
                })
                .join(", ");

            // Replace this one function call
            const replacement = `d2Functions.${funcName}(${processedArgs})`;
            processedCondition =
                processedCondition.substring(0, startPos) +
                replacement +
                processedCondition.substring(closeParenPos + 1);
        }

        // Replace variable references: #{varName} for data elements
        processedCondition = processedCondition.replace(
            /#\{([^}]+)\}/g,
            (_, name) => {
                return getFormattedValue(name);
            },
        );

        // Replace attribute references: A{attributeName} for tracked entity attributes
        processedCondition = processedCondition.replace(
            /A\{([^}]+)\}/g,
            (_, name) => {
                return getFormattedValue(name);
            },
        );

        // Replace system variable references: V{varName}
        processedCondition = processedCondition.replace(
            /V\{([^}]+)\}/g,
            (_, name) => {
                return getFormattedValue(name);
            },
        );

        try {
            // Normalize comparison operators
            if (!isEmpty(processedCondition)) {
                let parts = processedCondition.split("'");
                for (let i = 0; i < parts.length; i += 2) {
                    parts[i] = parts[i]
                        .replace(/!=/g, "!==")
                        .replace(/([^!<>=])={2}(?!=)/g, "$1===")
                        .replace(/([^!<>=])=(?!=)/g, "$1===");
                }
                const normalizedCond = parts.join("'");
                const func = new Function(
                    "d2Functions",
                    "variableValues",
                    `return (${normalizedCond})`,
                );
                const value = func(d2Functions, variableValues);
                return value;
            }
            return false;
        } catch (err) {
            console.warn(
                `Invalid condition: ${condition}`,
                processedCondition,
                err,
            );
            return false;
        }
    };

    // Step 3: Run through rules and collect actions
    const result: ProgramRuleResult = {
        assignments: {},
        hiddenFields: [],
        shownFields: [],
        errors: [],
        hiddenSections: [],
        shownSections: [],
        hiddenOptions: {},
        shownOptions: {},
        hiddenOptionGroups: {},
        shownOptionGroups: {},
        messages: [],
        warnings: [],
    };

    for (const rule of programRules) {
        // Skip rules for different programs
        if (rule.program && rule.program.id !== program) {
            continue;
        }

        if (programStage === undefined) {
            // console.log(
            //     `Evaluating Rule: ${rule.name} (Program: ${rule.program?.id}, Stage: ${rule.programStage?.id})`,
            // );

            // Filter rules based on context (registration vs event)
            // Registration context: only apply rules without a programStage
            if (rule.programStage) {
                continue;
            }
        } else {
            if (rule.programStage && rule.programStage.id !== programStage) {
                continue;
            }
        }
        let isTrue = evaluateCondition(
            rule.condition,
            rule.id === "aMBmnUCxRce",
        );

        // if (rule.id === "aMBmnUCxRce") {
        //     console.log(
        //         `📋 Rule "${rule.name}": condition="${rule.condition}" → ${isTrue ? "✅ TRUE" : "❌ FALSE"}`,
        //     );
        // }
        if (!isTrue) {
            continue;
        }

        for (const action of rule.programRuleActions) {
            // Determine target type and ID based on action
            const isDataElement = !!action.dataElement;
            const isAttribute = !!action.trackedEntityAttribute;
            const targetId =
                action.dataElement?.id ||
                action.trackedEntityAttribute?.id ||
                "";

            // Skip if target type doesn't match context
            if (programStage === undefined && isDataElement) {
                // Registration context: skip dataElement targets
                continue;
            }
            if (programStage !== undefined && isAttribute) {
                // Event context: skip trackedEntityAttribute targets
                continue;
            }

            switch (action.programRuleActionType) {
                case "ASSIGN":
                    if (targetId && action.data) {
                        // console.log(
                        //     `  📝 ASSIGN: ${targetId} = ${action.data}`,
                        // );
                        const evaluatedValue = evaluateExpression(action.data);
                        // console.log("➡️  Evaluated Value:", evaluatedValue);
                        result.assignments[targetId] = evaluatedValue;
                    }
                    break;

                case "HIDEFIELD":
                    if (targetId) {
                        // console.log(`  🙈 HIDEFIELD: ${targetId}`);
                        if (!result.hiddenFields.includes(targetId)) {
                            result.hiddenFields.push(targetId);
                        }
                        result.assignments[targetId] = "";
                    }
                    break;

                case "SHOWFIELD":
                    if (targetId) {
                        // console.log(`  👁️  SHOWFIELD: ${targetId}`);
                        if (!result.shownFields.includes(targetId)) {
                            result.shownFields.push(targetId);
                        }
                    }
                    break;

                case "HIDESECTION":
                    if (action.programStageSection) {
                        const sectionId = action.programStageSection.id;
                        if (!result.hiddenSections.includes(sectionId)) {
                            result.hiddenSections.push(sectionId);
                        }
                    }
                    break;

                case "SHOWSECTION":
                    if (action.programStageSection) {
                        const sectionId = action.programStageSection.id;
                        if (!result.shownSections.includes(sectionId)) {
                            result.shownSections.push(sectionId);
                        }
                    }
                    break;

                case "HIDEOPTION":
                    if (targetId && action.option) {
                        if (!result.hiddenOptions[targetId]) {
                            result.hiddenOptions[targetId] = [];
                        }
                        if (
                            !result.hiddenOptions[targetId].includes(
                                action.option.id,
                            )
                        ) {
                            result.hiddenOptions[targetId].push(
                                action.option.id,
                            );
                        }
                    }
                    break;

                case "SHOWOPTION":
                    if (targetId && action.option) {
                        if (!result.shownOptions[targetId]) {
                            result.shownOptions[targetId] = [];
                        }
                        if (
                            !result.shownOptions[targetId].includes(
                                action.option.id,
                            )
                        ) {
                            result.shownOptions[targetId].push(
                                action.option.id,
                            );
                        }
                    }
                    break;

                case "HIDEOPTIONGROUP":
                    if (targetId && action.optionGroup) {
                        if (!result.hiddenOptionGroups[targetId]) {
                            result.hiddenOptionGroups[targetId] = [];
                        }
                        if (
                            !result.hiddenOptionGroups[targetId].includes(
                                action.optionGroup.id,
                            )
                        ) {
                            result.hiddenOptionGroups[targetId].push(
                                action.optionGroup.id,
                            );
                        }
                    }

                    break;

                case "SHOWOPTIONGROUP":
                    if (targetId && action.optionGroup) {
                        if (!result.shownOptionGroups[targetId]) {
                            result.shownOptionGroups[targetId] = [];
                        }
                        if (
                            !result.shownOptionGroups[targetId].includes(
                                action.optionGroup.id,
                            )
                        ) {
                            result.shownOptionGroups[targetId].push(
                                action.optionGroup.id,
                            );
                        }
                    }
                    break;

                case "DISPLAYTEXT":
                    if (targetId && action.content) {
                        if (targetId && action.content) {
                            result.messages.push({
                                key: targetId,
                                content: action.content ?? "",
                            });
                        }
                    }
                    break;

                case "ERROR":
                    if (targetId && action.content) {
                        if (targetId && action.content) {
                            result.errors.push({
                                key: targetId,
                                content: action.content ?? "",
                            });
                        }
                    }
                    break;
                case "SHOWERROR":
                    if (targetId && action.content) {
                        if (targetId && action.content) {
                            result.errors.push({
                                key: targetId,
                                content: action.content ?? "",
                            });
                        }
                    }
                    break;

                case "SHOWWARNING":
                    {
                        if (targetId && action.content) {
                            result.warnings.push({
                                key: targetId,
                                content: action.content ?? "",
                            });
                        }
                    }
                    break;
            }
        }
    }

    return result;
}

export const isDate = (valueType: string | undefined) => {
    return ["DATE", "DATETIME", "TIME"].includes(valueType || "");
};

export const isNumber = (valueType: string | undefined) => {
    return [
        "NUMBER",
        "INTEGER",
        "INTEGER_POSITIVE",
        "INTEGER_NEGATIVE",
        "PERCENTAGE",
        "UNIT_INTERVAL",
    ].includes(valueType || "");
};

export const createEmptyTrackedEntity = ({
    orgUnit,
    attributes = {},
    parentEntity,
}: {
    orgUnit: string;
    attributes?: Record<string, any>;
    parentEntity?: string;
}): FlattenedTrackedEntity => {
    const trackedEntity = generateUid();
    return {
        orgUnit,
        attributes,
        trackedEntityType: "QG9qZrGHLzV",
        createdAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        updatedAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        deleted: false,
        inactive: false,
        potentialDuplicate: false,
        trackedEntity,
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
        parentEntity,
    };
};

export const createEmptyEnrollment = ({
    orgUnit,
    trackedEntity,
    attributes = {},
}: {
    orgUnit: string;
    trackedEntity: string;
    attributes?: Record<string, string>;
}): FlattenedEnrollment => {
    return {
        createdAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        program: "ueBhWkWll5v",
        deleted: false,
        orgUnit,
        trackedEntity,
        enrollment: generateUid(),
        enrolledAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        occurredAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        status: "ACTIVE",
        updatedAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        followUp: false,
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
        attributes,
    };
};

export const createEmptyEvent = ({
    orgUnit,
    program,
    trackedEntity,
    enrollment,
    programStage,
    parentEvent,
    dataValues = {},
}: {
    orgUnit: string;
    program: string;
    trackedEntity: string;
    enrollment: string;
    programStage: string;
    parentEvent?: string;
    dataValues?: Record<string, any>;
}): FlattenedEvent => {
    const eventId = generateUid();
    const now = dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
    return {
        event: eventId,
        program,
        programStage,
        orgUnit,
        trackedEntity,
        enrollment,
        dataValues,
        status: "ACTIVE",
        occurredAt: dayjs().format("YYYY-MM-DD"),
        followUp: false,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
        parentEvent,
    };
};

export const createNormalize = (valueType: string | undefined) => {
    const normalize: FormItemProps["normalize"] = (value) => {
        if (valueType === "DATETIME" && dayjs.isDayjs(value)) {
            return value.format("YYYY-MM-DDTHH:mm:ss");
        } else if (valueType === "DATE" && dayjs.isDayjs(value)) {
            return value.format("YYYY-MM-DD");
        } else if (valueType === "TIME" && dayjs.isDayjs(value)) {
            return value.format("HH:mm:ss");
        } else if (valueType === "AGE" && dayjs.isDayjs(value)) {
            return value.format("YYYY-MM-DD");
        } else if (value && valueType === "MULTI_TEXT") {
            return Array.isArray(value) ? value.join(",") : value;
        }
        return value;
    };
    return normalize;
};
export const createGetValueProps = (valueType: string | undefined) => {
    const getValueProps: FormItemProps["getValueProps"] = (value) => {
        if (isDate(valueType)) {
            return {
                value: value ? dayjs(value) : null,
            };
        }
        if (valueType === "AGE") {
            return {
                value: value ? dayjs(value) : null,
            };
        }
        if (valueType === "MULTI_TEXT") {
            if (typeof value === "string") {
                return {
                    value: value ? value.split(",").filter(Boolean) : [],
                };
            }
            if (Array.isArray(value)) {
                return { value };
            }
            return { value: [] };
        }
        return { value };
    };
    return getValueProps;
};

export const createEmptyProgramRuleResult = (): ProgramRuleResult => {
    return {
        assignments: {},
        hiddenFields: [],
        shownFields: [],
        hiddenSections: [],
        shownSections: [],
        messages: [],
        warnings: [],
        errors: [],
        hiddenOptions: {},
        shownOptions: {},
        hiddenOptionGroups: {},
        shownOptionGroups: {},
    };
};

export function calculateColSpan(
    fieldCount: number,
    preferredColSpan: number,
): number {
    if (fieldCount <= 0) return preferredColSpan;
    const maxColsByPreference = GRID_TOTAL / preferredColSpan;
    const actualCols = Math.min(fieldCount, maxColsByPreference);
    return Math.floor(GRID_TOTAL / actualCols);
}

export const spans = new Map<string, number>([
    ["XjgpfkoxffK", 5],
    ["W87HAtUHJjB", 5],
    ["PKuyTiVCR89", 5],
    ["oTI0DLitzFY", 9],
]);

export function buildCurrentDataElements(programStage: ProgramStage) {
    return new Map(
        programStage.programStageDataElements.map((psde) => [
            psde.dataElement.id,
            {
                allowFutureDate: psde.allowFutureDate,
                renderOptionsAsRadio: psde.renderType !== undefined,
                compulsory: psde.compulsory,
                desktopRenderType: psde.renderType?.DESKTOP?.type,
            },
        ]),
    );
}

export function buildCurrentAttributes(program: Program) {
    return new Map(
        program.programTrackedEntityAttributes.map((ptea) => [
            ptea.trackedEntityAttribute.id,
            {
                allowFutureDate: ptea.allowFutureDate,
                renderOptionsAsRadio: ptea.renderType !== undefined,
                compulsory: ptea.mandatory,
                desktopRenderType: ptea.renderType?.DESKTOP?.type,
            },
        ]),
    );
}

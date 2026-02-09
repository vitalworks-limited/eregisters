import { FormItemProps, TableProps } from "antd";
import dayjs from "dayjs";
import { isEmpty } from "lodash";
import {
    FlattenedRelationship,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
    ProgramTrackedEntityAttribute,
    TrackedEntity,
    TrackedEntityResponse,
} from "../schemas";
import { generateUid } from "./id";

const GRID_TOTAL = 24;

export const flattenTrackedEntityResponse = (te: TrackedEntityResponse) => {
    return te.trackedEntities.map((trackedEntity) => {
        return flattenTrackedEntity(trackedEntity);
    });
};

export const flattenTrackedEntity = ({
    trackedEntity,
    attributes,
    enrollments,
    relationships,
    ...rest
}: TrackedEntity) => {
    const trackedEntityAttributes = (attributes || []).reduce((acc, attr) => {
        acc[attr.attribute] = attr.value;
        return acc;
    }, {});

    const [{ events, attributes: eAttributes, ...enrollmentDetails }] =
        enrollments;

    const enrollmentAttrs: Record<string, string> = (eAttributes || []).reduce(
        (acc, attr) => {
            acc[attr.attribute] = attr.value;
            return acc;
        },
        {},
    );
    const flattenedEvents = (events || []).map((event) => {
        const eventAttrs: Record<string, string> = [
            ...event.dataValues,
            { dataElement: "occurredAt", value: event.occurredAt },
        ].reduce((acc, dv) => {
            acc[dv.dataElement] = dv.value;
            return acc;
        }, {});
        return {
            ...event,
            dataValues: eventAttrs,
            syncStatus: "synced",
            version: 1,
            lastSynced: new Date().toISOString(),
            syncError: "",
        };
    });

    const trackedEntityRelationships = relationships.map(
        ({
            from: {
                trackedEntity: { trackedEntity, attributes },
            },
            to: {
                trackedEntity: {
                    attributes: toAttributes,
                    trackedEntity: toTrackedEntity,
                },
            },
            ...rel
        }) => {
            return {
                ...rel,
                syncStatus: "synced",
                version: 1,
                lastSynced: new Date().toISOString(),
                syncError: "",
                from: attributes.reduce((acc, attr) => {
                    acc[attr.attribute] = attr.value;
                    return acc;
                }, {}),
                to: toAttributes.reduce((acc, attr) => {
                    acc[attr.attribute] = attr.value;
                    return acc;
                }, {}),
                toId: toTrackedEntity,
                fromId: trackedEntity,
            };
        },
    );

    const eventRelationships = flattenedEvents.flatMap((ev) =>
        ev.relationships.map(
            ({
                from: {
                    event: { event, dataValues },
                },
                to: {
                    event: { event: toEvent, dataValues: toDataValues },
                },
                ...rel
            }) => {
                return {
                    ...rel,
                    syncStatus: "synced",
                    version: 1,
                    lastSynced: new Date().toISOString(),
                    syncError: "",
                    from: dataValues.reduce((acc, attr) => {
                        acc[attr.dataElement] = attr.value;
                        return acc;
                    }, {}),
                    to: toDataValues.reduce((acc, attr) => {
                        acc[attr.dataElement] = attr.value;
                        return acc;
                    }, {}),
                    toId: toEvent,
                    fromId: event,
                };
            },
        ),
    );

    return {
        ...rest,
        attributes: { ...trackedEntityAttributes, ...enrollmentAttrs },
        enrollment: enrollmentDetails,
        events: flattenedEvents,
        trackedEntity,
        relationships: [...eventRelationships, ...trackedEntityRelationships],
        syncStatus: "synced",
        version: 1,
        lastSynced: new Date().toISOString(),
        syncError: "",
    };
};

export const getAttributes = (attributes: ProgramTrackedEntityAttribute[]) => {
    const columns: TableProps<
        ReturnType<typeof flattenTrackedEntityResponse>[number]
    >["columns"] = attributes.flatMap(({ trackedEntityAttribute, ...rest }) => {
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
}: {
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    dataValues?: Record<string, any>;
    attributeValues?: Record<string, any>;
    programStage?: string;
    program: string;
}): ProgramRuleResult {
    const variableValues: Record<string, any> = {};
    variableValues["current_date"] = dayjs().format("YYYY-MM-DD");
    variableValues["event_date"] = dataValues?.occurredAt;
    variableValues["enrollment_date"] = attributeValues?.enrolledAt;
    variableValues["event_count"] = 1;

    for (const variable of programRuleVariables) {
        let value: any = null;
        if (
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

        // if (value !== null && value !== undefined) {
        //     console.log(
        //         `  📌 Variable "${variable.name}" = ${value} (from ${variable.dataElement ? "dataElement" : "attribute"}: ${variable.dataElement?.id || variable.trackedEntityAttribute?.id})`,
        //     );
        // }
        variableValues[variable.name] = value ?? null;
    }

    // console.log("Variable Values:", variableValues);

    // D2 function implementations
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
                // console.log("Validating pattern:", {
                //     value,
                //     pattern,
                //     anchoredPattern,
                //     regex,
                //     test,
                // });

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
    };

    // Helper function to get and format variable/attribute value
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

    // Helper to find matching closing parenthesis
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

    // Helper to evaluate expressions (for ASSIGN and other actions)
    const evaluateExpression = (expression: string): any => {
        if (!expression) return null;

        // First replace d2: function calls with JavaScript function calls
        let processedExpression = expression;

        // Replace d2:functionName(...) with d2Functions.functionName(...)
        // Process from innermost to outermost by repeatedly replacing
        let maxIterations = 10; // Prevent infinite loops
        while (processedExpression.includes("d2:") && maxIterations-- > 0) {
            // Find the first d2: function call
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

            // Extract the full function call including d2: prefix
            const fullMatch = processedExpression.substring(
                startPos,
                closeParenPos + 1,
            );
            const argsStr = processedExpression.substring(
                openParenPos + 1,
                closeParenPos,
            );

            // Split args carefully (simple comma split works for most cases)
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
            processedExpression =
                processedExpression.substring(0, startPos) +
                replacement +
                processedExpression.substring(closeParenPos + 1);
        }

        // Replace variable references: #{varName} for data elements
        processedExpression = processedExpression.replace(
            /#\{([^}]+)\}/g,
            (_, name) => {
                const val = variableValues[name];
                if (val === null || val === undefined) return "null";
                if (typeof val === "number") return String(val);
                return getFormattedValue(name);
            },
        );

        // Replace attribute references: A{attributeName}
        processedExpression = processedExpression.replace(
            /A\{([^}]+)\}/g,
            (_, name) => {
                const val = variableValues[name];
                if (val === null || val === undefined) return "null";
                if (typeof val === "number") return String(val);
                return getFormattedValue(name);
            },
        );

        // Replace system variable references: V{varName}
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
            // Create function with d2Functions and variableValues in scope
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

    // Step 2: Safely evaluate rule condition with d2 function support
    const evaluateCondition = (condition: string, log = false): boolean => {
        // First replace d2: function calls with JavaScript function calls
        let processedCondition = condition ?? "";

        // Replace d2:functionName(...) with d2Functions.functionName(...)
        // Process from innermost to outermost by repeatedly replacing
        let maxIterations = 10; // Prevent infinite loops
        while (processedCondition.includes("d2:") && maxIterations-- > 0) {
            // Find the first d2: function call
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
        hiddenFields: new Set(),
        shownFields: new Set(),
        errors: [],
        hiddenSections: new Set(),
        shownSections: new Set(),
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
            // Event context: only apply rules for this specific stage or global rules (no programStage)
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
                        result.hiddenFields.add(targetId);
                        result.assignments[targetId] = "";
                    }
                    break;

                case "SHOWFIELD":
                    if (targetId) {
                        // console.log(`  👁️  SHOWFIELD: ${targetId}`);
                        result.shownFields.add(targetId);
                    }
                    break;

                case "HIDESECTION":
                    if (action.programStageSection) {
                        result.hiddenSections.add(
                            action.programStageSection.id,
                        );
                    }
                    break;

                case "SHOWSECTION":
                    if (action.programStageSection) {
                        result.shownSections.add(action.programStageSection.id);
                    }
                    break;

                case "HIDEOPTION":
                    if (targetId && action.option) {
                        if (!result.hiddenOptions[targetId]) {
                            result.hiddenOptions[targetId] = new Set();
                        }
                        result.hiddenOptions[targetId].add(action.option.id);
                    }
                    break;

                case "SHOWOPTION":
                    if (targetId && action.option) {
                        if (!result.shownOptions[targetId]) {
                            result.shownOptions[targetId] = new Set();
                        }
                        result.shownOptions[targetId].add(action.option.id);
                    }
                    break;

                case "HIDEOPTIONGROUP":
                    if (targetId && action.optionGroup) {
                        if (!result.hiddenOptionGroups[targetId]) {
                            result.hiddenOptionGroups[targetId] = new Set();
                        }
                        result.hiddenOptionGroups[targetId].add(
                            action.optionGroup.id,
                        );
                    }

                    break;

                case "SHOWOPTIONGROUP":
                    if (targetId && action.optionGroup) {
                        if (!result.shownOptionGroups[targetId]) {
                            result.shownOptionGroups[targetId] = new Set();
                        }
                        result.shownOptionGroups[targetId].add(
                            action.optionGroup.id,
                        );
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

    // 🐛 DEBUG: Log final rule execution result
    // console.log(`📊 Program Rules Result:`, {
    //     hiddenFields: Array.from(result.hiddenFields),
    //     shownFields: Array.from(result.shownFields),
    //     hiddenSections: Array.from(result.hiddenSections),
    //     assignments: result.assignments,
    //     errors: result.errors.length,
    //     warnings: result.warnings.length,
    // });

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
}: {
    orgUnit: string;
    attributes?: Record<string, any>;
}): ReturnType<typeof flattenTrackedEntity> => {
    const trackedEntity = generateUid();
    return {
        orgUnit,
        attributes,
        enrollment: {
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
        },
        events: [],
        trackedEntityType: "QG9qZrGHLzV",
        createdAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        updatedAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        deleted: false,
        inactive: false,
        createdAtClient: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        potentialDuplicate: false,
        trackedEntity,
        relationships: [],
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
    };
};

export const createRelationship = ({
    from,
    to,
    fromId,
    toId,
    relationshipType,
}: {
    fromId: string;
    toId: string;
    relationshipType: string;
    from: Record<string, any>;
    to: Record<string, any>;
}): FlattenedRelationship => {
    return {
        relationship: generateUid(),
        fromId,
        toId,
        relationshipType,
        from,
        to,
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
        updatedAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        createdAt: dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
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
}) => {
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
        createdAtClient: now,
        updatedAtClient: now,
        relationships: [],
        lastSynced: "",
        syncError: "",
        syncStatus: "draft",
        version: 1,
        parentEvent: parentEvent || undefined,
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
        hiddenFields: new Set(),
        shownFields: new Set(),
        hiddenSections: new Set(),
        shownSections: new Set(),
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

/**
 * Enhanced Error Handling for Sync Operations
 *
 * Provides categorized error types, retry strategies,
 * and user-friendly error messages.
 */

export enum SyncErrorType {
    // Network errors (retryable)
    NETWORK_ERROR = "NETWORK_ERROR",
    TIMEOUT = "TIMEOUT",
    CONNECTION_LOST = "CONNECTION_LOST",

    // Authentication errors (requires user action)
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    TOKEN_EXPIRED = "TOKEN_EXPIRED",

    // Validation errors (requires data fix)
    VALIDATION_ERROR = "VALIDATION_ERROR",
    INVALID_DATA = "INVALID_DATA",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

    // Conflict errors (requires resolution)
    CONFLICT = "CONFLICT",
    VERSION_MISMATCH = "VERSION_MISMATCH",

    // Server errors (retryable with backoff)
    SERVER_ERROR = "SERVER_ERROR",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

    // Data errors (not retryable without fix)
    ENTITY_NOT_FOUND = "ENTITY_NOT_FOUND",
    DUPLICATE_ENTITY = "DUPLICATE_ENTITY",
    REFERENCE_ERROR = "REFERENCE_ERROR",

    // Unknown
    UNKNOWN = "UNKNOWN",
}

export interface SyncError {
    type: SyncErrorType;
    message: string;
    details?: any;
    retryable: boolean;
    requiresUserAction: boolean;
    suggestedAction?: string;
}

export interface RetryConfig {
    maxAttempts: number;
    baseDelay: number; // milliseconds
    maxDelay: number; // milliseconds
    backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
};

/**
 * Categorize error and provide metadata
 */
export function categorizeSyncError(error: any): SyncError {
    // Network errors
    if (
        error.message?.includes("network") ||
        error.message?.includes("fetch failed") ||
        error.name === "NetworkError"
    ) {
        return {
            type: SyncErrorType.NETWORK_ERROR,
            message: "Network connection failed",
            details: error,
            retryable: true,
            requiresUserAction: false,
            suggestedAction: "Check your internet connection and try again",
        };
    }

    if (error.message?.includes("timeout") || error.name === "TimeoutError") {
        return {
            type: SyncErrorType.TIMEOUT,
            message: "Request timed out",
            details: error,
            retryable: true,
            requiresUserAction: false,
            suggestedAction: "The server is slow to respond. Please try again",
        };
    }

    // HTTP status code errors
    const status = error.httpStatusCode || error.status || error.statusCode;

    if (status === 401) {
        return {
            type: SyncErrorType.UNAUTHORIZED,
            message: "Authentication failed",
            details: error,
            retryable: false,
            requiresUserAction: true,
            suggestedAction: "Please log in again",
        };
    }

    if (status === 403) {
        return {
            type: SyncErrorType.FORBIDDEN,
            message: "Access denied",
            details: error,
            retryable: false,
            requiresUserAction: true,
            suggestedAction:
                "You don't have permission to perform this action",
        };
    }

    if (status === 409) {
        return {
            type: SyncErrorType.CONFLICT,
            message: "Data conflict detected",
            details: error,
            retryable: false,
            requiresUserAction: true,
            suggestedAction:
                "The data has been modified by another user. Please refresh and try again",
        };
    }

    if (status === 422 || status === 400) {
        return {
            type: SyncErrorType.VALIDATION_ERROR,
            message: "Data validation failed",
            details: error,
            retryable: false,
            requiresUserAction: true,
            suggestedAction:
                "Please check the data and ensure all required fields are filled correctly",
        };
    }

    if (status === 404) {
        return {
            type: SyncErrorType.ENTITY_NOT_FOUND,
            message: "Entity not found on server",
            details: error,
            retryable: false,
            requiresUserAction: true,
            suggestedAction:
                "The entity may have been deleted. Please refresh the data",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            type: SyncErrorType.SERVER_ERROR,
            message: "Server error occurred",
            details: error,
            retryable: true,
            requiresUserAction: false,
            suggestedAction:
                "The server encountered an error. It will be retried automatically",
        };
    }

    if (status === 503) {
        return {
            type: SyncErrorType.SERVICE_UNAVAILABLE,
            message: "Service temporarily unavailable",
            details: error,
            retryable: true,
            requiresUserAction: false,
            suggestedAction:
                "The service is temporarily unavailable. It will be retried automatically",
        };
    }

    // DHIS2 specific errors
    if (error.message?.includes("ImportReport")) {
        const importErrors = extractDHIS2ImportErrors(error);
        return {
            type: SyncErrorType.VALIDATION_ERROR,
            message: "DHIS2 validation failed",
            details: importErrors,
            retryable: false,
            requiresUserAction: true,
            suggestedAction: `Fix the following issues: ${importErrors.join(", ")}`,
        };
    }

    // Default unknown error
    return {
        type: SyncErrorType.UNKNOWN,
        message: error.message || "Unknown sync error",
        details: error,
        retryable: true,
        requiresUserAction: false,
        suggestedAction: "An unexpected error occurred. Please try again",
    };
}

/**
 * Extract error messages from DHIS2 ImportReport
 */
function extractDHIS2ImportErrors(error: any): string[] {
    const errors: string[] = [];

    try {
        // DHIS2 tracker import reports have various formats
        const response = error.details || error.response || error;

        // Extract validation reports
        if (response.validationReport) {
            const { errorReports = [], warningReports = [] } =
                response.validationReport;

            errorReports.forEach((report: any) => {
                errors.push(report.message || report.errorMessage);
            });

            // Include warnings as they might be blocking
            warningReports.forEach((report: any) => {
                if (report.warningCode === "E1000") {
                    // Critical warning
                    errors.push(report.message || report.warningMessage);
                }
            });
        }

        // Extract bundle reports
        if (response.bundleReport) {
            const { typeReportMap } = response.bundleReport;

            Object.values(typeReportMap || {}).forEach((typeReport: any) => {
                typeReport.objectReports?.forEach((objReport: any) => {
                    objReport.errorReports?.forEach((errReport: any) => {
                        errors.push(errReport.message);
                    });
                });
            });
        }
    } catch (e) {
        console.error("Failed to parse DHIS2 error:", e);
    }

    return errors.length > 0 ? errors : ["Unknown validation error"];
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
    attemptNumber: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
    const delay =
        config.baseDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1);
    return Math.min(delay, config.maxDelay);
}

/**
 * Determine if operation should be retried
 */
export function shouldRetry(
    error: SyncError,
    attemptNumber: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
): boolean {
    // Don't retry if not retryable
    if (!error.retryable) {
        return false;
    }

    // Don't retry if max attempts reached
    if (attemptNumber >= config.maxAttempts) {
        return false;
    }

    // Don't retry if requires user action
    if (error.requiresUserAction) {
        return false;
    }

    return true;
}

/**
 * Format user-friendly error message
 */
export function formatSyncErrorMessage(error: SyncError): string {
    let message = error.message;

    if (error.suggestedAction) {
        message += `\n\n${error.suggestedAction}`;
    }

    if (error.details && typeof error.details === "object") {
        const detailsStr = Array.isArray(error.details)
            ? error.details.join(", ")
            : JSON.stringify(error.details, null, 2);

        if (detailsStr.length < 200) {
            message += `\n\nDetails: ${detailsStr}`;
        }
    }

    return message;
}

/**
 * Create error notification options for Ant Design
 */
export function createErrorNotification(error: SyncError): {
    type: "error" | "warning";
    message: string;
    description: string;
    duration: number;
} {
    const isWarning =
        error.type === SyncErrorType.CONFLICT ||
        error.type === SyncErrorType.VALIDATION_ERROR;

    return {
        type: isWarning ? "warning" : "error",
        message: error.message,
        description: error.suggestedAction || "Please try again",
        duration: error.requiresUserAction ? 0 : 5, // 0 = stay until closed
    };
}

/**
 * Log error with context for debugging
 */
export function logSyncError(
    error: SyncError,
    context: {
        operationType: string;
        entityId: string;
        attemptNumber: number;
    },
): void {
    const logLevel =
        error.type === SyncErrorType.NETWORK_ERROR ||
        error.type === SyncErrorType.TIMEOUT
            ? "warn"
            : "error";

    const logMessage = `[Sync ${logLevel.toUpperCase()}] ${context.operationType} - ${context.entityId}`;
    const logDetails = {
        ...context,
        errorType: error.type,
        message: error.message,
        retryable: error.retryable,
        requiresUserAction: error.requiresUserAction,
        details: error.details,
    };

    if (logLevel === "warn") {
        console.warn(logMessage, logDetails);
    } else {
        console.error(logMessage, logDetails);
    }
}

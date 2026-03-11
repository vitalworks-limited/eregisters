import { message, notification } from "antd";

/**
 * Error Handling Utilities
 *
 * Provides consistent error handling and user feedback throughout the application.
 */

export enum ErrorSeverity {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
    CRITICAL = "critical",
}

export interface AppError {
    code: string;
    message: string;
    severity: ErrorSeverity;
    context?: Record<string, any>;
    originalError?: Error;
    userMessage?: string;
    recoverable: boolean;
}

/**
 * Common error codes
 */
export const ErrorCodes = {
    // Network errors
    NETWORK_ERROR: "NETWORK_ERROR",
    API_ERROR: "API_ERROR",
    TIMEOUT_ERROR: "TIMEOUT_ERROR",

    // Sync errors
    SYNC_FAILED: "SYNC_FAILED",
    SYNC_CONFLICT: "SYNC_CONFLICT",
    SYNC_QUEUE_FULL: "SYNC_QUEUE_FULL",

    // Validation errors
    VALIDATION_ERROR: "VALIDATION_ERROR",
    REQUIRED_FIELD: "REQUIRED_FIELD",
    INVALID_FORMAT: "INVALID_FORMAT",

    // Database errors
    DB_ERROR: "DB_ERROR",
    DB_WRITE_FAILED: "DB_WRITE_FAILED",
    DB_READ_FAILED: "DB_READ_FAILED",

    // Program rules errors
    RULE_EXECUTION_ERROR: "RULE_EXECUTION_ERROR",
    RULE_EXPRESSION_ERROR: "RULE_EXPRESSION_ERROR",

    // Generic errors
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
    NOT_FOUND: "NOT_FOUND",
    UNAUTHORIZED: "UNAUTHORIZED",
} as const;

/**
 * Create an AppError from various error types
 */
export function createAppError(
    code: string,
    message: string,
    options: {
        severity?: ErrorSeverity;
        context?: Record<string, any>;
        originalError?: Error;
        userMessage?: string;
        recoverable?: boolean;
    } = {},
): AppError {
    return {
        code,
        message,
        severity: options.severity || ErrorSeverity.ERROR,
        context: options.context,
        originalError: options.originalError,
        userMessage: options.userMessage || getDefaultUserMessage(code),
        recoverable: options.recoverable ?? isRecoverable(code),
    };
}

/**
 * Get user-friendly message for error code
 */
function getDefaultUserMessage(code: string): string {
    const messages: Record<string, string> = {
        [ErrorCodes.NETWORK_ERROR]: "Network connection lost. Please check your internet connection.",
        [ErrorCodes.API_ERROR]: "Failed to communicate with server. Please try again.",
        [ErrorCodes.TIMEOUT_ERROR]: "Request timed out. Please try again.",
        [ErrorCodes.SYNC_FAILED]: "Failed to sync data. Your changes are saved locally and will be synced when connection is restored.",
        [ErrorCodes.SYNC_CONFLICT]: "Data conflict detected. Please review and resolve.",
        [ErrorCodes.VALIDATION_ERROR]: "Please check your input and try again.",
        [ErrorCodes.REQUIRED_FIELD]: "Please fill in all required fields.",
        [ErrorCodes.DB_ERROR]: "Database error occurred. Your data may not have been saved.",
        [ErrorCodes.RULE_EXECUTION_ERROR]: "Error calculating field values. Please check your input.",
        [ErrorCodes.UNKNOWN_ERROR]: "An unexpected error occurred. Please try again.",
        [ErrorCodes.UNAUTHORIZED]: "You don't have permission to perform this action.",
    };

    return messages[code] || "An error occurred. Please try again.";
}

/**
 * Determine if error is recoverable
 */
function isRecoverable(code: string): boolean {
    const recoverableErrors: string[] = [
        ErrorCodes.NETWORK_ERROR,
        ErrorCodes.TIMEOUT_ERROR,
        ErrorCodes.SYNC_FAILED,
        ErrorCodes.VALIDATION_ERROR,
        ErrorCodes.REQUIRED_FIELD,
    ];

    return recoverableErrors.includes(code);
}

/**
 * Handle error with appropriate user feedback
 */
export function handleError(error: AppError | Error | unknown): void {
    let appError: AppError;

    // Convert to AppError if needed
    if (error instanceof Error) {
        appError = createAppError(
            ErrorCodes.UNKNOWN_ERROR,
            error.message,
            {
                originalError: error,
                severity: ErrorSeverity.ERROR,
            },
        );
    } else if (typeof error === "object" && error !== null && "code" in error) {
        appError = error as AppError;
    } else {
        appError = createAppError(
            ErrorCodes.UNKNOWN_ERROR,
            String(error),
            {
                severity: ErrorSeverity.ERROR,
            },
        );
    }

    // Log to console
        message: appError.message,
        userMessage: appError.userMessage,
        context: appError.context,
        originalError: appError.originalError,
    });

    // Show user feedback based on severity
    switch (appError.severity) {
        case ErrorSeverity.INFO:
            message.info(appError.userMessage);
            break;

        case ErrorSeverity.WARNING:
            message.warning(appError.userMessage);
            break;

        case ErrorSeverity.ERROR:
            if (appError.recoverable) {
                message.error(appError.userMessage);
            } else {
                notification.error({
                    message: "Error",
                    description: appError.userMessage,
                    duration: 6,
                });
            }
            break;

        case ErrorSeverity.CRITICAL:
            notification.error({
                message: "Critical Error",
                description: appError.userMessage,
                duration: 0, // Don't auto-close
            });
            break;
    }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    errorMessage?: string,
): T {
    return (async (...args: any[]) => {
        try {
            return await fn(...args);
        } catch (error) {
            const appError = createAppError(
                ErrorCodes.UNKNOWN_ERROR,
                errorMessage || "Operation failed",
                {
                    originalError: error as Error,
                },
            );
            handleError(appError);
            throw error; // Re-throw for caller to handle if needed
        }
    }) as T;
}

/**
 * Safe promise execution with error handling
 */
export async function safeExecute<T>(
    promise: Promise<T>,
    errorCode: string = ErrorCodes.UNKNOWN_ERROR,
    context?: Record<string, any>,
): Promise<{ success: boolean; data?: T; error?: AppError }> {
    try {
        const data = await promise;
        return { success: true, data };
    } catch (error) {
        const appError = createAppError(
            errorCode,
            error instanceof Error ? error.message : String(error),
            {
                originalError: error as Error,
                context,
            },
        );
        handleError(appError);
        return { success: false, error: appError };
    }
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        initialDelay?: number;
        maxDelay?: number;
        shouldRetry?: (error: any) => boolean;
    } = {},
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        shouldRetry = () => true,
    } = options;

    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry if this is the last attempt or error shouldn't be retried
            if (attempt === maxRetries || !shouldRetry(error)) {
                throw error;
            }

            // Wait with exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, maxDelay);

                `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
            );
        }
    }

    throw lastError;
}

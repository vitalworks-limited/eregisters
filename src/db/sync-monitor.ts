import { db } from "./index";
import Dexie from "dexie";

/**
 * Sync Health Monitor
 *
 * Provides real-time monitoring and health checks for the sync system:
 * 1. Track sync queue depth and backlog
 * 2. Monitor sync success/failure rates
 * 3. Detect sync performance degradation
 * 4. Alert on sync errors and failures
 */

export interface SyncHealth {
    status: "healthy" | "degraded" | "critical";
    metrics: {
        pendingCount: number;
        failedCount: number;
        syncedCount: number;
        queueDepth: number;
        successRate: number;
        averageSyncTime: number;
        lastSyncAt: string | null;
    };
    issues: string[];
    recommendations: string[];
}

export interface SyncMetrics {
    entities: {
        total: number;
        draft: number;
        pending: number;
        synced: number;
        failed: number;
        deleted: number;
    };
    events: {
        total: number;
        draft: number;
        pending: number;
        synced: number;
        failed: number;
        deleted: number;
    };
    enrollments: {
        total: number;
        draft: number;
        pending: number;
        synced: number;
        failed: number;
        deleted: number;
    };
}

class SyncMonitor {
    private healthCheckInterval: number | null = null;
    private metrics: Map<
        string,
        { timestamp: number; duration: number; success: boolean }
    > = new Map();

    /**
     * Get comprehensive sync health status
     */
    async getHealth(): Promise<SyncHealth> {
        const metrics = await this.getMetrics();
        const syncState = await db.syncState.get("current");

        const pendingCount =
            metrics.entities.pending +
            metrics.events.pending +
            metrics.enrollments.pending;

        const failedCount =
            metrics.entities.failed +
            metrics.events.failed +
            metrics.enrollments.failed;

        const syncedCount =
            metrics.entities.synced +
            metrics.events.synced +
            metrics.enrollments.synced;

        const totalOperations = syncedCount + failedCount;
        const successRate =
            totalOperations > 0 ? (syncedCount / totalOperations) * 100 : 100;

        const issues: string[] = [];
        const recommendations: string[] = [];

        // Determine health status
        let status: "healthy" | "degraded" | "critical" = "healthy";

        // Check for critical issues
        if (failedCount > 50) {
            status = "critical";
            issues.push(
                `High number of failed sync operations: ${failedCount}`,
            );
            recommendations.push("Review sync errors and retry failed items");
        } else if (failedCount > 20) {
            status = "degraded";
            issues.push(`Elevated sync failures: ${failedCount}`);
        }

        if (pendingCount > 100) {
            status = status === "critical" ? "critical" : "degraded";
            issues.push(`Large sync backlog: ${pendingCount} items pending`);
            recommendations.push(
                "Consider running manual batch sync to clear backlog",
            );
        }

        if (successRate < 80) {
            status = "critical";
            issues.push(`Low sync success rate: ${successRate.toFixed(1)}%`);
            recommendations.push("Investigate network connectivity and API errors");
        } else if (successRate < 95) {
            status = status === "critical" ? "critical" : "degraded";
            issues.push(`Success rate below threshold: ${successRate.toFixed(1)}%`);
        }

        // Check last sync time
        const lastSyncAt = syncState?.lastSyncAt || null;
        if (lastSyncAt) {
            const timeSinceSync =
                Date.now() - new Date(lastSyncAt).getTime();
            const hoursSinceSync = timeSinceSync / (1000 * 60 * 60);

            if (hoursSinceSync > 24 && pendingCount > 0) {
                status = status === "critical" ? "critical" : "degraded";
                issues.push(
                    `No sync in ${hoursSinceSync.toFixed(0)} hours with pending items`,
                );
                recommendations.push(
                    "Trigger manual sync or check network connectivity",
                );
            }
        }

        return {
            status,
            metrics: {
                pendingCount,
                failedCount,
                syncedCount,
                queueDepth: await db.getPendingSyncCount(),
                successRate: Math.round(successRate * 100) / 100,
                averageSyncTime: this.getAverageSyncTime(),
                lastSyncAt,
            },
            issues,
            recommendations,
        };
    }

    /**
     * Get detailed sync metrics for all entity types
     */
    async getMetrics(): Promise<SyncMetrics> {
        // Access Dexie tables directly
        const dexieDb = new Dexie("MOHRegisterDB");
        await dexieDb.open();

        // Get tracked entities metrics
        const entities = await this.getEntityMetrics("trackedEntities", dexieDb);

        // Get events metrics
        const events = await this.getEntityMetrics("events", dexieDb);

        // Get enrollments metrics
        const enrollments = await this.getEntityMetrics("enrollments", dexieDb);

        dexieDb.close();

        return { entities, events, enrollments };
    }

    /**
     * Get metrics for a specific table
     */
    private async getEntityMetrics(
        tableName: string,
        dexieDb: Dexie,
    ): Promise<{
        total: number;
        draft: number;
        pending: number;
        synced: number;
        failed: number;
        deleted: number;
    }> {
        const table = dexieDb.table(tableName);
        const all = await table.toArray();

        const metrics = {
            total: all.length,
            draft: 0,
            pending: 0,
            synced: 0,
            failed: 0,
            deleted: 0,
        };

        for (const item of all) {
            switch (item.syncStatus) {
                case "draft":
                    metrics.draft++;
                    break;
                case "pending":
                    metrics.pending++;
                    break;
                case "synced":
                    metrics.synced++;
                    break;
                case "failed":
                    metrics.failed++;
                    break;
                case "deleted":
                    metrics.deleted++;
                    break;
            }
        }

        return metrics;
    }

    /**
     * Record a sync operation for metrics tracking
     */
    recordSyncOperation(
        entityId: string,
        duration: number,
        success: boolean,
    ): void {
        this.metrics.set(entityId, {
            timestamp: Date.now(),
            duration,
            success,
        });

        // Keep only last 1000 operations to prevent memory growth
        if (this.metrics.size > 1000) {
            const oldestKey = this.metrics.keys().next().value;
            this.metrics.delete(oldestKey);
        }
    }

    /**
     * Get average sync time from recorded operations
     */
    private getAverageSyncTime(): number {
        if (this.metrics.size === 0) return 0;

        const durations = Array.from(this.metrics.values()).map(
            (m) => m.duration,
        );
        const sum = durations.reduce((a, b) => a + b, 0);
        return Math.round(sum / durations.length);
    }

    /**
     * Get failed operations with details
     */
    async getFailedOperations(): Promise<
        Array<{
            id: string;
            type: string;
            error: string;
            updatedAt: string;
        }>
    > {
        const failedOps: Array<{
            id: string;
            type: string;
            error: string;
            updatedAt: string;
        }> = [];

        const dexieDb = new Dexie("MOHRegisterDB");
        await dexieDb.open();

        // Get failed tracked entities
        const trackedEntitiesTable = dexieDb.table("trackedEntities");
        const failedEntities = await trackedEntitiesTable
            .where("syncStatus")
            .equals("failed")
            .toArray();

        for (const entity of failedEntities) {
            failedOps.push({
                id: entity.trackedEntity,
                type: "trackedEntity",
                error: entity.syncError || "Unknown error",
                updatedAt: entity.updatedAt,
            });
        }

        // Get failed events
        const eventsTable = dexieDb.table("events");
        const failedEvents = await eventsTable
            .where("syncStatus")
            .equals("failed")
            .toArray();

        for (const event of failedEvents) {
            failedOps.push({
                id: event.event,
                type: "event",
                error: event.syncError || "Unknown error",
                updatedAt: event.updatedAt,
            });
        }

        dexieDb.close();

        return failedOps.sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        );
    }

    /**
     * Start periodic health checks
     */
    startHealthMonitoring(intervalMs: number = 60000): void {
        if (this.healthCheckInterval) {
            return;
        }

            `<� Starting sync health monitoring (interval: ${intervalMs}ms)`,
        );

        this.healthCheckInterval = window.setInterval(async () => {
            const health = await this.getHealth();

            if (health.status === "critical") {
            } else if (health.status === "degraded") {
            } else {
            }
        }, intervalMs);
    }

    /**
     * Stop periodic health checks
     */
    stopHealthMonitoring(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.metrics.clear();
    }
}

// Export singleton instance
export const syncMonitor = new SyncMonitor();

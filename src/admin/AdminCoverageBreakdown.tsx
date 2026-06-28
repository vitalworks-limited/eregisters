import { Flex, Progress, theme, Tooltip, Typography } from "antd";
import React, { useMemo } from "react";
import { useOrgUnitCountsByLevel } from "./useOrgUnitCountsByLevel";
import { useOrgUnitLevels } from "./useOrgUnitLevels";
import { useProgramFacilities } from "./useProgramFacilities";

const { Text } = Typography;

interface Row {
    level: number;
    levelName: string;
    assigned: number;
    total: number;
    ratio: number;
}

/**
 * Shows how many organisation units at every DHIS2 level are assigned
 * to the eRegisters program vs. how many exist in the instance.
 * Sits above the Coverage Map so the headline numbers (Region /
 * District / Subcounty / Facility coverage) are visible at a glance —
 * answers the question "is the program really deployed to 8,000+
 * facilities?" with a per-level cascade.
 */
export const AdminCoverageBreakdown: React.FC = () => {
    const { token } = theme.useToken();
    const { facilities, loading: facLoading } = useProgramFacilities();
    const { levels: orgUnitLevels, loading: levelLoading } = useOrgUnitLevels();
    const levelNumbers = useMemo(
        () => orgUnitLevels.map((l) => l.level),
        [orgUnitLevels],
    );
    const { counts: totals, loading: countsLoading } =
        useOrgUnitCountsByLevel(levelNumbers);

    const rows: Row[] = useMemo(() => {
        if (orgUnitLevels.length === 0 || facilities.length === 0) return [];
        const assignedByLevel = new Map<number, Set<string>>();
        const facilityLevel = orgUnitLevels[orgUnitLevels.length - 1].level;
        for (const f of facilities) {
            // The facility itself counts at its own level.
            const ownLevel = f.level ?? facilityLevel;
            if (!assignedByLevel.has(ownLevel))
                assignedByLevel.set(ownLevel, new Set());
            assignedByLevel.get(ownLevel)!.add(f.id);
            // Each ancestor contributes to its level's assigned set.
            for (const a of f.ancestors) {
                if (!assignedByLevel.has(a.level))
                    assignedByLevel.set(a.level, new Set());
                assignedByLevel.get(a.level)!.add(a.id);
            }
        }
        return orgUnitLevels
            .map((lvl) => {
                const assigned = assignedByLevel.get(lvl.level)?.size ?? 0;
                const total = totals.get(lvl.level) ?? 0;
                const ratio = total > 0 ? assigned / total : 0;
                return {
                    level: lvl.level,
                    levelName: lvl.displayName,
                    assigned,
                    total,
                    ratio,
                };
            })
            .filter((r) => r.total > 0 || r.assigned > 0);
    }, [orgUnitLevels, facilities, totals]);

    if (facLoading || levelLoading || countsLoading) {
        return null;
    }
    if (rows.length === 0) return null;

    return (
        <Flex
            vertical
            gap={token.marginXXS}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 6,
                padding: token.paddingSM,
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginXS}
                wrap
            >
                <Text strong>Program coverage by hierarchy level</Text>
                <Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                >
                    Assigned to the eRegisters program / total in DHIS2
                </Text>
            </Flex>
            <Flex vertical gap={6}>
                {rows.map((r) => {
                    const pct = Math.round(r.ratio * 1000) / 10;
                    return (
                        <Flex
                            key={r.level}
                            align="center"
                            gap={token.marginSM}
                        >
                            <Text
                                style={{
                                    flex: "0 0 140px",
                                    fontSize: token.fontSizeSM,
                                }}
                            >
                                {r.levelName}{" "}
                                <Text type="secondary">
                                    (L{r.level})
                                </Text>
                            </Text>
                            <Tooltip
                                title={`${r.assigned.toLocaleString()} of ${r.total.toLocaleString()} (${pct}%)`}
                            >
                                <div style={{ flex: 1, minWidth: 120 }}>
                                    <Progress
                                        percent={pct}
                                        size="small"
                                        showInfo={false}
                                        strokeColor={
                                            pct >= 70
                                                ? token.colorSuccess
                                                : pct >= 40
                                                  ? token.colorWarning
                                                  : token.colorError
                                        }
                                        railColor={token.colorFillTertiary}
                                    />
                                </div>
                            </Tooltip>
                            <Text
                                style={{
                                    minWidth: 130,
                                    textAlign: "right",
                                    fontSize: token.fontSizeSM,
                                }}
                            >
                                <Text strong>
                                    {r.assigned.toLocaleString()}
                                </Text>{" "}
                                /{" "}
                                <Text type="secondary">
                                    {r.total.toLocaleString()}
                                </Text>{" "}
                                <Text type="secondary">({pct}%)</Text>
                            </Text>
                        </Flex>
                    );
                })}
            </Flex>
        </Flex>
    );
};

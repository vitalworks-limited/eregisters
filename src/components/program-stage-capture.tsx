import {
	Typography
} from "antd";
import React from "react";
import { FlattenedEvent, FlattenedTrackedEntity } from "../db";
import { ProgramStage } from "../schemas";

const { Text } = Typography;

export const ProgramStageCapture: React.FC<{
    programStage: ProgramStage;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
    captureMode?: "modal" | "inline"; // Configure how to add new records
}> = ({ programStage, trackedEntity, mainEvent, captureMode = "modal" }) => {
    return <div>This coming</div>;
};

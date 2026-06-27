import { BulbOutlined, MoonOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import React, { useContext } from "react";
import { ThemeContext } from "../App";

export const ThemeToggle: React.FC = () => {
    const { mode, setMode } = useContext(ThemeContext);
    const next = mode === "light" ? "dark" : "light";
    const label =
        mode === "light" ? "Switch to dark mode" : "Switch to light mode";
    return (
        <Tooltip title={label}>
            <Button
                type="text"
                aria-label={label}
                icon={mode === "light" ? <MoonOutlined /> : <BulbOutlined />}
                onClick={() => setMode(next)}
            />
        </Tooltip>
    );
};

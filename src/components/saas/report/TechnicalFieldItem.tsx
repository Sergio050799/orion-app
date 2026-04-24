"use client";

import { TechnicalField } from "@/types/vehicle";
import { useState } from "react";

interface FieldProps {
    field: TechnicalField<any>;
    label: string;
    unit?: string;
    onEdit?: (val: any) => void;
}

export function TechnicalFieldItem({ field, label, unit, onEdit }: FieldProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(field.value);

    const isLowConfidence = field.confidence < 0.95;
    const isCritical = field.isCritical;

    const handleBlur = () => {
        setIsEditing(false);
        if (tempValue !== field.value && onEdit) {
            onEdit(tempValue);
        }
    };

    return (
        <div
            className="p-2 rounded-md"
            style={{
                border: isCritical ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)',
                background: isCritical ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
            }}
        >
            <div className="flex justify-between items-start mb-1">
                <label className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</label>
                {isLowConfidence && !isEditing && (
                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400">
                        {Math.round(field.confidence * 100)}%
                    </span>
                )}
            </div>

            {isEditing ? (
                <input
                    autoFocus
                    className="w-full rounded px-1 py-0.5 text-sm text-white focus:outline-none"
                    style={{
                        background: 'rgba(2,6,23,0.8)',
                        border: '1px solid #6366f1',
                        caretColor: '#6366f1',
                    }}
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBlur();
                        if (e.key === 'Escape') { setIsEditing(false); setTempValue(field.value); }
                    }}
                />
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className={`text-sm font-medium cursor-text truncate ${isLowConfidence ? 'decoration-amber-500/50 underline decoration-wavy' : ''}`}
                    style={{ color: 'rgba(255,255,255,0.85)' }}
                >
                    {field.value} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
                </div>
            )}
        </div>
    );
}

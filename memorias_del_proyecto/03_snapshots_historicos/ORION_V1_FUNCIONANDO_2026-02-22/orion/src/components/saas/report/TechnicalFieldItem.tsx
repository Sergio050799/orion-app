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
        <div className={`p-2 rounded-md border ${isCritical ? 'border-red-500/20 bg-red-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
            <div className="flex justify-between items-start mb-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</label>
                {isLowConfidence && !isEditing && (
                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400">
                        {Math.round(field.confidence * 100)}%
                    </span>
                )}
            </div>

            {isEditing ? (
                <input
                    autoFocus
                    className="w-full bg-slate-950 border border-[#3CE0FF] rounded px-1 py-0.5 text-sm text-white focus:outline-none"
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
                >
                    {field.value} <span className="text-slate-600 text-xs font-normal">{unit}</span>
                </div>
            )}
        </div>
    );
}

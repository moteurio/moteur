import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { colors } from './theme.js';

type FieldType = 'text' | 'boolean' | 'number' | 'select' | 'json' | 'readonly';

export interface FieldSchema {
    key: string;
    label: string;
    type: FieldType;
    choices?: Array<{ value: string; label: string }>;
}

export interface EntityEditorProps {
    title: string;
    /** Fields the user can edit. */
    fields: FieldSchema[];
    /** Load entity data; called on mount. Return key-value record. */
    load: () => Promise<Record<string, unknown>>;
    /** Save entity data. Receives the full edited record. */
    save: (data: Record<string, unknown>) => Promise<void>;
    /** Delete entity. If omitted, D key is disabled. */
    onDelete?: () => Promise<void>;
    onBack: () => void;
}

function valueToString(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v, null, 2);
}

function parseValue(type: FieldType, raw: string): unknown {
    const s = raw.trim();
    if (type === 'number') {
        const n = Number(s);
        return Number.isNaN(n) ? 0 : n;
    }
    if (type === 'boolean') return s === 'true' || s === '1' || s.toLowerCase() === 'yes';
    if (type === 'json') {
        try {
            return JSON.parse(s || '{}');
        } catch {
            return s;
        }
    }
    return s;
}

export function EntityEditor({ title, fields, load, save, onDelete, onBack }: EntityEditorProps) {
    const { exit } = useApp();
    const [data, setData] = useState<Record<string, unknown>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [fieldCursor, setFieldCursor] = useState(0);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [selectIdx, setSelectIdx] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const editableFields = fields.filter(f => f.type !== 'readonly');

    const doLoad = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await load();
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [load]);

    useEffect(() => {
        doLoad();
    }, [doLoad]);

    const doSave = useCallback(async () => {
        setSaving(true);
        setSaved(false);
        try {
            await save(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }, [save, data]);

    useInput((input, key) => {
        if (editingKey) {
            const field = fields.find(f => f.key === editingKey);
            if (field?.type === 'select') {
                const choices = field.choices ?? [];
                if (key.escape) {
                    setEditingKey(null);
                    return;
                }
                if (key.upArrow && choices.length) {
                    setSelectIdx(c => (c - 1 + choices.length) % choices.length);
                    return;
                }
                if (key.downArrow && choices.length) {
                    setSelectIdx(c => (c + 1) % choices.length);
                    return;
                }
                if (key.return && choices.length) {
                    setData(prev => ({ ...prev, [editingKey]: choices[selectIdx].value }));
                    setEditingKey(null);
                    return;
                }
                return;
            }
            if (key.escape) setEditingKey(null);
            return;
        }
        if (confirmDelete) {
            if ((input === 'y' || input === 'Y') && onDelete) {
                onDelete()
                    .then(() => onBack())
                    .catch(() => setConfirmDelete(false));
            } else if (key.escape) {
                setConfirmDelete(false);
            }
            return;
        }
        if (input === 'o' || input === 'O') {
            const editorCmd = process.env.EDITOR || process.env.VISUAL || 'notepad';
            const tmp = path.join(os.tmpdir(), `moteur-editor-${Date.now()}.json`);
            try {
                fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
                spawnSync(editorCmd, [tmp], { stdio: 'inherit', shell: true });
                const raw = fs.readFileSync(tmp, 'utf-8');
                const next = JSON.parse(raw) as Record<string, unknown>;
                fs.unlinkSync(tmp);
                setData(next);
                save(next)
                    .then(() => setSaved(true))
                    .catch((e: unknown) =>
                        setError(e instanceof Error ? e.message : 'Save failed')
                    );
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
            return;
        }
        if ((input === 'd' || input === 'D') && onDelete) {
            setConfirmDelete(true);
            return;
        }
        if (key.escape || key.leftArrow) {
            onBack();
            return;
        }
        if (input === 'q') {
            exit();
            return;
        }
        if (key.upArrow && editableFields.length) {
            setFieldCursor(c => (c - 1 + editableFields.length) % editableFields.length);
            return;
        }
        if (key.downArrow && editableFields.length) {
            setFieldCursor(c => (c + 1) % editableFields.length);
            return;
        }
        if (key.return && editableFields[fieldCursor]) {
            const field = editableFields[fieldCursor];
            if (field.type === 'select') {
                const choices = field.choices ?? [];
                const cur = valueToString(data[field.key]);
                const idx = choices.findIndex(c => c.value === cur);
                setSelectIdx(idx >= 0 ? idx : 0);
                setEditingKey(field.key);
            } else if (field.type === 'boolean') {
                setData(prev => ({ ...prev, [field.key]: !prev[field.key] }));
            } else {
                setEditingKey(field.key);
                setEditValue(valueToString(data[field.key]));
            }
            return;
        }
        if (key.ctrl && input === 's') {
            doSave();
        }
    });

    const handleEditSubmit = (value: string) => {
        if (!editingKey) return;
        const field = fields.find(f => f.key === editingKey);
        setData(prev => ({ ...prev, [editingKey]: parseValue(field?.type ?? 'text', value) }));
        setEditingKey(null);
    };

    if (loading)
        return (
            <Box padding={2}>
                <Text color={colors.teal}>Loading…</Text>
            </Box>
        );
    if (error && Object.keys(data).length === 0) {
        return (
            <Box flexDirection="column" padding={2}>
                <Text color={colors.error}>{error}</Text>
                <Text color={colors.dim}>Esc/← back</Text>
            </Box>
        );
    }
    if (confirmDelete) {
        return (
            <Box flexDirection="column" padding={2}>
                <Text color={colors.error}>
                    Delete this item? Press Y to confirm, Esc to cancel
                </Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
                <Text bold color={colors.amber}>
                    {title}
                </Text>
            </Box>
            {fields
                .filter(f => f.type === 'readonly')
                .map(f => (
                    <Box key={f.key} paddingX={1}>
                        <Box width={20} flexShrink={0}>
                            <Text color={colors.dim}>{f.label}</Text>
                        </Box>
                        <Text>{valueToString(data[f.key]) || '—'}</Text>
                    </Box>
                ))}
            {editableFields.length > 0 && (
                <Box flexDirection="column" paddingX={1} marginTop={1}>
                    {editableFields.map((field, i) => {
                        const isSelected = i === fieldCursor && !editingKey;
                        const isEditing = editingKey === field.key;
                        const val = data[field.key];
                        const display = valueToString(val);
                        const isSelectEditing = isEditing && field.type === 'select';

                        return (
                            <Box key={field.key} flexDirection="column" marginBottom={1}>
                                <Box>
                                    <Text
                                        color={isSelected ? colors.teal : undefined}
                                        bold={isSelected}
                                    >
                                        {isSelected ? '▶ ' : '  '}
                                        {field.label}
                                    </Text>
                                </Box>
                                <Box paddingLeft={4}>
                                    {isSelectEditing ? (
                                        <Box flexDirection="column">
                                            {(field.choices ?? []).map((choice, idx) => (
                                                <Box key={choice.value}>
                                                    <Text
                                                        color={
                                                            idx === selectIdx
                                                                ? colors.teal
                                                                : undefined
                                                        }
                                                        bold={idx === selectIdx}
                                                    >
                                                        {idx === selectIdx ? '▶ ' : '  '}
                                                        {choice.label}
                                                    </Text>
                                                </Box>
                                            ))}
                                            <Text color={colors.dim}>
                                                {' '}
                                                ↑/↓ choose Enter select Esc cancel
                                            </Text>
                                        </Box>
                                    ) : isEditing ? (
                                        <TextInput
                                            value={editValue}
                                            onChange={setEditValue}
                                            onSubmit={handleEditSubmit}
                                            placeholder={`Enter ${field.label}…`}
                                        />
                                    ) : (
                                        <Text color={isSelected ? undefined : colors.dim}>
                                            {field.type === 'boolean'
                                                ? val
                                                    ? '✓ true'
                                                    : '✗ false'
                                                : display || '(empty)'}
                                            {field.type === 'boolean' ? (
                                                <Text color={colors.dim}> [Enter to toggle]</Text>
                                            ) : (
                                                <Text color={colors.dim}> [Enter to edit]</Text>
                                            )}
                                        </Text>
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
            <Box marginTop={1} paddingX={1} flexDirection="column">
                <Text color={colors.dim}>
                    ↑/↓ move Enter edit Ctrl+S save {onDelete ? 'D delete  ' : ''}O open in $EDITOR
                    Esc/← back q quit
                </Text>
                {saving && <Text color={colors.amber}>Saving…</Text>}
                {saved && <Text color={colors.success}>Saved</Text>}
                {error && <Text color={colors.error}>{error}</Text>}
            </Box>
        </Box>
    );
}

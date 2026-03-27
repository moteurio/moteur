import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import type { MoteurAdminClient } from '@moteurio/client';

type MoteurClient = MoteurAdminClient;

interface FieldDef {
    type: string;
    label: string;
    notes?: string;
    options?:
        | { required?: boolean; choices?: Array<{ value?: string; label?: string }> }
        | Array<{ value?: string; label?: string }>;
}

interface EntryEditorProps {
    client: MoteurClient;
    projectId: string;
    projectLabel?: string;
    modelId: string;
    modelLabel: string;
    entryId: string;
    entryLabel: string;
    onBack: () => void;
}

function fieldValueToString(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
}

function parseFieldValue(type: string, raw: string): unknown {
    const s = raw.trim();
    if (type === 'core/number' || type === 'core/order') {
        const n = Number(s);
        return Number.isNaN(n) ? 0 : n;
    }
    if (type === 'core/boolean') {
        return s === 'true' || s === '1' || s.toLowerCase() === 'yes';
    }
    if (type === 'core/json' || type.includes('object')) {
        try {
            return JSON.parse(s || '{}');
        } catch {
            return s;
        }
    }
    return s;
}

/** Normalize select field options to { value, label }[]. Supports options as array or options.choices. */
function getSelectChoices(def: FieldDef): Array<{ value: string; label: string }> {
    const raw = Array.isArray(def.options)
        ? def.options
        : (def.options as { choices?: Array<{ value?: string; label?: string }> } | undefined)
              ?.choices;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((c: { value?: string; label?: string }) => ({
        value: String(c.value ?? c.label ?? ''),
        label: String(c.label ?? c.value ?? '')
    }));
}

const SIMPLE_TYPES = new Set([
    'core/text',
    'core/textarea',
    'core/slug',
    'core/email',
    'core/url',
    'core/html',
    'core/markdown',
    'core/icon',
    'core/number',
    'core/order',
    'core/boolean',
    'core/json',
    'core/id'
]);

const SELECT_TYPES = new Set(['core/select']);

export function EntryEditor({
    client,
    projectId,
    projectLabel = '',
    modelId,
    modelLabel,
    entryId,
    entryLabel,
    onBack
}: EntryEditorProps) {
    const { exit } = useApp();
    const [model, setModel] = useState<{ fields: Record<string, FieldDef> } | null>(null);
    const [entryData, setEntryData] = useState<Record<string, unknown>>({});
    const [entryStatus, setEntryStatus] = useState<string>('draft');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [fieldCursor, setFieldCursor] = useState(0);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [selectChoiceIndex, setSelectChoiceIndex] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [infoFieldKey, setInfoFieldKey] = useState<string | null>(null);

    const fieldEntries = model ? Object.entries(model.fields) : [];
    const currentField = fieldEntries[fieldCursor];
    const currentKey = currentField?.[0];

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const prj = client.forProject(projectId);
            const [modelRes, entryRes] = await Promise.all([
                prj.models.get(modelId),
                prj.entries.get(modelId, entryId)
            ]);
            setModel(modelRes.model as { fields: Record<string, FieldDef> });
            const entry = entryRes.entry as { data?: Record<string, unknown>; status?: string };
            setEntryData(entry?.data ?? {});
            setEntryStatus(entry?.status ?? 'draft');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [client, projectId, modelId, entryId]);

    useEffect(() => {
        load();
    }, [load]);

    const save = useCallback(async () => {
        if (!model) return;
        setSaving(true);
        setSaved(false);
        try {
            await client
                .forProject(projectId)
                .entries.update(modelId, entryId, { data: entryData });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }, [client, projectId, modelId, entryId, entryData, model]);

    useInput((input, key) => {
        if (editingKey && model) {
            const def = model.fields[editingKey];
            const isSelect = def && SELECT_TYPES.has(def.type);
            if (isSelect) {
                const choices = getSelectChoices(def);
                if (key.escape) {
                    setEditingKey(null);
                    return;
                }
                if (key.upArrow && choices.length > 0) {
                    setSelectChoiceIndex(c => (c - 1 + choices.length) % choices.length);
                    return;
                }
                if (key.downArrow && choices.length > 0) {
                    setSelectChoiceIndex(c => (c + 1) % choices.length);
                    return;
                }
                if (key.return && choices.length > 0) {
                    setEntryData(prev => ({
                        ...prev,
                        [editingKey]: choices[selectChoiceIndex].value
                    }));
                    setEditingKey(null);
                    return;
                }
                return;
            }
            if (key.escape) {
                setEditingKey(null);
            }
            return;
        }
        if (infoFieldKey) {
            if (key.escape || key.leftArrow) setInfoFieldKey(null);
            return;
        }
        if (confirmDelete) {
            if (input === 'y' || input === 'Y') {
                client
                    .forProject(projectId)
                    .entries.delete(modelId, entryId)
                    .then(() => onBack())
                    .catch(() => setConfirmDelete(false));
            } else if (key.escape) {
                setConfirmDelete(false);
            }
            return;
        }
        if (input === 'i' || input === 'I') {
            if (currentKey && model) {
                setInfoFieldKey(currentKey);
            }
            return;
        }
        if (input === 'p' || input === 'P') {
            const newStatus = entryStatus === 'published' ? 'draft' : 'published';
            client
                .forProject(projectId)
                .entries.status(modelId, entryId, newStatus)
                .then(() => {
                    setEntryStatus(newStatus);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                })
                .catch(e => setError(e instanceof Error ? e.message : 'Status change failed'));
            return;
        }
        if (input === 'd' || input === 'D') {
            setConfirmDelete(true);
            return;
        }
        if (input === 'o' || input === 'O') {
            const editor = process.env.EDITOR || process.env.VISUAL || 'notepad';
            const tmp = path.join(os.tmpdir(), `moteur-entry-${entryId}.json`);
            try {
                fs.writeFileSync(tmp, JSON.stringify(entryData, null, 2), 'utf-8');
                spawnSync(editor, [tmp], { stdio: 'inherit', shell: true });
                const raw = fs.readFileSync(tmp, 'utf-8');
                const next = JSON.parse(raw) as Record<string, unknown>;
                setEntryData(next);
                fs.unlinkSync(tmp);
                client
                    .forProject(projectId)
                    .entries.update(modelId, entryId, { data: next })
                    .then(() => setSaved(true))
                    .catch(() => setError('Failed to save after edit'));
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
            return;
        }
        if (key.escape || key.leftArrow || input === 'q') {
            if (input === 'q') exit();
            else onBack();
            return;
        }
        if (key.upArrow && fieldEntries.length > 0) {
            setFieldCursor(c => (c - 1 + fieldEntries.length) % fieldEntries.length);
            return;
        }
        if (key.downArrow && fieldEntries.length > 0) {
            setFieldCursor(c => (c + 1) % fieldEntries.length);
            return;
        }
        if (key.return && currentKey && model) {
            const def = model.fields[currentKey];
            if (def && SELECT_TYPES.has(def.type)) {
                const choices = getSelectChoices(def);
                const currentVal = fieldValueToString(entryData[currentKey]);
                const idx = choices.findIndex(
                    c => c.value === currentVal || c.label === currentVal
                );
                setSelectChoiceIndex(idx >= 0 ? idx : 0);
                setEditingKey(currentKey);
                return;
            }
            if (def && SIMPLE_TYPES.has(def.type)) {
                setEditingKey(currentKey);
                setEditValue(fieldValueToString(entryData[currentKey]));
            }
            return;
        }
        if (key.ctrl && input === 's') {
            save();
        }
    });

    const handleEditSubmit = (value: string) => {
        if (!editingKey || !model) return;
        const def = model.fields[editingKey];
        const parsed = parseFieldValue(def?.type ?? 'core/text', value);
        setEntryData(prev => ({ ...prev, [editingKey]: parsed }));
        setEditingKey(null);
    };

    if (loading) {
        return (
            <Box padding={2}>
                <Text color="cyan">Loading entry…</Text>
            </Box>
        );
    }
    if (error && !model) {
        return (
            <Box flexDirection="column" padding={2}>
                <Text color="red">{error}</Text>
                <Text dimColor>Press Escape to go back.</Text>
            </Box>
        );
    }
    if (!model) {
        return (
            <Box padding={2}>
                <Text color="yellow">Model not found.</Text>
            </Box>
        );
    }

    const statusBadge = entryStatus === 'published' ? ' [published]' : ' [draft]';
    const breadcrumb = [
        projectLabel || projectId,
        (model as { label?: string })?.label ?? modelLabel,
        entryLabel || entryId
    ]
        .filter(Boolean)
        .join('  ›  ');

    if (confirmDelete) {
        return (
            <Box flexDirection="column" padding={2}>
                <Text color="red">Delete this entry? Press Y to confirm, Esc to cancel</Text>
            </Box>
        );
    }

    if (infoFieldKey && model && model.fields[infoFieldKey]) {
        const def = model.fields[infoFieldKey];
        const choices = getSelectChoices(def);
        const opts =
            def.options && typeof def.options === 'object' && !Array.isArray(def.options)
                ? def.options
                : undefined;
        return (
            <Box
                flexDirection="column"
                paddingX={2}
                paddingY={1}
                borderStyle="single"
                borderColor="cyan"
            >
                <Box marginBottom={1}>
                    <Text bold color="cyan">
                        Field info
                    </Text>
                </Box>
                <Box flexDirection="column">
                    <Text>
                        Key: <Text bold>{infoFieldKey}</Text>
                    </Text>
                    <Text>Label: {def.label || infoFieldKey}</Text>
                    <Text>Type: {def.type}</Text>
                    {opts?.required && <Text color="yellow">Required: yes</Text>}
                    {def.notes ? (
                        <Box flexDirection="column" marginTop={1}>
                            <Text bold>Notes:</Text>
                            <Text wrap="wrap">{def.notes}</Text>
                        </Box>
                    ) : null}
                    {choices.length > 0 && (
                        <Box flexDirection="column" marginTop={1}>
                            <Text bold>Choices:</Text>
                            {choices.map((c, idx) => (
                                <Text key={idx} wrap="wrap">
                                    {' '}
                                    {c.value} → {c.label}
                                </Text>
                            ))}
                        </Box>
                    )}
                </Box>
                <Box marginTop={1}>
                    <Text dimColor>Esc/← to close</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
                <Text bold color="yellow">
                    {breadcrumb}
                </Text>
                <Text color={entryStatus === 'published' ? 'green' : 'gray'}>{statusBadge}</Text>
            </Box>
            <Box flexDirection="column" paddingX={1}>
                {fieldEntries.map(([key, def], i) => {
                    const isSelected = i === fieldCursor && !editingKey;
                    const isEditing = editingKey === key;
                    const val = entryData[key];
                    const display = fieldValueToString(val);
                    const editable = SIMPLE_TYPES.has(def.type);
                    const selectEditable = SELECT_TYPES.has(def.type);
                    const choices = getSelectChoices(def);
                    const isSelectEditing = isEditing && SELECT_TYPES.has(def.type);

                    return (
                        <Box key={key} flexDirection="column" marginBottom={1}>
                            <Box>
                                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                                    {isSelected ? '▶ ' : '  '}
                                    {def.label || key}
                                    {def.options &&
                                    typeof def.options === 'object' &&
                                    !Array.isArray(def.options) &&
                                    (def.options as { required?: boolean }).required ? (
                                        <Text color="red"> *</Text>
                                    ) : null}
                                </Text>
                            </Box>
                            <Box paddingLeft={2}>
                                {isSelectEditing ? (
                                    <Box flexDirection="column">
                                        {choices.length === 0 ? (
                                            <Text dimColor>(no options defined)</Text>
                                        ) : (
                                            choices.map((choice, idx) => (
                                                <Box key={choice.value}>
                                                    <Text
                                                        color={
                                                            idx === selectChoiceIndex
                                                                ? 'cyan'
                                                                : undefined
                                                        }
                                                        bold={idx === selectChoiceIndex}
                                                    >
                                                        {idx === selectChoiceIndex ? '▶ ' : '  '}
                                                        {choice.label || choice.value}
                                                    </Text>
                                                </Box>
                                            ))
                                        )}
                                        <Text dimColor> ↑/↓ choose Enter select Esc cancel</Text>
                                    </Box>
                                ) : isEditing ? (
                                    <Box>
                                        <TextInput
                                            value={editValue}
                                            onChange={setEditValue}
                                            onSubmit={handleEditSubmit}
                                            placeholder={`Enter ${def.label || key}…`}
                                        />
                                    </Box>
                                ) : (
                                    <Text dimColor={!isSelected}>
                                        {display || <Text italic>(empty)</Text>}
                                        {editable || selectEditable ? (
                                            <Text dimColor> [Enter to edit]</Text>
                                        ) : (
                                            <Text dimColor> (edit in Studio)</Text>
                                        )}
                                    </Text>
                                )}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
            <Box marginTop={2} paddingX={1} flexDirection="column">
                <Text dimColor>
                    ↑/↓ move Enter edit I field info Ctrl+S save P publish D delete O open in
                    $EDITOR Esc/← back q quit
                </Text>
                {saving && <Text color="yellow">Saving…</Text>}
                {saved && <Text color="green">✓ Saved</Text>}
            </Box>
        </Box>
    );
}

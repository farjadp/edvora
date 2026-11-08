import { AI_PROVIDERS } from '@edvora/integrations/ai'
import type { CollectionConfig, FieldAccess } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'

/**
 * E-046 · AI assistant (ADR 018). Every collection is tenant-owned (multiTenantPlugin) and hidden from the Payload
 * admin: the UI is the «دستیار هوشمند» section in /staff. Chats, messages, proposals and documents are written only
 * by server code (create/update: nobody); people read their own chats and proposals, `ai.manage` reads the rest.
 */
const group = { fa: 'دستیار هوشمند', en: 'AI assistant' }
const never: FieldAccess = () => false

const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  custom: 'سازگار با OpenAI (درگاه ایرانی)',
  mock: 'آزمایشی (بدون اتصال)',
}

export const AiSettings: CollectionConfig = {
  slug: 'ai-settings',
  labels: { singular: { fa: 'تنظیمات دستیار', en: 'Assistant settings' }, plural: { fa: 'تنظیمات دستیار', en: 'Assistant settings' } },
  admin: { hidden: true, group },
  indexes: [{ fields: ['tenant'], unique: true }],
  access: { read: allow('ai.manage'), create: allowCreate('ai.manage'), update: allow('ai.manage'), delete: nobody },
  hooks: {
    beforeChange: [guard({ create: ['ai.manage'], update: ['ai.manage'] })],
    afterChange: [auditChange('ai-settings')],
  },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: false },
    /** The assistant's name in this academy; empty = Edvora's default «دانا» (core `assistantName`). */
    { name: 'assistantName', type: 'text', maxLength: 24 },
    { name: 'provider', type: 'select', required: true, defaultValue: 'mock', options: AI_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] })) },
    { name: 'model', type: 'text', required: true, defaultValue: 'mock-1' },
    { name: 'baseUrl', type: 'text', admin: { description: 'Custom OpenAI-compatible endpoint only, e.g. https://api.avalai.ir/v1' } },
    /** Write-only key: sealed by the settings action (lib/ai/settings.ts); no API can read or set it. */
    { name: 'apiKeySealed', type: 'text', hidden: true, access: { read: never, create: never, update: never } },
    { name: 'apiKeyHint', type: 'text', admin: { readOnly: true } },
    { name: 'embeddingModel', type: 'text', admin: { description: 'Empty = the provider default (local embedding for Claude and the mock).' } },
    {
      name: 'privacy',
      type: 'group',
      fields: [
        { name: 'names', type: 'checkbox', defaultValue: true },
        { name: 'nationalCodes', type: 'checkbox', defaultValue: false },
        { name: 'phones', type: 'checkbox', defaultValue: false },
        { name: 'emails', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'limits',
      type: 'group',
      fields: [
        { name: 'perMinute', type: 'number', min: 0, defaultValue: 20 },
        { name: 'perDay', type: 'number', min: 0, defaultValue: 300 },
        { name: 'monthlyTokenLimit', type: 'number', min: 0 },
        { name: 'monthlyCostLimitRial', type: 'number', min: 0 },
        { name: 'inputPricePerMillionRial', type: 'number', min: 0 },
        { name: 'outputPricePerMillionRial', type: 'number', min: 0 },
      ],
    },
    { name: 'lastTest', type: 'json', admin: { readOnly: true } },
  ],
}

export const AiConversations: CollectionConfig = {
  slug: 'ai-conversations',
  labels: { singular: { fa: 'گفت‌وگو', en: 'Conversation' }, plural: { fa: 'گفت‌وگوها', en: 'Conversations' } },
  admin: { hidden: true, group, useAsTitle: 'title' },
  defaultSort: '-lastMessageAt',
  access: { read: ownRecords('user'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'pagePath', type: 'text' },
    { name: 'lastMessageAt', type: 'date', index: true },
    { name: 'messageCount', type: 'number', defaultValue: 0 },
  ],
}

export const AiMessages: CollectionConfig = {
  slug: 'ai-messages',
  labels: { singular: { fa: 'پیام دستیار', en: 'Assistant message' }, plural: { fa: 'پیام‌های دستیار', en: 'Assistant messages' } },
  admin: { hidden: true, group },
  defaultSort: 'createdAt',
  access: { read: ownRecords('user'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'conversation', type: 'relationship', relationTo: 'ai-conversations', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: [
        { value: 'user', label: 'user' },
        { value: 'assistant', label: 'assistant' },
      ],
    },
    { name: 'content', type: 'textarea' },
    { name: 'citations', type: 'json' },
    { name: 'tools', type: 'json', admin: { description: 'Tools the assistant ran for this answer (names, no data).' } },
    { name: 'proposals', type: 'relationship', relationTo: 'ai-actions', hasMany: true },
    { name: 'inputTokens', type: 'number', defaultValue: 0 },
    { name: 'outputTokens', type: 'number', defaultValue: 0 },
    { name: 'provider', type: 'text' },
    { name: 'model', type: 'text' },
    { name: 'error', type: 'text' },
  ],
}

export const AiDocuments: CollectionConfig = {
  slug: 'ai-documents',
  labels: { singular: { fa: 'سند دانش', en: 'Knowledge document' }, plural: { fa: 'اسناد دانش', en: 'Knowledge documents' } },
  admin: { hidden: true, group, useAsTitle: 'title' },
  defaultSort: '-createdAt',
  access: { read: allow('ai.manage'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'filename', type: 'text', required: true },
    { name: 'mimeType', type: 'text' },
    { name: 'size', type: 'number' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'processing',
      options: [
        { value: 'processing', label: { fa: 'در حال پردازش', en: 'Processing' } },
        { value: 'ready', label: { fa: 'آماده', en: 'Ready' } },
        { value: 'failed', label: { fa: 'ناموفق', en: 'Failed' } },
      ],
    },
    { name: 'error', type: 'text' },
    { name: 'chunkCount', type: 'number', defaultValue: 0 },
    { name: 'characters', type: 'number', defaultValue: 0 },
    { name: 'embeddingModel', type: 'text' },
    { name: 'uploadedBy', type: 'relationship', relationTo: 'users' },
  ],
}

export const AiMemories: CollectionConfig = {
  slug: 'ai-memories',
  labels: { singular: { fa: 'یادداشت حافظه', en: 'Memory note' }, plural: { fa: 'یادداشت‌های حافظه', en: 'Memory notes' } },
  admin: { hidden: true, group, useAsTitle: 'text' },
  defaultSort: '-createdAt',
  access: { read: anyOf(allow('ai.manage'), ownRecords('proposedBy')), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'text', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'proposed',
      index: true,
      options: [
        { value: 'proposed', label: { fa: 'در انتظار تأیید', en: 'Proposed' } },
        { value: 'approved', label: { fa: 'تأییدشده', en: 'Approved' } },
        { value: 'rejected', label: { fa: 'ردشده', en: 'Rejected' } },
      ],
    },
    { name: 'proposedBy', type: 'relationship', relationTo: 'users', index: true },
    { name: 'decidedBy', type: 'relationship', relationTo: 'users' },
    { name: 'decidedAt', type: 'date' },
    { name: 'conversation', type: 'relationship', relationTo: 'ai-conversations' },
  ],
}

export const AiActions: CollectionConfig = {
  slug: 'ai-actions',
  labels: { singular: { fa: 'پیشنهاد دستیار', en: 'Assistant proposal' }, plural: { fa: 'پیشنهادهای دستیار', en: 'Assistant proposals' } },
  admin: { hidden: true, group },
  defaultSort: '-createdAt',
  access: { read: anyOf(ownRecords('proposedBy'), allow('audit.view')), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'kind', type: 'text', required: true, index: true },
    { name: 'input', type: 'json', required: true },
    { name: 'summary', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: ['pending', 'executed', 'rejected', 'failed', 'expired'].map((v) => ({ value: v, label: v })),
    },
    { name: 'proposedBy', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'conversation', type: 'relationship', relationTo: 'ai-conversations' },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'decidedAt', type: 'date' },
    { name: 'targetCollection', type: 'text' },
    { name: 'targetId', type: 'text' },
    { name: 'error', type: 'text' },
  ],
}

export const AI_COLLECTIONS = [AiSettings, AiConversations, AiMessages, AiDocuments, AiMemories, AiActions]

/**
 * generate_outreach Tool + Outreach Generation Agent
 *
 * PURPOSE:
 *   Generate personalized cold outreach messages using LinkedIn summaries and LLM.
 *   Uses the existing LLM infrastructure to create contextual, personalized messages
 *   based on LinkedIn profile summaries with dynamic message generation.
 *
 * SPEC DECISIONS (Phase 2):
 *   - Uses existing LLM client from src/lib/llm.ts
 *   - Dynamic message generation (no templates)
 *   - Batch processing with error handling
 *   - No message storage (ephemeral for reporting only)
 *
 * INPUT (to agent runner):
 *   {
 *     stepId: string
 *     summaries: LinkedInSummaryResult[]  // from LinkedIn research step
 *     purpose: string                     // outreach purpose (gaming_partnership, tech_collaboration, etc.)
 *     tone?: string                       // professional, casual, friendly, etc.
 *     companyName?: string               // sender's company
 *     senderName?: string                // sender's name
 *     customPrompt?: string              // override default prompting
 *     maxMessages?: number               // safety limit
 *   }
 *
 * OUTPUT (agent):
 *   {
 *     stepId: string
 *     messages: { username, summary, outreach_message, purpose, tone }[]
 *     errors: { username: string, code: string, message: string }[]
 *     meta: {
 *       requested: number
 *       attempted: number
 *       succeeded: number
 *       failed: number
 *       purpose: string
 *       tone: string
 *       durationMs: number
 *     }
 *   }
 */

import { chatCompletion, LLMError } from '../../llm'
import type { LinkedInSummaryResult } from '../../linkedin'

/* ---------------------------------- *
 * Tool Error Wrapper
 * ---------------------------------- */

export type OutreachToolErrorCode =
  | 'NO_SUMMARIES'
  | 'INVALID_PARAM'
  | 'LLM_ERROR'
  | 'INTERNAL'

export class OutreachToolError extends Error {
  code: OutreachToolErrorCode
  constructor(code: OutreachToolErrorCode, message: string) {
    super(message)
    this.name = 'OutreachToolError'
    this.code = code
  }
}

/* ---------------------------------- *
 * Dynamic Message Generation
 * ---------------------------------- */

// Simplified system prompt for dynamic message generation
const DEFAULT_SYSTEM_PROMPT = `You are a professional outreach specialist writing personalized LinkedIn connection requests. Your messages should be:
- Professional and respectful
- Highly personalized based on the person's background and interests
- Suggest mutual value or collaboration opportunities
- Brief (under 150 words)
- Include a clear reason for connecting
- Use their real name when available, not their username
- Be genuine and avoid generic language`

const TONE_MODIFIERS: Record<string, string> = {
  professional: 'Keep the tone strictly professional and formal',
  casual: 'Use a casual but respectful tone',
  friendly: 'Be warm and friendly while maintaining professionalism', 
  enthusiastic: 'Show genuine enthusiasm and energy',
  direct: 'Be direct and to-the-point without being rude'
}

/* ---------------------------------- *
 * Public Tool Parameters / Result
 * ---------------------------------- */

export interface EnhancedLinkedInSummary extends LinkedInSummaryResult {
  enrichment?: any
}

export interface GenerateOutreachToolParams {
  summaries: EnhancedLinkedInSummary[]
  tone?: string
  companyName?: string
  senderName?: string
  customPrompt?: string
  maxMessages?: number
  purpose?: string  // Optional purpose/context for the outreach
}

export interface OutreachMessage {
  username: string
  linkedin_summary: string
  outreach_message: string
  tone: string
  generated_at: number
  real_name?: string
  purpose?: string
}

export interface GenerateOutreachToolResult {
  messages: OutreachMessage[]
  errors: {
    username: string
    code: string
    message: string
  }[]
  meta: {
    requested: number
    attempted: number
    succeeded: number
    failed: number
    tone: string
    durationMs: number
    purpose?: string
  }
}

/* ---------------------------------- *
 * Helper Functions
 * ---------------------------------- */

function extractRealName(enrichmentData: any): string | null {
  if (!enrichmentData?.raw_text) return null
  
  // Try to extract real name from enrichment text using common patterns
  const text = enrichmentData.raw_text
  
  // Look for name patterns in Instagram bio enrichment
  const namePatterns = [
    /(?:I'm|I am|My name is|Name:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[\|•\-]/,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)/,
    /🌟\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /✨\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/
  ]
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Validate it looks like a real name (2-4 words, each starting with capital)
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(name)) {
        return name
      }
    }
  }
  
  return null
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g')
    rendered = rendered.replace(placeholder, value || '')
  }
  return rendered
}

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[AGENT_OUTREACH]', ...args)
  }
}

/* ---------------------------------- *
 * Core Tool Implementation
 * ---------------------------------- */

export async function generateOutreachTool(params: GenerateOutreachToolParams): Promise<GenerateOutreachToolResult> {
  if (!params || !Array.isArray(params.summaries)) {
    throw new OutreachToolError('INVALID_PARAM', 'params.summaries must be an array')
  }
  
  if (params.summaries.length === 0) {
    throw new OutreachToolError('NO_SUMMARIES', 'No LinkedIn summaries provided')
  }

  const tone = params.tone || 'professional'
  const companyName = params.companyName || 'Our Company'
  const senderName = params.senderName || 'Our Team'
  const purpose = params.purpose || 'professional networking and collaboration'
  
  let working: EnhancedLinkedInSummary[] = params.summaries
  if (typeof params.maxMessages === 'number' && params.maxMessages > 0 && working.length > params.maxMessages) {
    working = working.slice(0, params.maxMessages)
  }

  const toneModifier = TONE_MODIFIERS[tone] || TONE_MODIFIERS.professional

  const start = Date.now()
  const messages: OutreachMessage[] = []
  const errors: { username: string; code: string; message: string }[] = []

  for (const summary of working) {
    try {
      // Prefer real name coming directly from LinkedIn research (summary.real_name)
      // Fallback to enrichment-based heuristic extraction if not present
      const realName = summary.real_name
        ? summary.real_name
        : (summary.enrichment ? extractRealName(summary.enrichment) : null)
      const displayName = realName || summary.username
      
      console.log(`[DEBUG] Processing ${summary.username}: realName="${realName}", displayName="${displayName}"`)
      
      let systemPrompt: string
      let userPrompt: string

      if (params.customPrompt) {
        systemPrompt = params.customPrompt
        userPrompt = renderTemplate(params.customPrompt, {
          username: summary.username,
          realName: realName || summary.username,
          displayName,
          summary: summary.summary,
          companyName,
          senderName,
          tone,
          purpose
        })
      } else {
        systemPrompt = DEFAULT_SYSTEM_PROMPT + `\n\nTone guidance: ${toneModifier}`
        
        // If we have a real name, mention using it in the system prompt
        if (realName) {
          systemPrompt += `\n\nIMPORTANT: The person's real name is "${realName}" - use this in your message instead of their username "${summary.username}".`
        }
        
        userPrompt = `Write a personalized LinkedIn connection request to ${displayName} based on their LinkedIn profile summary.

Profile Summary: ${summary.summary}
Their real name: ${realName || 'Unknown'}
Their username: ${summary.username}
Your company: ${companyName}
Your name: ${senderName}
Outreach purpose: ${purpose}
Desired tone: ${tone}

Write a compelling, personalized message that references specific details from their background and explains why you want to connect. Be genuine and suggest concrete value or collaboration opportunities.`
      }

      debugLog('generating_message', { username: summary.username, realName, purpose, tone })

      const result = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.7,
        maxTokens: 300,
        timeoutMs: 15000,
        tag: 'outreach_generation'
      })

      const outreachMessage: OutreachMessage = {
        username: summary.username,
        linkedin_summary: summary.summary,
        outreach_message: result.text.trim(),
        tone,
        generated_at: Date.now(),
        real_name: realName || undefined,
        purpose
      }

      messages.push(outreachMessage)
      debugLog('message_generated', { username: summary.username, messageLength: result.text.length })

    } catch (err: any) {
      let errorCode = 'UNKNOWN'
      if (err instanceof LLMError) {
        errorCode = 'LLM_ERROR'
      }
      
      errors.push({
        username: summary.username,
        code: errorCode,
        message: err?.message || 'Unknown error during message generation'
      })
      
      debugLog('message_generation_failed', { username: summary.username, error: err?.message })
    }
  }

  const end = Date.now()
  return {
    messages,
    errors,
    meta: {
      requested: params.summaries.length,
      attempted: working.length,
      succeeded: messages.length,
      failed: errors.length,
      tone,
      durationMs: end - start,
      purpose
    }
  }
}

/* ---------------------------------- *
 * Agent Runner Wrapper
 * ---------------------------------- */

export interface GenerateOutreachAgentInput extends GenerateOutreachToolParams {
  stepId: string
}

export interface GenerateOutreachAgentOutput extends GenerateOutreachToolResult {
  stepId: string
}

export async function runGenerateOutreachAgent(input: GenerateOutreachAgentInput): Promise<GenerateOutreachAgentOutput> {
  const { stepId, ...toolParams } = input
  debugLog('start', { stepId, summaries: toolParams.summaries.length, purpose: toolParams.purpose })
  const result = await generateOutreachTool(toolParams)
  debugLog('done', { stepId, succeeded: result.messages.length, failed: result.errors.length })
  return {
    stepId,
    ...result
  }
}

/* ---------------------------------- *
 * Tone Management
 * ---------------------------------- */

export function getAvailableTones(): string[] {
  return Object.keys(TONE_MODIFIERS)
}
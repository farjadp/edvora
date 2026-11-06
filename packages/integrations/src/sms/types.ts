export type SmsSendResult = { ok: true; messageId: string } | { ok: false; error: string }

/** Every SMS provider implements this. Swap providers with the SMS_PROVIDER env var. */
export interface SmsProvider {
  readonly name: string
  /** Template-based send (required for OTP in Iran; faster and not blocked by operators). */
  sendTemplate(input: { to: string; template: string; tokens: string[] }): Promise<SmsSendResult>
  /** Free-text send for reminders and notices. */
  send(input: { to: string; text: string }): Promise<SmsSendResult>
}

import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { JSON_HEADERS, orderMismatch, pickParams, requireCredential, str, toIntAmount } from './util'

/**
 * Saman (SEP), Shaparak direct. Token → form POST to the bank page → POST callback → VerifyTransaction.
 * Saman has no public sandbox: the `sandbox` flag does not change hosts (use a test terminal from the bank).
 * Unverified transactions are reversed by the bank automatically.
 */
const TOKEN_URL = 'https://sep.shaparak.ir/onlinepg/onlinepg'
const PAY_URL = 'https://sep.shaparak.ir/OnlinePG/OnlinePG'
const VERIFY_URL = 'https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction'

const Id = z.union([z.number(), z.string()])
const TokenResponse = z.object({ status: Id, token: z.string().optional(), errorCode: Id.optional(), errorDesc: z.string().optional() })
const VerifyResponse = z.object({
  ResultCode: z.number(),
  ResultDescription: z.string().nullish(),
  Success: z.boolean().nullish(),
  TransactionDetail: z
    .object({
      RRN: Id.nullish(),
      RefNum: Id.nullish(),
      MaskedPan: z.string().nullish(),
      OrginalAmount: Id.nullish(),
      AffectiveAmount: Id.nullish(),
    })
    .nullish(),
})

export function createSamanGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const terminalId = requireCredential('saman', opts.credentials, 'terminalId')
  if (!/^\d+$/.test(terminalId)) throw new IntegrationError('saman', 'terminalId must be numeric')

  return {
    name: 'saman',
    async createPayment(input) {
      const raw = await fetchJson('saman', TOKEN_URL, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          action: 'token',
          TerminalId: terminalId,
          Amount: input.amount,
          ResNum: input.attemptId,
          RedirectUrl: input.callbackUrl,
          CellNumber: input.mobile,
        }),
      })
      const parsed = TokenResponse.safeParse(raw)
      if (!parsed.success || String(parsed.data.status) !== '1' || !parsed.data.token) {
        const why = parsed.success && parsed.data.errorCode !== undefined ? `: ${parsed.data.errorCode} ${parsed.data.errorDesc ?? ''}`.trimEnd() : ''
        throw new IntegrationError('saman', `Token request failed${why}`, raw)
      }
      const authority = parsed.data.token
      return { authority, redirect: { method: 'POST', url: PAY_URL, fields: { Token: authority, GetMethod: '' } } }
    },
    async verify({ attemptId, extra }) {
      const refNum = extra.RefNum
      if (!refNum) return { ok: false, code: 'MISSING_REFNUM', message: 'Callback carried no RefNum' }
      const mismatch = orderMismatch(extra.ResNum, attemptId)
      if (mismatch) return mismatch
      const raw = await fetchJson('saman', VERIFY_URL, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ RefNum: refNum, TerminalNumber: Number(terminalId) }),
      })
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('saman', 'Unexpected verify response', raw)
      const d = parsed.data
      const ok = (d.ResultCode === 0 && d.Success !== false) || d.ResultCode === 2
      if (!ok) return { ok: false, code: String(d.ResultCode), message: d.ResultDescription ?? 'Verification failed' }
      const t = d.TransactionDetail
      return {
        ok: true,
        refId: str(t?.RRN) ?? str(t?.RefNum) ?? refNum,
        cardPan: t?.MaskedPan ?? extra.SecurePan,
        amount: toIntAmount(t?.OrginalAmount),
        alreadyVerified: d.ResultCode === 2,
      }
    },
    parseCallback(params) {
      const authority = params.get('Token')
      if (!authority) return null
      const success = params.get('State') === 'OK' || params.get('Status') === '2'
      return { authority, success, extra: pickParams(params, ['RefNum', 'ResNum', 'TraceNo', 'SecurePan']) }
    },
  }
}

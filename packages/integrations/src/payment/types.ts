export type CreatePaymentInput = {
  /** Amount in rials (integer). */
  amount: number
  description: string
  callbackUrl: string
  mobile?: string
  email?: string
  orderId: string
}

export type CreatePaymentResult = {
  /** Gateway reference to store on the payment record. */
  authority: string
  /** Where to send the buyer. */
  redirectUrl: string
}

export type VerifyPaymentInput = {
  authority: string
  amount: number
}

export type VerifyPaymentResult =
  | { ok: true; refId: string; cardPan?: string; alreadyVerified: boolean }
  | { ok: false; code: string; message: string }

/** Every payment gateway implements this. Swap gateways with the PAYMENT_PROVIDER env var. */
export interface PaymentProvider {
  readonly name: string
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult>
  /** Reads the gateway's callback query string. */
  parseCallback(params: URLSearchParams): { authority: string; success: boolean } | null
}

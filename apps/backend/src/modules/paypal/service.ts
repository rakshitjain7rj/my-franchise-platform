/**
 * Platform PayPal payment provider (Medusa).
 *
 * ## Ownership
 *
 * Registered as `pp_paypal_paypal`. We extend @alphabite/medusa-paypal’s
 * provider class only for Medusa AbstractPaymentProvider plumbing
 * (capture / authorize / refund / status). **Create-order semantics are owned
 * by this platform** via `./paypal-core` + `./order-contract`.
 *
 * ## Product path
 *
 * Storefront = PayPal JS SDK **Smart Buttons** (popup). Default provider
 * options intentionally omit returnUrl/cancelUrl so create-order stays in
 * Smart Buttons mode (`CREATED` + approve link). See `./order-contract.ts`.
 *
 * Amounts are Medusa-native major units (33.05 = £33.05). No unit conversion.
 */

import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
} from "@medusajs/framework/types"
// No type declarations ship for this subpath (the plugin's .d.ts map only
// covers the package root), so the import is untyped by design.
import alphabitePaypalProvider from "@alphabite/medusa-paypal/providers/paypal"

import FixedPaypalCoreService, {
  type FixedPaypalCoreOptions,
} from "./paypal-core"

// The plugin's provider entry is a ModuleProvider(...) wrapper of shape
// { module, services, loaders } — unwrap the service class so we can extend
// it. Its static `identifier` ("paypal") is inherited, keeping the registered
// provider id `pp_paypal_paypal` identical to a direct plugin registration.
const BasePaypalProviderService = (
  alphabitePaypalProvider as unknown as {
    services: Array<new (...args: any[]) => any>
  }
).services[0]

class PaypalProviderService extends BasePaypalProviderService {
  constructor(container: unknown, options: FixedPaypalCoreOptions) {
    super(container, options)
    // Always use the platform Orders client — never alphabite’s createOrder.
    this.client = new FixedPaypalCoreService(options)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    // PayPal expects ISO-4217 uppercase; Medusa stores "gbp".
    const currency_code = input.currency_code.toUpperCase()
    return super.initiatePayment({
      ...input,
      currency_code,
    })
  }
}

export default PaypalProviderService

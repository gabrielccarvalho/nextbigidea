import { AbacatePayProvider } from "./abacatepay";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(): PaymentProvider {
  // Swap here to add Stripe/Polar later behind the same interface.
  return new AbacatePayProvider();
}

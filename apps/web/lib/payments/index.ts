import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(): PaymentProvider {
  return new StripeProvider();
}

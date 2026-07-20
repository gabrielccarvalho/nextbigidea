import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { ProofBar } from "@/components/sections/proof-bar";
import { Specimen } from "@/components/sections/specimen";
import { Dissection } from "@/components/sections/dissection";
import { HowItWorks } from "@/components/sections/how-it-works";
import { WhyEvidence } from "@/components/sections/why-evidence";
import { Pricing } from "@/components/sections/pricing";
import { Faq } from "@/components/sections/faq";
import { FinalCta } from "@/components/sections/final-cta";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProofBar />
        <Specimen />
        <Dissection />
        <HowItWorks />
        <WhyEvidence />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

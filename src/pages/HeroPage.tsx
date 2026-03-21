// src/pages/HeroPage.tsx
import { Helmet } from "react-helmet-async";
import Layout from "../components/shared/Layout";
import FeaturedStory from "../components/landing/FeaturedStory";
import TheRadar from "../components/landing/TheRadar";
import TrustFooter from "../components/landing/TrustFooter";

export default function HeroPage() {
  return (
    <Layout>
      <Helmet>
        <title>AI 4 Society — Humanity's Window Into AI's Trajectory</title>
        <meta
          name="description"
          content="See and explore how AI is reshaping society. Live signals, risks, and solutions — curated by AI, reviewed by humans."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4">
        <FeaturedStory />
        <TheRadar />
        <TrustFooter />
      </div>
    </Layout>
  );
}

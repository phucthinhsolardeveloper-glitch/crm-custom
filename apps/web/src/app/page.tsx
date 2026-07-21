import { Metadata } from 'next';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingFeatures } from '@/components/landing/landing-features';
import { LandingStats } from '@/components/landing/landing-stats';
import { LandingCta } from '@/components/landing/landing-cta';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';

export const metadata: Metadata = {
  title: 'CRM-Custom - Tốc độ & Hiệu suất cho đội ngũ bán hàng',
  description: 'Hệ thống CRM nội bộ tối ưu hiệu suất đội sales, quản lý lead pipeline, payment verification tự động, phân phối AI-based.',
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* Atmospheric blur orbs */}
      <div className="blur-orb -left-48 top-20 h-[500px] w-[500px] bg-sky-200 opacity-25" />
      <div className="blur-orb -right-32 top-96 h-[400px] w-[400px] bg-cyan-200 opacity-20" />
      <div className="blur-orb left-1/3 top-[800px] h-[350px] w-[350px] bg-sky-100 opacity-15" />

      <div className="relative z-10">
        <LandingNav />
        <LandingHero />
        <LandingFeatures />
        <LandingStats />
        <LandingCta />
        <LandingFooter />
      </div>
    </div>
  );
}

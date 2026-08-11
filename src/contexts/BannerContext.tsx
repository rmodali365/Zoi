import React, { createContext, useCallback, useContext, useState } from 'react';
import { Banner, BannerData } from '@/components/ui/Banner';

type BannerContextValue = {
  // Show a confirmation banner (fire-and-forget). Auto-dismisses.
  show: (banner: Omit<BannerData, 'key'>) => void;
};

const BannerContext = createContext<BannerContextValue | undefined>(undefined);

// Provides a single app-wide confirmation banner. Mount ABOVE the navigator so the
// banner outlives screen transitions (show it, then navigate — it lingers over the
// destination). See src/components/ui/Banner.tsx.
export function BannerProvider({ children }: { children: React.ReactNode }) {
  const [banner, setBanner] = useState<BannerData | null>(null);

  const show = useCallback((b: Omit<BannerData, 'key'>) => {
    setBanner({ ...b, key: Date.now() });
  }, []);

  return (
    <BannerContext.Provider value={{ show }}>
      {children}
      <Banner banner={banner} onHide={() => setBanner(null)} />
    </BannerContext.Provider>
  );
}

export function useBanner(): BannerContextValue {
  const ctx = useContext(BannerContext);
  if (!ctx) throw new Error('useBanner must be used within a BannerProvider');
  return ctx;
}

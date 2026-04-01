'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * AI Produce page — redirects to main workflow page.
 * The old 5-step wizard UI has been merged into the main workflow canvas.
 * Route: /workflow/[projectId]/ai-produce → /workflow/[projectId]
 */
export default function AiProducePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  // Redirect to main workflow page
  React.useEffect(() => {
    router.replace(`/workflow/${projectId}`);
  }, [projectId, router]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111118',
        color: '#888',
        fontSize: 14,
      }}
    >
      跳转中...
    </div>
  );
}

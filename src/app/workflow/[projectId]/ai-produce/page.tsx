'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import WorkflowSidebar from '@/components/workflow/WorkflowSidebar';
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas';
import type { WfWorkflowStatus } from '@/types/workflow';

/**
 * AI Produce page — the new 5-step workflow UI.
 * Route: /workflow/[projectId]/ai-produce
 *
 * Layout: fixed 320px left sidebar + flex-1 infinite canvas.
 */
export default function AiProducePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [status, setStatus] = useState<WfWorkflowStatus | null>(null);

  const handleStatusChange = useCallback((s: WfWorkflowStatus) => {
    setStatus(s);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Left sidebar: 5-step workflow guide */}
      <div className="w-80 flex-shrink-0">
        <WorkflowSidebar
          projectId={projectId}
          onStatusChange={handleStatusChange}
        />
      </div>

      {/* Right: infinite canvas */}
      <WorkflowCanvas
        projectId={projectId}
        status={status}
      />
    </div>
  );
}

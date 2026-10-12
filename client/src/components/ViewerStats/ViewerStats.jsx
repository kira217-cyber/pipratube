import React from "react";
import { BarChart3, Eye } from "lucide-react";

import {
  formatOnline,
  formatViews,
  useViewerStats,
} from "../../hooks/useViewerStats";

// The "Online Today / Views" pair shown beside every Live TV channel and
// every video — identical everywhere, so the numbers read the same way on
// the Live TV page, a channel watch page, and a video watch page.
const ViewerStats = ({ id, className = "" }) => {
  const { online, views } = useViewerStats(id);

  return (
    <div className={`flex shrink-0 flex-col gap-1 ${className}`}>
      <span className="flex items-center gap-1.5 text-[11px] text-[#aeb4b6] sm:text-xs">
        <Eye className="h-4 w-4 shrink-0 text-[#ff2d6f]" />
        <span className="font-bold text-white">{formatOnline(online)}</span>
        Online Today
      </span>

      <span className="flex items-center gap-1.5 text-[11px] text-[#aeb4b6] sm:text-xs">
        <BarChart3 className="h-4 w-4 shrink-0 text-[#ff2d6f]" />
        <span className="font-bold text-white">{formatViews(views)}</span>
        Views
      </span>
    </div>
  );
};

export default ViewerStats;

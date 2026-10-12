import React from "react";

import { STUDIO_URL } from "../../api/axios";
import { openStudio } from "../../utils/handoff";

// A link into PipraTube Studio. It's a real link (so it can be opened in a
// new tab), but a normal click carries the sign-in across first.
const StudioLink = ({ to = "/", onClick, children, ...rest }) => (
  <a
    href={`${STUDIO_URL}${to}`}
    onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      openStudio(to);
    }}
    {...rest}
  >
    {children}
  </a>
);

export default StudioLink;

import React from "react";

// Brand marks lucide doesn't ship — tiny inline SVGs instead of pulling
// in a whole icon library for three logos.
const Svg = ({ children, viewBox = "0 0 24 24" }) => (
  <svg viewBox={viewBox} width="18" height="18" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

export const FacebookIcon = () => (
  <Svg>
    <path d="M14 8.5V6.6c0-.8.2-1.3 1.4-1.3H17V2.2C16.7 2.1 15.7 2 14.6 2 12.2 2 10.6 3.5 10.6 6.1v2.4H8V12h2.6v10H14V12h2.7l.4-3.5H14z" />
  </Svg>
);

export const YoutubeIcon = () => (
  <Svg>
    <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1-5.8 3.1z" />
  </Svg>
);

export const TelegramIcon = () => (
  <Svg>
    <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4z" />
  </Svg>
);

export const InstagramIcon = () => (
  <Svg>
    <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM22 7.8c-.1-1.6-.4-3-1.6-4.2S17.8 2.1 16.2 2C14.6 2 9.4 2 7.8 2c-1.6.1-3 .4-4.2 1.6S2.1 6.2 2 7.8C2 9.4 2 14.6 2 16.2c.1 1.6.4 3 1.6 4.2s2.6 1.5 4.2 1.6c1.6.1 6.8.1 8.4 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.6.1-6.8 0-8.4z" />
  </Svg>
);

export const TiktokIcon = () => (
  <Svg>
    <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z" />
  </Svg>
);

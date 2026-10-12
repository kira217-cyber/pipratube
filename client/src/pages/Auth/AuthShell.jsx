import React from "react";

import { Card, Logo } from "../../components/ui/ui";

// Shared frame for the sign-in and sign-up forms.
const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="flex min-h-[70vh] items-center justify-center py-6">
    <Card className="w-full max-w-md p-6 sm:p-8">
      <div className="flex justify-center">
        <Logo className="h-12" />
      </div>
      <h1 className="mt-6 text-center text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-center text-sm text-muted">{subtitle}</p>
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </Card>
  </div>
);

export default AuthShell;

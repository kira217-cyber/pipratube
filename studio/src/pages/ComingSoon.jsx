import React from "react";
import { Link } from "react-router";
import { Hourglass } from "lucide-react";

import { Card, PageHeader } from "../components/ui/ui";

const ComingSoon = ({ title, text }) => (
  <div>
    <PageHeader title={title} />
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <span className="bg-brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl">
        <Hourglass className="h-8 w-8" />
      </span>
      <p className="mt-4 text-xl font-bold">Coming soon</p>
      <p className="mt-2 max-w-md text-sm text-muted">{text}</p>
      <Link to="/earning" className="mt-6 text-sm font-semibold text-brand">
        Go to Earning
      </Link>
    </Card>
  </div>
);

export default ComingSoon;

"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ds/Button";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()} data-print-hidden>
      Print
    </Button>
  );
}

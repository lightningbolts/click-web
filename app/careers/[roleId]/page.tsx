import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApplicationForm } from "@/components/careers/ApplicationForm";
import { findRole, OPEN_ROLES } from "@/components/careers/roles";

type Params = { roleId: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return OPEN_ROLES.map((role) => ({ roleId: role.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const role = findRole((await params).roleId);
  return role
    ? { title: `Apply: ${role.title} at Click`, description: role.summary }
    : {};
}

/** Native application for one open role (replaces the external Google Form). */
export default async function CareerApplicationPage({ params }: { params: Promise<Params> }) {
  const role = findRole((await params).roleId);
  if (!role) notFound();

  return (
    <div className="flex-1 py-12 md:py-16">
      <div className="container-page">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/careers"
            className="type-meta inline-flex items-center gap-1.5 rounded-pill font-semibold text-fg-secondary hover:text-fg"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Careers
          </Link>

          <header className="mt-6">
            <h1 className="type-title-1 font-display">{role.title}</h1>
            <p className="type-meta mt-2 text-fg-secondary">
              {role.team} · {role.location} · {role.type}
            </p>
            <p className="type-reading mt-4 text-fg-secondary">{role.summary}</p>
            <ul className="type-body mt-4 list-disc space-y-1 pl-5 text-fg-secondary">
              {role.responsibilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </header>

          <div className="mt-8">
            <ApplicationForm role={role} />
          </div>
        </div>
      </div>
    </div>
  );
}

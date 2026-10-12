import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { findRole } from '@/components/careers/roles';
import { apiError } from '@/lib/api/errors';
import {
  APPLICATION_MAX_BODY_BYTES,
  cleanText,
  HONEYPOT_FIELD,
  RESUME_TYPES,
  resumeExtension,
  validateApplication,
  validateResume,
  type ApplicationErrors,
  type ResumeExtension,
} from '@/lib/careers/application';
import { RESUME_BUCKET } from '@/lib/server/careers';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  CAREERS_APPLY_RATE_LIMIT,
  CAREERS_APPLY_RATE_LIMIT_BINDING,
  CAREERS_APPLY_RATE_WINDOW_MS,
  isRateLimited,
} from '@/lib/server/rateLimit';
import { publicRoute } from '@/lib/server/withAuth';

export { publicRoute };

const SIGNATURES: Record<ResumeExtension, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP container
  doc: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE compound file
};

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function invalid(fields: ApplicationErrors): NextResponse {
  return NextResponse.json(
    { error: 'Some answers need another look.', code: 'validation_error', fields },
    { status: 400 },
  );
}

async function hasSignature(file: File, ext: ResumeExtension): Promise<boolean> {
  const expected = SIGNATURES[ext];
  const head = new Uint8Array(await file.slice(0, expected.length).arrayBuffer());
  return expected.every((byte, i) => head[i] === byte);
}

function displayName(fileName: string, ext: ResumeExtension): string {
  const base = cleanText(fileName.split(/[\\/]/).pop() ?? '').slice(0, 200);
  return base || `resume.${ext}`;
}

/**
 * Anonymous careers application (multipart). Validates every answer and the resume's bytes,
 * stores the resume privately, then the row; a failed insert removes the upload. Answers are
 * never echoed back, so a failed request leaves the applicant's form exactly as it was.
 */
export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > APPLICATION_MAX_BODY_BYTES) {
    return apiError('That upload is too large. Resumes can be up to 10 MB.', 413, 'too_large');
  }

  if (
    await isRateLimited({
      bindingName: CAREERS_APPLY_RATE_LIMIT_BINDING,
      key: `careers:${clientIp(request)}`,
      limit: CAREERS_APPLY_RATE_LIMIT,
      windowMs: CAREERS_APPLY_RATE_WINDOW_MS,
    })
  ) {
    return apiError('Too many attempts. Wait a minute and try again.', 429, 'rate_limited', {
      'Retry-After': '60',
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('We could not read that submission. Try again.', 400, 'invalid_body');
  }

  // Bots fill every input; people never see this one. Answer as if it worked.
  const honeypot = form.get(HONEYPOT_FIELD);
  if (typeof honeypot === 'string' && honeypot.trim()) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const position = form.get('position');
  const role = typeof position === 'string' ? findRole(position) : undefined;
  if (!role) return apiError('This role is no longer open.', 404, 'role_closed');

  const answers = validateApplication(form, role, new Date());
  const resume = form.get('resume');
  const file = resume instanceof File ? resume : null;
  const resumeError = validateResume(file);
  if (!answers.ok || resumeError) {
    return invalid({ ...(answers.ok ? {} : answers.errors), ...(resumeError ? { resume: resumeError } : {}) });
  }
  const ext = resumeExtension(file!.name)!;
  if (!(await hasSignature(file!, ext))) {
    return invalid({ resume: "That file doesn't look like a PDF or Word document. Export it again and retry." });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return apiError('Applications are temporarily unavailable. Try again soon.', 503, 'service_unavailable');
  }

  const alreadyApplied = () =>
    apiError(
      `We already have an application from ${answers.value.email} for this role. Email us if you need to update it.`,
      409,
      'already_applied',
    );

  // Cheap check first so a repeat submission doesn't upload the resume again; the unique
  // index below still decides races.
  const { data: existing, error: lookupError } = await admin
    .from('job_applications')
    .select('id')
    .eq('position', role.id)
    .eq('email', answers.value.email)
    .maybeSingle();
  if (lookupError) {
    console.error('Careers application lookup failed:', lookupError.message);
    return apiError('Something went wrong on our side. Try again.', 500, 'internal_error');
  }
  if (existing) return alreadyApplied();

  const id = randomUUID();
  const path = `${role.id}/${id}.${ext}`;
  const contentType = RESUME_TYPES[ext];
  const upload = await admin.storage
    .from(RESUME_BUCKET)
    .upload(path, file!, { contentType, upsert: false, cacheControl: 'private, max-age=0' });
  if (upload.error) {
    console.error('Careers resume upload failed:', upload.error.message);
    return apiError('We could not save your resume. Try again.', 502, 'upload_failed');
  }

  const { error: insertError } = await admin.from('job_applications').insert({
    id,
    position: role.id,
    ...answers.value,
    resume_path: path,
    resume_name: displayName(file!.name, ext),
    resume_type: contentType,
    resume_size: file!.size,
  });
  if (insertError) {
    await admin.storage.from(RESUME_BUCKET).remove([path]);
    if (insertError.code === '23505') return alreadyApplied();
    console.error('Careers application insert failed:', insertError.message);
    return apiError('Something went wrong on our side. Try again.', 500, 'internal_error');
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

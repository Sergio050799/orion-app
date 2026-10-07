import fs from 'fs';
import path from 'path';

export async function GET() {
  let buildId = 'unknown';
  try {
    buildId = fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch { /* local dev sin .next */ }

  return Response.json({
    commit: '9bbd3d2',
    buildId,
    checked: new Date().toISOString(),
  });
}

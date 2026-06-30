import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const IMAGES_PATH = path.join(VAULT_PATH, 'images');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filePath = path.join(IMAGES_PATH, filename);

  // 安全检查：防止 ../ 路径遍历攻击
  if (!filePath.startsWith(IMAGES_PATH)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

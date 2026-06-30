import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const IMAGES_PATH = path.join(VAULT_PATH, 'images');

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return Response.json({ error: '未选择文件' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const filename = `${hash}.${ext}`;
  const filePath = path.join(IMAGES_PATH, filename);

  // 如果图片已存在，直接返回
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }

  return Response.json({ filename, url: `/api/images/${encodeURIComponent(filename)}` });
}

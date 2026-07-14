import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { getQuestionByQid, parseSections, QuestionMetaLight } from '@/lib/questions';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const IMAGES_DIR = path.join(VAULT_PATH, 'images');

// 异步执行命令
function execPandoc(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        console.log(`执行 Pandoc: ${cmd} ${args.join(' ')}`);
        execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
            if (err) {
                console.error('Pandoc 错误:', stderr || err.message);
                return reject(err);
            }
            if (stderr) {
                console.warn('Pandoc 警告:', stderr);
            }
            resolve(stdout);
        });
    });
}

// 自动检测 Pandoc 路径
function findPandoc(): string {
    // 1. 检查环境变量
    if (process.env.PANDOC_PATH) {
        let envPath = process.env.PANDOC_PATH;

        // 如果路径不包含 .exe，自动添加
        if (!envPath.endsWith('.exe')) {
            envPath = path.join(envPath, 'pandoc.exe');
        }

        if (fs.existsSync(envPath)) {
            console.log('✅ 使用环境变量 PANDOC_PATH:', envPath);
            return envPath;
        }
        console.warn('⚠️ 环境变量 PANDOC_PATH 指向的路径不存在:', envPath);
    }

    // 2. 检查项目内的 Pandoc（相对路径）
    const projectPandocPaths = [
        path.join(process.cwd(), 'src', 'tool', 'pandoc-3.10', 'pandoc.exe'),
        path.join(process.cwd(), 'tool', 'pandoc-3.10', 'pandoc.exe'),
        path.join(process.cwd(), 'tools', 'pandoc', 'pandoc.exe'),
    ];

    for (const p of projectPandocPaths) {
        if (fs.existsSync(p)) {
            console.log('✅ 找到项目内的 Pandoc:', p);
            return p;
        }
    }

    // 3. 检查常见安装路径（Windows）
    const commonPaths = [
        'C:\\Program Files\\Pandoc\\pandoc.exe',
        'C:\\Program Files (x86)\\Pandoc\\pandoc.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Pandoc\\pandoc.exe'),
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log('✅ 自动检测到 Pandoc:', p);
            return p;
        }
    }

    // 4. 尝试系统 PATH 中的 pandoc
    console.log('🔍 使用系统 PATH 中的 pandoc');
    return 'pandoc';
}

// POST: 直接生成并返回 docx 文件
export async function POST(req: NextRequest) {
    try {
        const { qids } = await req.json();

        if (!Array.isArray(qids) || qids.length === 0) {
            return Response.json({ error: '请提供题目 qid 列表' }, { status: 400 });
        }

        // 检测 Pandoc 是否可用
        const pandocPath = findPandoc();

        // 验证 Pandoc 是否可用
        try {
            await execPandoc(pandocPath, ['--version'], process.cwd());
            console.log('✅ Pandoc 验证通过:', pandocPath);
        } catch (error) {
            console.error('❌ Pandoc 不可用:', error);
            return Response.json({
                error: 'Pandoc 未安装或不可用',
                pandocPath: pandocPath,
                hint: '请安装 Pandoc 或将其放到项目的 src/tool/pandoc-3.10/ 目录下'
            }, { status: 500 });
        }

        // 读取题目 & 解析内容
        const questions: QuestionMetaLight[] = [];
        const sectionsMap: Record<number, Record<string, string>> = {};

        for (const qid of qids) {
            const q = getQuestionByQid(Number(qid));
            if (q) {
                questions.push({
                    qid: q.qid,
                    grade: q.grade,
                    source: q.source,
                    number: q.number,
                    type: q.type,
                    exam_type: q.exam_type,
                    filePath: q.filePath,
                    difficulty: q.difficulty,
                    knowledge: q.knowledge,
                    tags: q.tags,
                });
                sectionsMap[q.qid] = parseSections(q.content);
            }
        }

        if (questions.length === 0) {
            return Response.json({ error: '未找到任何题目' }, { status: 404 });
        }

        // ===== 图片重命名逻辑 =====
        const imageMap = new Map<string, string>();
        const imgCounter = new Map<number, number>();

        const convertImages = (text: string, questionNum: number): string => {
            const mapImage = (hashFilename: string): string => {
                if (imageMap.has(hashFilename)) {
                    return `![](${imageMap.get(hashFilename)})`;
                }
                const ext = hashFilename.split('.').pop() || 'jpg';
                const count = imgCounter.get(questionNum) || 0;
                const newCount = count + 1;
                imgCounter.set(questionNum, newCount);
                const newName = `${questionNum}-${newCount}.${ext}`;
                imageMap.set(hashFilename, newName);
                return `![](${newName})`;
            };

            text = text.replace(/!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/g, (_, hash: string) => mapImage(hash));
            text = text.replace(/!\[[^\]]*\]\(images\/([^)]+)\)/g, (_, hash: string) => mapImage(hash));
            return text;
        };

        // 生成标准 Markdown
        const mdLines: string[] = [];
        questions.forEach((q, i) => {
            const s = sectionsMap[q.qid];
            const num = i + 1;
            imgCounter.clear();

            if (!s?.['题目']) {
                mdLines.push(`${num}. （内容加载失败）\n`);
                return;
            }

            let questionText = s['题目'];
            const type = q.type || '';
            const isMultiSelect = type === '多选题' || questionText.includes('[多选]');
            const isSingleSelect = type === '单选题' || questionText.includes('[选]');
            const isFillIn = type === '填空题' || questionText.includes('[填]');
            const numberPrefix = isMultiSelect ? `${num}.(多选)` : `${num}.`;

            questionText = questionText
                .replace(/\[多选\]/g, '')
                .replace(/\[选\]/g, '')
                .replace(/\[填\]/g, '____')
                .trim();

            if ((isSingleSelect || isMultiSelect) && !questionText.endsWith('()')) {
                questionText += '()';
            }

            questionText = convertImages(questionText, num);

            const lines: string[] = [];
            lines.push(`${numberPrefix} ${questionText}`);

            if ((isSingleSelect || isMultiSelect) && s['选项']) {
                lines.push(convertImages(s['选项'], num));
            }
            if (s['答案']) {
                lines.push(`【答案】${convertImages(s['答案'], num)}`);
            }

            lines.push(`【来源】${q.source}${q.number}`);

            if (s['我的备注']) {
                lines.push(`【备注】${convertImages(s['我的备注'], num)}`);
            }
            const aiNote = s['AI 备注'] || s['AI备注'];
            if (aiNote) {
                lines.push(`【AI备注】${convertImages(aiNote, num)}`);
            }
            if (s['解析']) {
                lines.push(`【解析】${convertImages(s['解析'], num)}`);
            }

            mdLines.push(lines.join('\n') + '\n\n');
        });

        const mdContent = mdLines.join('\n');

        // ===== 创建临时目录 =====
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandoc-'));
        console.log('📁 临时目录:', tmpDir);

        try {
            // 写入临时 md 文件
            const mdPath = path.join(tmpDir, '讲义.md');
            fs.writeFileSync(mdPath, mdContent, 'utf-8');

            // 复制图片到临时目录
            for (const [hashFilename, newName] of imageMap) {
                const imgSrc = path.join(IMAGES_DIR, hashFilename);
                const imgDst = path.join(tmpDir, newName);
                if (fs.existsSync(imgSrc)) {
                    fs.copyFileSync(imgSrc, imgDst);
                } else {
                    console.warn('⚠️ 图片未找到:', hashFilename);
                }
            }

            // ===== Pandoc 生成 docx =====
            const docxPath = path.join(tmpDir, '讲义.docx');

            console.log('📄 开始生成 Word 文档...');
            await execPandoc(pandocPath, [
                mdPath,
                '--resource-path', tmpDir,
                '-o', docxPath,
                '-f', 'markdown+tex_math_dollars',
                '-t', 'docx',
            ], tmpDir);

            console.log('✅ Word 文档生成成功');

            // 读取生成的 docx 文件
            const fileBuffer = fs.readFileSync(docxPath);

            // 生成纯英文文件名（避免编码问题）
            const now = new Date();
            const ts = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0'),
                String(now.getHours()).padStart(2, '0'),
                String(now.getMinutes()).padStart(2, '0'),
                String(now.getSeconds()).padStart(2, '0'),
            ].join('');
            const fileName = `ExamBasket_${ts}.docx`;

            // 直接返回文件
            return new Response(fileBuffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                },
            });

        } finally {
            // 清理临时目录
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                console.log('🧹 临时目录已清理');
            } catch (cleanupError) {
                console.warn('⚠️ 清理临时目录失败:', cleanupError);
            }
        }

    } catch (e: any) {
        console.error('❌ docx 导出错误:', e);
        return Response.json({
            error: e.message || '导出失败',
            suggestion: '请检查 Pandoc 是否正确安装'
        }, { status: 500 });
    }
}
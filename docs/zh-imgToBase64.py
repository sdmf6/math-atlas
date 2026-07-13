#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Markdown 本地图片批量转 Base64 内嵌脚本
# 适配 EduEditer 导入、保存 wsd 图片不丢失
# 功能：自动过滤 http/https 在线图片，仅转换本地图片

# ====================== 【只需修改此处】你的MD文件名(含后缀) ======================
from io import BytesIO
from PIL import Image
import base64
import os
import re
MD_NAME = "讲义.md"
# ==============================================================================


# 支持的图片后缀
SUPPORT_IMG_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp")
# 图片最大限制 3MB (适配EE加载卡顿问题)
MAX_IMG_SIZE = 3 * 1024 * 1024


def image_to_base64(img_path: str) -> str | None:
    """
    本地图片转Base64字符串
    压缩超大图片、限制尺寸，适配EduEditer渲染
    """
    try:
        # 读取图片文件大小
        file_size = os.path.getsize(img_path)
        if file_size > MAX_IMG_SIZE:
            print(f"[警告] 图片超过3MB，自动压缩：{img_path}")

        # 打开图片
        with Image.open(img_path) as img:
            # 统一转为RGB，兼容透明png、gif
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # 压缩处理
            buffer = BytesIO()
            # JPEG质量85，平衡体积和清晰度
            img.save(buffer, format="JPEG", quality=85, optimize=True)
            buffer.seek(0)
            base64_str = base64.b64encode(buffer.read()).decode("utf-8")
            return f"data:image/jpeg;base64,{base64_str}"
    except Exception as e:
        print(f"[错误] 图片转换失败 {img_path}：{str(e)}")
        return None


def convert_md_local_img_to_base64(md_file_path: str):
    """
    解析MD文件，批量替换本地图片为Base64
    忽略 http/https 在线图片链接
    """
    if not os.path.exists(md_file_path):
        print(f"[错误] 未找到文件：{md_file_path}")
        return

    # 读取原始MD内容
    with open(md_file_path, "r", encoding="utf-8") as f:
        md_content = f.read()

    # 正则匹配MD图片语法：![alt](图片路径)
    # 排除 http/https 开头的在线链接
    img_pattern = re.compile(r'!\[(.*?)\]\((?!http|https)(.*?)\)')
    match_list = img_pattern.findall(md_content)

    if not match_list:
        print("[提示] 未检测到本地图片，无需转换")
        # 生成空改动文件，避免报错
        out_name = f"embed_base64_{os.path.basename(md_file_path)}"
        with open(out_name, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f"[完成] 已生成无改动文件：{out_name}")
        return

    print(f"[检测到] 共 {len(match_list)} 张本地图片待转换")
    success_count = 0

    for alt_text, img_rel_path in match_list:
        # 拼接绝对路径（脚本与图片、MD同目录）
        md_dir = os.path.dirname(os.path.abspath(md_file_path))
        img_abs_path = os.path.join(md_dir, img_rel_path.strip())

        # 修复相对路径、./ 路径问题
        img_abs_path = os.path.abspath(img_abs_path)

        # 判断文件是否存在、是否为图片
        if not os.path.exists(img_abs_path):
            print(f"[跳过] 图片不存在：{img_rel_path}")
            continue
        if not img_abs_path.lower().endswith(SUPPORT_IMG_SUFFIX):
            print(f"[跳过] 非支持图片格式：{img_rel_path}")
            continue

        # 转换base64
        base64_data = image_to_base64(img_abs_path)
        if base64_data:
            # 替换原文图片链接
            old_str = f"![{alt_text}]({img_rel_path})"
            new_str = f"![{alt_text}]({base64_data})"
            md_content = md_content.replace(old_str, new_str)
            success_count += 1
            print(f"[成功转换] {img_rel_path}")

    # 生成新文件
    out_file_name = f"embed_base64_{os.path.basename(md_file_path)}"
    with open(out_file_name, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("\n" + "="*50)
    print(f"转换完成！成功：{success_count}/{len(match_list)}")
    print(f"输出文件：{out_file_name}")
    print("适配提示：导入EduEditer渲染完成后，保存.wsd即可永久内嵌图片，原图可删除")
    print("="*50)


if __name__ == "__main__":
    # 同目录执行
    current_path = os.path.join(os.getcwd(), MD_NAME)
    convert_md_local_img_to_base64(current_path)
    input("\n按回车键退出...")

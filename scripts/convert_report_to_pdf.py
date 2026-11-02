#!/usr/bin/env python3
"""
SyncTube Report Docx to PDF Converter
Converts SyncTube_Project_Report.docx to high-quality publication PDF
with academic print stylesheet, page breaks, tables, and figures.
"""

import os
import sys
import re
import subprocess
import mammoth

def convert_docx_to_pdf(docx_path, pdf_path):
    print(f"Reading docx from {docx_path}...")
    with open(docx_path, 'rb') as f:
        raw_html = mammoth.convert_to_html(f).value

    css = '''
    @page {
        size: A4 portrait;
        margin: 25mm 20mm 20mm 25mm;
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 12pt;
        line-height: 1.4;
        color: #111111;
        margin: 0;
        padding: 0;
        background: #ffffff;
    }

    p {
        margin: 0 0 8pt 0;
        text-align: justify;
        line-height: 1.45;
    }

    .cover-page {
        text-align: center;
        page-break-after: always;
        padding-top: 10mm;
    }

    .chapter-header {
        text-align: center;
        margin-top: 25pt;
        margin-bottom: 20pt;
        page-break-before: always;
        break-before: page;
    }

    .chapter-num {
        font-size: 16pt;
        font-weight: bold;
        color: #1a365d;
        margin-bottom: 4pt;
    }

    .chapter-title {
        font-size: 16pt;
        font-weight: bold;
        color: #1a365d;
        text-transform: uppercase;
        margin-bottom: 20pt;
    }

    .section-title {
        font-size: 14pt;
        font-weight: bold;
        color: #1a365d;
        margin-top: 16pt;
        margin-bottom: 6pt;
        page-break-after: avoid;
        break-after: avoid;
    }

    .sub-section-title {
        font-size: 12.5pt;
        font-weight: bold;
        color: #2b5c8f;
        margin-top: 12pt;
        margin-bottom: 4pt;
        page-break-after: avoid;
        break-after: avoid;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: 12pt 0;
        page-break-inside: avoid;
        break-inside: avoid;
        font-size: 10.5pt;
    }

    table th, table tr:first-child td {
        background-color: #2B5C8F !important;
        color: #ffffff !important;
        font-weight: bold;
        text-align: center;
        padding: 8px 10px;
        border: 1px solid #1a365d;
    }

    table th p, table tr:first-child td p {
        color: #ffffff !important;
        font-weight: bold;
        text-align: center;
        margin: 0;
    }

    table tr:first-child td strong {
        color: #ffffff !important;
    }

    table td {
        padding: 6px 10px;
        border: 1px solid #B0C4DE;
        vertical-align: middle;
    }

    table tr:nth-child(even):not(:first-child) td {
        background-color: #F4F7FA;
    }

    table p {
        margin: 0;
        text-align: center;
    }

    table tr td:first-child p {
        text-align: left;
    }

    p.source-note {
        text-align: right;
        font-size: 9.5pt;
        font-style: italic;
        color: #666666;
        margin-top: 2pt;
        margin-bottom: 8pt;
    }

    img {
        max-width: 92%;
        height: auto;
        display: block;
        margin: 10pt auto 4pt auto;
        border-radius: 4px;
    }

    .figure-caption {
        text-align: center;
        font-size: 10.5pt;
        font-weight: bold;
        font-style: italic;
        color: #444444;
        margin-top: 4pt;
        margin-bottom: 14pt;
        page-break-before: avoid;
        break-before: avoid;
    }

    ul {
        margin: 4pt 0 8pt 20pt;
        padding: 0;
    }

    li {
        margin-bottom: 4pt;
        line-height: 1.4;
        text-align: justify;
    }
    '''

    processed_html = raw_html
    processed_html = re.sub(
        r'<p><strong>CHAPTER – (\d+)</strong></p>\s*<p><strong>([^<]+)</strong></p>',
        r'<div class="chapter-header"><div class="chapter-num">CHAPTER – \1</div><div class="chapter-title">\2</div></div>',
        processed_html
    )

    for sec in ['ABSTRACT', 'ACKNOWLEDGEMENT', 'DECLARATION', 'INDEX']:
        processed_html = re.sub(
            rf'<p><strong>{sec}</strong></p>',
            rf'<div class="chapter-header"><div class="chapter-title">{sec}</div></div>',
            processed_html
        )

    processed_html = re.sub(r'<p><strong>(\d+\.\d+ [^<]+)</strong></p>', r'<div class="section-title">\1</div>', processed_html)
    processed_html = re.sub(r'<p><strong>(\d+\.\d+\.\d+ [^<]+)</strong></p>', r'<div class="sub-section-title">\1</div>', processed_html)
    processed_html = re.sub(r'<p><strong>(Table [^:]+:[^<]+)</strong></p>', r'<div class="section-title" style="font-size: 11.5pt;">\1</div>', processed_html)
    processed_html = re.sub(r'<p><em><strong>(Figure [^<]+)</strong></em></p>', r'<div class="figure-caption">\1</div>', processed_html)
    processed_html = re.sub(r'<p><em><strong>(Chart [^<]+)</strong></em></p>', r'<div class="figure-caption">\1</div>', processed_html)
    processed_html = re.sub(r'<p><em>\((Source: Primary Survey Data[^\)]+)\)</em></p>', r'<p class="source-note">(\1)</p>', processed_html)

    tmp_html = '/tmp/report_styled.html'
    full_html = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>SyncTube Project Report</title>
<style>{css}</style>
</head>
<body>
{processed_html}
</body>
</html>
'''
    with open(tmp_html, 'w', encoding='utf-8') as f:
        f.write(full_html)

    cmd = [
        'google-chrome',
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--run-all-compositor-stages-before-draw',
        f'--print-to-pdf={pdf_path}',
        '--no-pdf-header-footer',
        tmp_html
    ]
    subprocess.run(cmd, check=True)
    print(f"PDF successfully created at {pdf_path}")

if __name__ == '__main__':
    in_docx = sys.argv[1] if len(sys.argv) > 1 else '/home/krishna/Downloads/SyncTube_Project_Report.docx'
    out_pdf = sys.argv[2] if len(sys.argv) > 2 else '/home/krishna/Downloads/SyncTube_Project_Report.pdf'
    convert_docx_to_pdf(in_docx, out_pdf)


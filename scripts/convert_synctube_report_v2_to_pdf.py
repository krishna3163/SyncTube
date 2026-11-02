#!/usr/bin/env python3
"""
SyncTube Report HTML & PDF Generator (v2.1)
Converts SyncTube_Project_Report.docx into a publication-quality PDF
with clean white cover page, side-by-side logos, professional typography,
and a concise 1-page Table of Contents.
"""

import os
import sys
import re
import subprocess
import mammoth

def convert_report_to_pdf(docx_path, pdf_path):
    print(f"Reading docx from {docx_path}...")
    with open(docx_path, 'rb') as f:
        raw_html = mammoth.convert_to_html(f).value

    css = '''
    @page {
        size: A4 portrait;
        margin: 20mm 18mm 20mm 22mm;
        @bottom-center {
            content: counter(page);
            font-family: 'Times New Roman', Times, serif;
            font-size: 10pt;
            color: #555555;
        }
    }

    @page :first {
        margin-top: 15mm;
        margin-bottom: 15mm;
        @bottom-center {
            content: none;
        }
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 11.5pt;
        line-height: 1.42;
        color: #111111;
        margin: 0;
        padding: 0;
        background: #ffffff;
    }

    p {
        margin: 0 0 7pt 0;
        text-align: justify;
        line-height: 1.42;
    }

    /* Cover Page */
    .cover-page {
        text-align: center;
        page-break-after: always;
        break-after: page;
        padding-top: 2mm;
        background: #ffffff !important;
    }

    .cover-page h1 {
        font-size: 16pt;
        font-weight: bold;
        color: #1a365d;
        margin: 8pt 0 12pt 0;
        line-height: 1.3;
        text-align: center;
    }

    .cover-page h2 {
        font-size: 13.5pt;
        font-weight: bold;
        margin: 3pt 0;
        text-align: center;
    }

    .cover-page h3 {
        font-size: 11.5pt;
        font-weight: bold;
        margin: 2pt 0;
        text-align: center;
    }

    .cover-page p {
        text-align: center;
        margin: 3pt 0;
    }

    .cover-logos-container {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 45px;
        margin: 16pt auto;
        background: transparent !important;
    }

    .cover-logos-container img {
        max-height: 105px;
        width: auto;
        display: inline-block;
        margin: 0;
        background: transparent !important;
        border: none !important;
    }

    .cover-details-container {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        width: 100%;
        margin-top: 24pt;
        margin-bottom: 12pt;
        background: transparent !important;
    }

    .submitted-by-box {
        text-align: left;
        width: 48%;
    }

    .submitted-by-box p {
        text-align: left;
        margin: 2pt 0;
        font-size: 10.5pt;
        line-height: 1.35;
    }

    .guided-by-box {
        text-align: right;
        width: 48%;
    }

    .guided-by-box p {
        text-align: right;
        margin: 2pt 0;
        font-size: 10.5pt;
        line-height: 1.35;
    }

    /* Chapter & Section Breaks */
    .chapter-header {
        text-align: center;
        margin-top: 20pt;
        margin-bottom: 18pt;
        page-break-before: always;
        break-before: page;
    }

    .chapter-num {
        font-size: 15pt;
        font-weight: bold;
        color: #1a365d;
        margin-bottom: 4pt;
        text-align: center;
    }

    .chapter-title {
        font-size: 15pt;
        font-weight: bold;
        color: #1a365d;
        text-transform: uppercase;
        margin-bottom: 16pt;
        text-align: center;
    }

    .section-title {
        font-size: 13pt;
        font-weight: bold;
        color: #1a365d;
        margin-top: 14pt;
        margin-bottom: 5pt;
        page-break-after: avoid;
        break-after: avoid;
        text-align: left;
    }

    .sub-section-title {
        font-size: 12pt;
        font-weight: bold;
        color: #2b5c8f;
        margin-top: 10pt;
        margin-bottom: 4pt;
        page-break-after: avoid;
        break-after: avoid;
        text-align: left;
    }

    /* Table of Contents */
    table.toc-table {
        width: 100%;
        border-collapse: collapse;
        margin: 14pt 0 10pt 0;
        page-break-inside: avoid;
        break-inside: avoid;
        font-size: 10.5pt;
    }

    table.toc-table tr:first-child td {
        background-color: #2B5C8F !important;
        color: #ffffff !important;
        font-weight: bold;
        padding: 7px 10px;
        border: 1px solid #1a365d;
    }

    table.toc-table tr:first-child td p {
        color: #ffffff !important;
        font-weight: bold;
        text-align: center;
        margin: 0;
    }

    table.toc-table td {
        padding: 6.5px 10px;
        border-bottom: 1px solid #D0DCE8;
        border-top: none;
        border-left: none;
        border-right: none;
    }

    table.toc-table tr:nth-child(even):not(:first-child) td {
        background-color: #F8FAFC;
    }

    table.toc-table td:nth-child(1) p { text-align: center; font-weight: bold; }
    table.toc-table td:nth-child(2) p { text-align: left; }
    table.toc-table td:nth-child(3) p { text-align: center; font-weight: bold; }

    /* Data Tables */
    table.data-table {
        width: 100%;
        border-collapse: collapse;
        margin: 10pt 0 4pt 0;
        page-break-inside: avoid;
        break-inside: avoid;
        font-size: 10pt;
    }

    table.data-table th, table.data-table tr:first-child td {
        background-color: #2B5C8F !important;
        color: #ffffff !important;
        font-weight: bold;
        text-align: center;
        padding: 7px 9px;
        border: 1px solid #1a365d;
    }

    table.data-table th p, table.data-table tr:first-child td p {
        color: #ffffff !important;
        font-weight: bold;
        text-align: center;
        margin: 0;
    }

    table.data-table tr:first-child td strong {
        color: #ffffff !important;
    }

    table.data-table td {
        padding: 6px 9px;
        border: 1px solid #B0C4DE;
        vertical-align: middle;
    }

    table.data-table tr:nth-child(even):not(:first-child) td {
        background-color: #F4F7FA;
    }

    table.data-table p {
        margin: 0;
        text-align: center;
    }

    table.data-table tr td:first-child p {
        text-align: left;
    }

    p.table-title {
        font-size: 11pt;
        font-weight: bold;
        color: #1a365d;
        margin-top: 12pt;
        margin-bottom: 3pt;
        page-break-after: avoid;
        break-after: avoid;
        text-align: left;
    }

    p.source-note {
        text-align: right;
        font-size: 9pt;
        font-style: italic;
        color: #666666;
        margin-top: 2pt;
        margin-bottom: 8pt;
    }

    /* Images & Figures */
    img {
        max-width: 90%;
        height: auto;
        display: block;
        margin: 8pt auto 3pt auto;
        border-radius: 4px;
    }

    .figure-caption {
        text-align: center;
        font-size: 9.5pt;
        font-weight: bold;
        font-style: italic;
        color: #444444;
        margin-top: 3pt;
        margin-bottom: 12pt;
        page-break-before: avoid;
        break-before: avoid;
    }

    /* Lists */
    ul {
        margin: 3pt 0 7pt 18pt;
        padding: 0;
    }

    li {
        margin-bottom: 3pt;
        line-height: 1.4;
        text-align: justify;
    }
    '''

    tables = re.findall(r'<table.*?</table>', raw_html, flags=re.DOTALL)
    logo_table_html = tables[0] if len(tables) > 0 else ''
    details_table_html = tables[1] if len(tables) > 1 else ''
    toc_table_html = tables[2] if len(tables) > 2 else ''

    img_srcs = re.findall(r'src=\"([^\"]+)\"', logo_table_html)
    logo_div = '<div class="cover-logos-container">'
    for src in img_srcs:
        logo_div += f'<img src="{src}" />'
    logo_div += '</div>'

    details_div = '''
    <div class="cover-details-container">
      <div class="submitted-by-box">
        <p><strong>Submitted By:</strong></p>
        <p><strong>Krishna Kumar</strong> (2303630100089)</p>
        <p><strong>Hareram Yadav</strong> (2303630100073)</p>
        <p><strong>B.Tech, CSE – Section 4A</strong></p>
        <p><strong>Batch: 2026–2027</strong></p>
      </div>
      <div class="guided-by-box">
        <p><strong>Under the Guidance of:</strong></p>
        <p style="color: #1a365d; font-size: 11pt;"><strong>MRS. SHIVANGI PANDEY</strong></p>
        <p>Assistant Professor</p>
        <p>Department of Computer Science &amp; Engineering</p>
        <p>Ambalika Institute of Management &amp; Technology</p>
      </div>
    </div>
    '''

    processed_html = raw_html
    processed_html = processed_html.replace(logo_table_html, logo_div)
    processed_html = processed_html.replace(details_table_html, details_div)

    toc_styled = toc_table_html.replace('<table>', '<table class="toc-table">')
    processed_html = processed_html.replace(toc_table_html, toc_styled)

    processed_html = processed_html.replace('<table>', '<table class="data-table">')

    # Format chapter headers
    processed_html = re.sub(
        r'<p><strong>CHAPTER – (\d+)</strong></p>\s*<p><strong>([^<]+)</strong></p>',
        r'<div class="chapter-header"><div class="chapter-num">CHAPTER – \1</div><div class="chapter-title">\2</div></div>',
        processed_html
    )

    for sec in ['DECLARATION', 'ACKNOWLEDGEMENT', 'ABSTRACT', 'TABLE OF CONTENTS']:
        processed_html = re.sub(
            rf'<p><strong>{sec}</strong></p>',
            rf'<div class="chapter-header"><div class="chapter-title">{sec}</div></div>',
            processed_html
        )

    processed_html = re.sub(r'<p><strong>(\d+\.\d+ [^<]+)</strong></p>', r'<div class="section-title">\1</div>', processed_html)
    processed_html = re.sub(r'<p><strong>(\d+\.\d+\.\d+ [^<]+)</strong></p>', r'<div class="sub-section-title">\1</div>', processed_html)
    processed_html = re.sub(r'<p><strong>(Table [^:]+:[^<]+)</strong></p>', r'<p class="table-title">\1</p>', processed_html)
    processed_html = re.sub(r'<p><em><strong>(Figure [^<]+)</strong></em></p>', r'<div class="figure-caption">\1</div>', processed_html)
    processed_html = re.sub(r'<p><em><strong>(Chart [^<]+)</strong></em></p>', r'<div class="figure-caption">\1</div>', processed_html)
    processed_html = re.sub(r'<p><em>\((Source: [^\)]+)\)</em></p>', r'<p class="source-note">(\1)</p>', processed_html)

    # Wrap cover page cleanly
    cover_cutoff = processed_html.find('<div class="chapter-header"><div class="chapter-title">DECLARATION</div></div>')
    if cover_cutoff != -1:
        cover_part = processed_html[:cover_cutoff]
        rest_part = processed_html[cover_cutoff:]
        processed_html = f'<div class="cover-page">{cover_part}</div>{rest_part}'

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

    tmp_html = '/tmp/report_v2_final.html'
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
    print(f"PDF successfully created at: {pdf_path}")

if __name__ == '__main__':
    in_docx = sys.argv[1] if len(sys.argv) > 1 else '/home/krishna/Downloads/SyncTube_Project_Report.docx'
    out_pdf = sys.argv[2] if len(sys.argv) > 2 else '/home/krishna/Downloads/SyncTube_Project_Report.pdf'
    convert_report_to_pdf(in_docx, out_pdf)


# -*- coding: utf-8 -*-
"""Preview a pko-tab with the app's own CSS, so a layout can be looked at."""
import json, io, os, re, sys, html

APP = 'V:/06_App/ProjectKO'
OUT = os.environ.get('TEMP', '.').replace('\\', '/') + '/tab-preview.html'

def md(text):
    """The markdown subset the tab bodies use: paragraphs, lists, tables, bold, italic, code."""
    if not text:
        return ''
    blocks = []
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            head, body = rows[0], rows[2:] if len(rows) > 1 and set(rows[1][0]) <= set('-: ') else rows[1:]
            out = ['<table><thead><tr>' + ''.join('<th>%s</th>' % inline(c) for c in head) + '</tr></thead><tbody>']
            for row in body:
                out.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in row) + '</tr>')
            out.append('</tbody></table>')
            blocks.append(''.join(out))
            continue
        if line.startswith('- '):
            items = []
            while i < len(lines) and lines[i].startswith('- '):
                items.append('<li>%s</li>' % inline(lines[i][2:].strip()))
                i += 1
            blocks.append('<ul>' + ''.join(items) + '</ul>')
            continue
        if line.strip():
            para = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith('|') and not lines[i].startswith('- '):
                para.append(lines[i].strip())
                i += 1
            blocks.append('<p>%s</p>' % inline(' '.join(para)))
            continue
        i += 1
    return '\n'.join(blocks)

def inline(text):
    out = html.escape(text)
    out = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', out)
    out = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<em>\1</em>', out)
    out = re.sub(r'`(.+?)`', r'<code>\1</code>', out)
    return out

def build(path, title):
    doc = json.load(io.open(path, encoding='utf-8'))
    nodes = doc['nodes']
    runs = []
    for node in nodes:
        if node['kind'] == 'section':
            runs.append({'section': node, 'cards': []})
        elif runs:
            runs[-1]['cards'].append(node)
    cards = [n for n in nodes if n['kind'] == 'card']
    parts = ['<!DOCTYPE html><html data-workspace-theme><head><meta charset="utf-8"/>',
             '<title>' + title + '</title>',
             '<link rel="stylesheet" href="file:///' + APP + '/src/components/documents.css"/>',
             '<link rel="stylesheet" href="file:///' + APP + '/src/styles/editable-cards.css"/>',
             '<style>:root{--bg:#101115;--bg-deep:#0c0c10;--surface-1:#18191f;--surface-2:#25232b;'
             '--surface-solid:#141419;--text:#d3d0d9;--text-bright:#f1edf4;--text-dim:#a29baa;'
             '--text-muted:#77727f;--pink:#efa2b4;--pink-bright:#ffc2cf;--pink-dim:#efa2b412;'
             '--green:#78c69d;--amber:#d6b573;--blue:#91b7df;--hairline:#ffffff12;--hairline-strong:#ffffff20;'
             '--font-body:system-ui,sans-serif;--font-mono:ui-monospace,monospace}'
             'body{margin:0;background:var(--bg)}'
             '.tab-section h2{margin:30px 0 8px;font-size:19px;font-weight:600;color:var(--text-bright);letter-spacing:-.02em}'
             '.tab-section-note{margin:0 0 16px;color:var(--text-dim);font-size:13.5px}'
             '.card-entry-status{font-size:10px;text-transform:uppercase;letter-spacing:.08em}'
             'table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--hairline-strong);padding:8px 10px;text-align:left;font-size:13px}'
             '</style></head><body><article class="card-content card-template-' + doc['layout'] + (' has-index' if sum(1 for n in nodes if n.get('kind') == 'section') >= 4 else '') + '">']
    parts.append('<header class="card-document-heading"><div class="card-kicker"><span>%s</span><span>%d cards</span></div>'
                 '<div class="card-prose card-introduction">%s</div></header>'
                 % (doc['layout'], len(cards), md(doc.get('summary'))))
    index = [r['section'] for r in runs if r['section']]
    with_index = len(index) >= 4
    if with_index:
        parts.append('<div class="card-body"><nav class="card-index"><p class="card-index-title">Sections</p>')
        for sec in index:
            parts.append('<a href="#card-section-%s" data-section="%s" class="on">%s</a>'
                         % (sec['id'], sec['id'], html.escape(sec['title'])))
        parts.append('</nav><div class="card-body-main">')
    number = 0
    for run in runs:
        parts.append('<section class="tab-run">')
        if run['section']:
            parts.append('<header class="tab-section" id="card-section-%s" data-section="%s"><h2>%s</h2><div class="card-prose tab-section-note">%s</div></header>'
                         % (run['section']['id'], run['section']['id'],
                            html.escape(run['section']['title']), md(run['section'].get('note'))))
        parts.append('<div class="card-entries">')
        for card in run['cards']:
            number += 1
            parts.append('<section class="card-entry%s">' % (' wide' if card.get('wide') else ''))
            parts.append('<div class="card-entry-copy"><div class="card-entry-meta"><span class="card-entry-number">%02d</span>%s</div>'
                         % (number, ('<span class="card-entry-status status-%s">%s</span>' % (card['status'], card['status'])) if card.get('status') else ''))
            parts.append('<h2>%s</h2>' % html.escape(card.get('title', '')))
            if card.get('body'):
                parts.append('<div class="card-prose">%s</div>' % md(card['body']))
            parts.append('</div></section>')
        parts.append('</div></section>')
    if with_index:
        parts.append('</div></div>')
    parts.append('</article></body></html>')
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
    print(OUT)

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'preview')

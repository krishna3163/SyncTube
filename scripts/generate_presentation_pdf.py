#!/usr/bin/env python3
"""
Generates high-resolution 16:9 widescreen presentation PDF from slide data.
"""

import os
import subprocess

html_path = '/tmp/presentation_slides.html'
pdf_path = '/home/krishna/Downloads/SyncTube_Project_Presentation.pdf'

slides_data = [
    {
        'title': 'SyncTube: Real-Time Synchronized Watch Party Platform',
        'sub': 'Simple Questions • Short Answers • Practical Architecture & Live Workflow',
        'is_title': True
    },
    {
        'num': '1. Problem Definition',
        'title': 'What Problem Are We Solving?',
        'sub': 'Modern video platforms are built for 1 person alone • Shared watching is broken',
        'cards': [
            {
                'head': 'THE PAIN POINTS TODAY',
                'color': '#1A365D',
                'bullets': [
                    ('Isolated Streaming:', 'YouTube and OTT platforms isolate every viewer into their own unicast stream.'),
                    ('Manual 3-2-1 Play Fails:', 'Buffer variations, network jitter, and hardware clock drift cause desynchronization within minutes.'),
                    ('Mid-Roll Commercial Ads:', 'Commercials play at different times for different users, completely breaking synchronization.'),
                    ('Algorithmic Doomscrolling:', 'Clickbait sidebars and addictive Shorts distract students trying to watch study lectures.')
                ]
            },
            {
                'head': 'HOW SYNCTUBE FIXES IT',
                'color': '#0D9488',
                'bullets': [
                    ('Authoritative Synchronization:', 'Sub-100ms playout alignment. Play, pause, and seek happen simultaneously for everyone.'),
                    ('Zero Ad Interruptions:', 'Videos play cleanly without disruptive commercial ads stopping the lecture flow.'),
                    ('Pure Cinema Interface:', 'Strips away algorithmic feeds, recommendations, and shorts for total study focus.'),
                    ('Zero Barriers to Entry:', 'No account creation, no password fatigue, and no third-party browser extensions needed.')
                ]
            }
        ]
    },
    {
        'num': '2. Target Audience',
        'title': 'Who Is This Platform Built For?',
        'sub': 'Tailored specifically for three high-demand everyday user demographics',
        'cards': [
            {
                'head': '🎓 STUDENTS & STUDY GROUPS',
                'color': '#1A365D',
                'bullets': [
                    ('Playlist Import:', 'Paste entire YouTube course playlists (Gate Smashers, NPTEL, MIT OCW).'),
                    ('Ad-Free Learning:', 'Zero mid-roll commercial interruptions.'),
                    ('No Distractions:', 'Stripped of Shorts and clickbait feeds.'),
                    ('Discussion Pauses:', 'Pause together to discuss difficult concepts and take notes.')
                ]
            },
            {
                'head': '❤️ LONG-DISTANCE COUPLES',
                'color': '#BE185D',
                'bullets': [
                    ('Virtual Date Nights:', 'Watch romantic movies, series, and vlogs together across cities.'),
                    ('Emotional Sync:', 'Laugh and react at the exact same millisecond with sub-100ms sync.'),
                    ('Video Calling:', 'Face-to-face WebRTC video & audio while watching.'),
                    ('Floating Hearts:', 'Send animated live floating reaction emojis.')
                ]
            },
            {
                'head': '🍿 FRIENDS & WATCH PARTIES',
                'color': '#0D9488',
                'bullets': [
                    ('Weekend Marathons:', 'Anime, gaming highlights, comedy sketches, and movie nights.'),
                    ('Democratic Queue:', 'Everyone adds videos and upvotes their favorites.'),
                    ('Live Chat Banter:', 'Threaded messaging with emoji reactions.'),
                    ('Soundboard:', 'Trigger synchronized funny sound effects.')
                ]
            }
        ]
    },
    {
        'num': '3. System Workflow',
        'title': 'How Does SyncTube Work?',
        'sub': 'A seamless 4-step user journey from zero to watching together in under 5 seconds',
        'steps': [
            ('STEP 1', 'Create a Room in 2s', 'Enter your name, pick an optional anime avatar, and click Start Watch Party. No login needed.'),
            ('STEP 2', 'Instant Share & Join', 'Share the auto-generated 6-character room code, direct invite link, or display the scannable QR code.'),
            ('STEP 3', 'Load Video / Playlist', 'Paste any YouTube link, import an entire lecture playlist, or search videos directly in the app.'),
            ('STEP 4', 'Enjoy Synchronized Media', 'Play, pause, seek, chat, vote on the queue, or start video calling. The server coordinates state instantly.')
        ]
    },
    {
        'num': '4. Synchronization Mechanism',
        'title': 'How Do We Keep Everyone in Exact Sync?',
        'sub': 'Authoritative clock offset calculation + 3-Tier Adaptive Drift Guard',
        'sync_slide': True
    },
    {
        'num': '5. Academic Use-Case',
        'title': 'Why Is SyncTube a Game-Changer for Students?',
        'sub': 'Eliminating distractions and commercial interruptions from group study',
        'cards': [
            {
                'head': 'FOCUSED GROUP STUDY & LECTURES',
                'color': '#1A365D',
                'bullets': [
                    ('Bulk Playlist Import:', 'Students can paste entire course playlists (OS, DBMS, DSA). All lectures queue chronologically.'),
                    ('Zero Commercial Ads:', 'Commercials that interrupt professors mid-explanation are completely eliminated.'),
                    ('Distraction-Free Cinema UI:', 'Strips away recommended feeds, clickbait thumbnails, and addictive Shorts.')
                ]
            },
            {
                'head': 'COLLABORATIVE LEARNING TOOLS',
                'color': '#0D9488',
                'bullets': [
                    ('Synchronous Doubt Pausing:', 'When any student pauses to understand a diagram, it pauses for everyone.'),
                    ('In-Room Note Sharing:', 'Students share time-stamped notes, code snippets, and questions directly in chat.'),
                    ('Peer Accountability:', 'Studying together in a virtual room creates healthy study discipline similar to a library.')
                ]
            }
        ]
    },
    {
        'num': '6. Social & Relationship Use-Cases',
        'title': 'Why Do Couples & Friends Love It?',
        'sub': 'Recreating the warmth of physical co-presence across distance',
        'cards': [
            {
                'head': '❤️ FOR LONG-DISTANCE COUPLES',
                'color': '#BE185D',
                'bullets': [
                    ('Zero Spoilers:', 'Sub-100ms sync ensures partners react to emotional twists and jokes at the exact same physical moment.'),
                    ('Face-to-Face Video Calling:', 'Integrated WebRTC calling lets partners see each other live right next to the player.'),
                    ('Floating Emoji Reactions:', 'Heart and celebration particles float over the screen to express real-time affection.')
                ]
            },
            {
                'head': '🍿 FOR FRIENDS & WATCH PARTIES',
                'color': '#0D9488',
                'bullets': [
                    ('Democratic Queue Voting:', 'Everyone queues songs/clips; the group upvotes, and top songs play next automatically.'),
                    ('Live Chat Replies & Banter:', 'Full threaded messaging for funny commentary and group jokes.'),
                    ('Soundboard Effects & Polls:', 'Trigger comedy sound effects and create instant group polls.')
                ]
            }
        ]
    },
    {
        'num': '7. Architectural Sanity',
        'title': 'What About Installation, Privacy & Security?',
        'sub': 'Zero installation, zero DRM circumvention, and zero data harvesting',
        'stack_items': [
            ('ZERO BROWSER EXTENSIONS', 'Runs purely in standard web browsers (Chrome, Edge, Firefox, Safari). No extension installation that scares non-technical users or gets blocked by college IT firewalls.'),
            ('ZERO MANDATORY SIGN-UP', 'Users spin up or join a room in seconds with only a display name and room code. Eliminates account creation fatigue and prevents email spam.'),
            ('ZERO DRM VIOLATIONS', 'SyncTube adheres strictly to copyright law. We do not download, proxy, or re-encode video streams. Video rendering is delegated directly to the official YouTube IFrame player.'),
            ('STRICT BACKEND VALIDATION', 'All WebSocket payloads and REST endpoints pass through runtime Zod schema validation, blocking malformed event injections and protecting room states.')
        ]
    },
    {
        'num': '8. Competitive Matrix',
        'title': 'Why Not Just Use Existing Services?',
        'sub': 'Direct comparison across key usability, technical, and feature dimensions',
        'matrix_slide': True
    },
    {
        'num': '9. System Architecture',
        'title': 'System Architecture & Engineering Stack',
        'sub': 'Built with modern, production-tested full-stack web technologies',
        'arch_slide': True
    },
    {
        'num': '10. Results & Benchmarks',
        'title': 'What Makes the Project Successful?',
        'sub': 'Empirical performance testing and user satisfaction metrics',
        'results_slide': True
    },
    {
        'num': '11. Summary & Roadmap',
        'title': 'Our Core Pitch & Future Roadmap',
        'sub': 'Transforming isolated video watching into a shared, productive, and fun social reality',
        'pitch_slide': True
    }
]

css = '''
@page {
    size: 16in 9in;
    margin: 0;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #ffffff;
    color: #1F2937;
}
.slide {
    width: 16in;
    height: 9in;
    page-break-after: always;
    break-after: page;
    padding: 0.6in 0.9in;
    position: relative;
    background: #ffffff;
    overflow: hidden;
}
.header {
    margin-bottom: 0.35in;
}
.header .badge {
    font-size: 0.85rem;
    font-weight: 700;
    color: #0D9488;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
}
.header h1 {
    font-size: 1.85rem;
    font-weight: 800;
    color: #1A365D;
    margin: 0 0 4px 0;
}
.header .subtitle {
    font-size: 1.05rem;
    color: #4B5563;
    margin: 0;
}
.card {
    background: #F8FAFC;
    border: 1.5px solid #CBD5E1;
    border-radius: 12px;
    padding: 0.35in 0.4in;
    height: 5.6in;
}
.card-head {
    font-size: 1.15rem;
    font-weight: 800;
    margin-bottom: 0.25in;
}
.bullet-item {
    font-size: 0.98rem;
    line-height: 1.45;
    margin-bottom: 0.2in;
}
.bullet-bold {
    font-weight: 700;
    color: #1A365D;
}
.grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4in;
}
.grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.35in;
}
.grid-4 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0.3in;
}

/* Title Slide Styling */
.title-slide {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 0.8in 1.2in;
}
.title-logos {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 40px;
    margin-bottom: 0.3in;
}
.title-logos img {
    height: 1.2in;
}
.title-badge {
    font-size: 0.95rem;
    font-weight: 800;
    color: #0D9488;
    letter-spacing: 1.5px;
    margin-bottom: 0.15in;
}
.title-h1 {
    font-size: 2.5rem;
    font-weight: 900;
    color: #1A365D;
    line-height: 1.2;
    margin: 0 0 0.15in 0;
}
.title-sub {
    font-size: 1.25rem;
    color: #4B5563;
    margin-bottom: 0.4in;
}
.title-info-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    max-width: 11in;
    background: #F8FAFC;
    border: 1.5px solid #CBD5E1;
    border-radius: 12px;
    padding: 0.3in 0.5in;
    text-align: left;
}
.title-info-left {
    border-right: 1.5px solid #E2E8F0;
    padding-right: 0.4in;
}
.title-info-right {
    padding-left: 0.4in;
}
.info-label {
    font-size: 0.8rem;
    font-weight: 800;
    color: #2B5C8F;
    letter-spacing: 1px;
    margin-bottom: 6px;
}
.info-name {
    font-size: 1.1rem;
    font-weight: 800;
    color: #1A365D;
    margin-bottom: 3px;
}
.info-subtext {
    font-size: 0.92rem;
    color: #4B5563;
}

/* Table styling */
.matrix-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    margin-top: 0.1in;
}
.matrix-table th {
    background: #1A365D;
    color: #ffffff;
    font-weight: 700;
    padding: 10px 14px;
    text-align: center;
}
.matrix-table td {
    padding: 9px 14px;
    border: 1px solid #CBD5E1;
    text-align: center;
}
.matrix-table tr:nth-child(even) td {
    background: #F8FAFC;
}
.matrix-table td:first-child {
    text-align: left;
    font-weight: 600;
}
.highlight-col {
    background: #F0FDFA !important;
    color: #0D9488 !important;
    font-weight: 700;
}
'''

html_out = f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>{css}</style></head><body>'

# Slide 1: Title
html_out += '''
<div class="slide title-slide">
    <div class="title-logos">
        <img src="/tmp/ref_logos/college_logo.png" />
        <img src="/tmp/ref_logos/aktu_logo.png" />
    </div>
    <div class="title-badge">B.TECH COMPUTER SCIENCE &amp; ENGINEERING • PROJECT EVALUATION</div>
    <h1 class="title-h1">SyncTube: Real-Time Synchronized Watch Party Platform</h1>
    <div class="title-sub">Simple Questions • Short Answers • Practical Architecture &amp; Live Workflow</div>
    <div class="title-info-card">
        <div class="title-info-left">
            <div class="info-label">SUBMITTED BY:</div>
            <div class="info-name">Krishna Kumar (2303630100089)</div>
            <div class="info-name">Hareram Yadav (2303630100073)</div>
            <div class="info-subtext">B.Tech CSE – Section 4A • Batch: 2026–2027</div>
        </div>
        <div class="title-info-right">
            <div class="info-label">UNDER THE GUIDANCE OF:</div>
            <div class="info-name">MRS. SHIVANGI PANDEY</div>
            <div class="info-subtext">Assistant Professor, Department of CSE</div>
            <div class="info-subtext">Ambalika Institute of Management &amp; Technology, Lucknow</div>
        </div>
    </div>
</div>
'''

for s in slides_data[1:]:
    html_out += f'''
    <div class="slide">
        <div class="header">
            <div class="badge">{s['num']}</div>
            <h1>{s['title']}</h1>
            <div class="subtitle">{s['sub']}</div>
        </div>
    '''
    if 'cards' in s:
        grid_class = 'grid-2' if len(s['cards']) == 2 else 'grid-3'
        html_out += f'<div class="{grid_class}">'
        for c in s['cards']:
            html_out += f'''
            <div class="card">
                <div class="card-head" style="color: {c['color']};">{c['head']}</div>
            '''
            for bold, text in c['bullets']:
                html_out += f'<div class="bullet-item"><span class="bullet-bold">• {bold}</span> {text}</div>'
            html_out += '</div>'
        html_out += '</div>'
    elif 'steps' in s:
        html_out += '<div class="grid-4">'
        for num, title, desc in s['steps']:
            html_out += f'''
            <div class="card" style="padding: 0.35in 0.3in;">
                <div style="font-size: 0.85rem; font-weight: 800; color: #0D9488; margin-bottom: 6px;">{num}</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #1A365D; margin-bottom: 14px;">{title}</div>
                <div style="font-size: 0.95rem; color: #1F2937; line-height: 1.45;">{desc}</div>
            </div>
            '''
        html_out += '</div>'
    elif s.get('sync_slide'):
        html_out += '''
        <div class="grid-2">
            <div class="card">
                <div class="card-head" style="color: #1A365D;">CORE SYNCHRONIZATION PRINCIPLE</div>
                <div style="font-weight: 700; color: #2B5C8F; font-size: 1.05rem; margin-bottom: 0.2in; font-style: italic;">
                    “SyncTube synchronizes the watch experience, not the video stream.”
                </div>
                <div class="bullet-item"><span class="bullet-bold">• NTP Clock Offset Calculation:</span> Clients periodically exchange timestamped heartbeat probes (T0, T_server, T1) to calculate Round-Trip Time (RTT) and network latency.</div>
                <div class="bullet-item"><span class="bullet-bold">• Offset Formula:</span> Δ = T_server - (T0 + RTT / 2). Every client accurately knows the true server clock position.</div>
                <div class="bullet-item"><span class="bullet-bold">• Target Playhead:</span> Pos_target = Pos_base + (T_now + Δ - lastUpdated).</div>
                <div class="bullet-item"><span class="bullet-bold">• Zero Stream Proxying:</span> Video frames are rendered natively via YouTube IFrame API; server only sends tiny JSON timeline sync events.</div>
            </div>
            <div class="card" style="display: flex; align-items: center; justify-content: center; padding: 0.2in;">
                <img src="/tmp/synctube_charts_v2/fig_4_1_sync_flow.png" style="max-width: 98%; max-height: 98%; border-radius: 8px;" />
            </div>
        </div>
        '''
    elif s.get('stack_items'):
        html_out += '<div style="display: flex; flex-direction: column; gap: 0.2in;">'
        for title, desc in s['stack_items']:
            html_out += f'''
            <div style="background: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 10px; padding: 0.2in 0.35in;">
                <div style="font-size: 1.05rem; font-weight: 800; color: #1A365D; margin-bottom: 4px;">{title}</div>
                <div style="font-size: 0.95rem; color: #1F2937; line-height: 1.4;">{desc}</div>
            </div>
            '''
        html_out += '</div>'
    elif s.get('matrix_slide'):
        html_out += '''
        <table class="matrix-table">
            <tr>
                <th>Feature / Dimension</th>
                <th style="background: #0D9488;">SyncTube (Our System)</th>
                <th>Teleparty (Netflix Party)</th>
                <th>Watch2Gether</th>
                <th>Discord Watch Together</th>
            </tr>
            <tr>
                <td>Installation Required</td>
                <td class="highlight-col">Zero Install (Web Native)</td>
                <td>Mandatory Extension</td>
                <td>Zero Install (Web Native)</td>
                <td>Discord App Required</td>
            </tr>
            <tr>
                <td>Account Creation</td>
                <td class="highlight-col">Optional (Instant Code)</td>
                <td>Mandatory Sign-Up</td>
                <td>Optional</td>
                <td>Mandatory Discord Acct</td>
            </tr>
            <tr>
                <td>Ad-Free Cinema Stage</td>
                <td class="highlight-col">Yes (No Ads / No Feeds)</td>
                <td>No (Standard UI)</td>
                <td>No (Heavy Banner Ads)</td>
                <td>No (Discord Overlay)</td>
            </tr>
            <tr>
                <td>Playlist Queue &amp; Voting</td>
                <td class="highlight-col">Full Import &amp; Upvoting</td>
                <td>No Playlist Import</td>
                <td>Basic Manual Queue</td>
                <td>Basic Queue Only</td>
            </tr>
            <tr>
                <td>Playout Sync Precision</td>
                <td class="highlight-col">Sub-100ms (NTP + Skew)</td>
                <td>300ms – 1200ms</td>
                <td>250ms – 800ms</td>
                <td>150ms – 500ms</td>
            </tr>
            <tr>
                <td>Built-in Video Calling</td>
                <td class="highlight-col">WebRTC Video/Audio Call</td>
                <td>Text Chat Only</td>
                <td>Laggy P2P Mesh</td>
                <td>Discord Voice/Video</td>
            </tr>
            <tr>
                <td>Mobile Phone Usability</td>
                <td class="highlight-col">Dedicated Touch Dock</td>
                <td>No Mobile Support</td>
                <td>Limited Mobile Web</td>
                <td>Mobile App Only</td>
            </tr>
        </table>
        '''
    elif s.get('arch_slide'):
        html_out += '''
        <div class="grid-2">
            <div class="card" style="display: flex; align-items: center; justify-content: center; padding: 0.2in;">
                <img src="/tmp/synctube_charts_v2/fig_3_1_architecture.png" style="max-width: 98%; max-height: 98%; border-radius: 8px;" />
            </div>
            <div class="card">
                <div class="card-head" style="color: #1A365D;">CORE TECHNOLOGY STACK</div>
                <div class="bullet-item"><span class="bullet-bold">• Client Frontend:</span> React 18/19, TypeScript, Vite, Glassmorphic CSS with ambient player lighting.</div>
                <div class="bullet-item"><span class="bullet-bold">• Real-Time Engine:</span> Node.js, Express, Socket.IO v4 full-duplex WebSocket bus with Zod schema validation.</div>
                <div class="bullet-item"><span class="bullet-bold">• Media Calling:</span> WebRTC (RFC 8825) with Google STUN and configurable TURN traversal.</div>
                <div class="bullet-item"><span class="bullet-bold">• Data Tier:</span> In-Memory volatile store (sub-millisecond room state) + PostgreSQL history database.</div>
                <div class="bullet-item"><span class="bullet-bold">• Cloud Edge:</span> Deployed on Vercel CDN (Frontend) and Render Cloud (Backend Server).</div>
            </div>
        </div>
        '''
    elif s.get('results_slide'):
        html_out += '''
        <div class="grid-2">
            <div class="card" style="display: flex; align-items: center; justify-content: center; padding: 0.2in;">
                <img src="/tmp/synctube_charts_v2/chart_7_1_drift.png" style="max-width: 98%; max-height: 98%; border-radius: 8px;" />
            </div>
            <div class="card" style="display: flex; align-items: center; justify-content: center; padding: 0.2in;">
                <img src="/tmp/synctube_charts_v2/chart_7_3_personas.png" style="max-width: 98%; max-height: 98%; border-radius: 8px;" />
            </div>
        </div>
        '''
    elif s.get('pitch_slide'):
        html_out += '''
        <div style="display: flex; flex-direction: column; gap: 0.3in;">
            <div style="background: #F0FDFA; border: 2px solid #0D9488; border-radius: 12px; padding: 0.35in 0.5in;">
                <div style="font-size: 1.15rem; font-weight: 800; color: #0D9488; margin-bottom: 0.1in;">🎯 OUR CORE PITCH</div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #1A365D; line-height: 1.45;">
                    “SyncTube brings people together to watch YouTube in perfect real-time sync. With zero ads, zero algorithmic distractions, instant 6-character room codes, collaborative playlist voting, and integrated video calling, it is the ultimate shared viewing platform for students, couples, and friends.”
                </div>
            </div>
            <div class="card" style="height: auto; padding: 0.35in 0.5in;">
                <div class="card-head" style="color: #1A365D; margin-bottom: 0.2in;">🚀 FUTURE SCOPE &amp; ENHANCEMENTS</div>
                <div class="bullet-item"><span class="bullet-bold">• Multi-Region Redis Pub/Sub Cluster:</span> Scale room state horizontally across global cloud servers for international watch parties.</div>
                <div class="bullet-item"><span class="bullet-bold">• Progressive Web App (PWA):</span> Enable mobile background audio and Picture-in-Picture (PiP) support for smartphones.</div>
                <div class="bullet-item"><span class="bullet-bold">• AI Real-Time Subtitles:</span> On-device speech-to-text generating real-time multilingual subtitles for educational lectures.</div>
            </div>
        </div>
        '''
    html_out += '</div>'

html_out += '</body></html>'

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_out)

cmd = [
    'google-chrome',
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--run-all-compositor-stages-before-draw',
    f'--print-to-pdf={pdf_path}',
    '--no-pdf-header-footer',
    html_path
]
subprocess.run(cmd, check=True)
print(f'Presentation PDF successfully generated at: {pdf_path}')

